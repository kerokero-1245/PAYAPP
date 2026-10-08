/**
 * GraphQL の handler（graphql-yoga）
 * ---------------------------------------------------
 * createGraphqlHandler({ getStripe }) は fetch(Request) → Response の関数を返す。
 * app/api/graphql/route.ts が本物の getStripe を渡し、tests/graphql.test.mjs は偽の Stripe を渡す。
 *
 * - 本文は 4KB 上限（超えたら 413）。yoga に渡す前に当てる（/checkout の 16KB とは別の値）
 * - POST は Content-Type が application/json のものだけ受け付ける（フォーム送信を通さない）
 * - Stripe を呼ぶフィールド（createCheckoutSession・orderBySession）は 1 リクエスト合計 1 つまで
 * - Mutation のフィールドは 1 リクエスト 1 つまで
 * - 選択するフィールドの総数（エイリアス・同名の重複・フラグメントの展開を含む）は 200 まで
 * - maskedErrors を明示的に有効にし、Stripe の例外文やスタックを返さない
 */
import { GraphQLError, Kind } from "graphql";
import type {
  FragmentDefinitionNode,
  SelectionSetNode,
  ValidationContext,
  ValidationRule,
} from "graphql";
import { createYoga } from "graphql-yoga";
import type { Plugin } from "graphql-yoga";
import {
  UNSUPPORTED_MEDIA_TYPE,
  isJsonContentType,
  readBodyWithLimit,
} from "../checkout-session.mjs";
import { schema } from "./schema.ts";
import type { GraphqlContext } from "./schema.ts";

export const GRAPHQL_ENDPOINT = "/api/graphql";
/** GraphQL の本文の上限（バイト）。クエリ文と変数だけなので /checkout より小さくする */
export const MAX_GRAPHQL_BODY_BYTES = 4 * 1024;
export const MAX_MUTATION_FIELDS = 1;
/** 1 リクエストで Stripe を呼ぶフィールドの数の上限 */
export const MAX_STRIPE_FIELDS = 1;
/** 1 リクエストで選択できるフィールドの総数の上限 */
export const MAX_SELECTED_FIELDS = 200;
/** 解析・検証結果をキャッシュするクエリ文の件数（既定の 1024 から絞る） */
export const PARSE_CACHE_MAX = 100;
/** Stripe に要求を出すフィールド */
export const STRIPE_FIELDS = new Set(["createCheckoutSession", "orderBySession"]);

export const TOO_MANY_MUTATIONS = "1 回のリクエストで実行できる Mutation は 1 つまでです";
export const TOO_MANY_STRIPE_FIELDS =
  "1 回のリクエストで実行できる決済の操作（createCheckoutSession・orderBySession）は 1 つまでです";
export const TOO_MANY_FIELDS = `1 回のリクエストで選択できるフィールドは ${MAX_SELECTED_FIELDS} までです`;
const TOO_LARGE = "リクエストが大きすぎます";
const BAD_REQUEST = "リクエストの形式が不正です";

/**
 * ルートの選択セットのうち、条件に合うフィールドの数（フラグメントを展開する）。
 * @include / @skip は見ずに数える（実行時の変数で増やせないように）。
 */
function countRootFields(
  selectionSet: SelectionSetNode,
  context: ValidationContext,
  match: (name: string) => boolean,
  seen: Set<string>
): number {
  let count = 0;
  for (const selection of selectionSet.selections) {
    if (selection.kind === Kind.FIELD) {
      if (match(selection.name.value)) count += 1;
    } else if (selection.kind === Kind.INLINE_FRAGMENT) {
      count += countRootFields(selection.selectionSet, context, match, seen);
    } else if (selection.kind === Kind.FRAGMENT_SPREAD) {
      const name = selection.name.value;
      if (seen.has(name)) continue;
      seen.add(name);
      const fragment = context.getFragment(name);
      if (fragment) count += countRootFields(fragment.selectionSet, context, match, seen);
    }
  }
  return count;
}

/** Mutation のフィールド（__typename を除く）を 1 リクエストに 1 つまでにする */
export const singleMutationRule: ValidationRule = (context) => ({
  OperationDefinition(node) {
    if (node.operation !== "mutation") return;
    const n = countRootFields(node.selectionSet, context, (f) => f !== "__typename", new Set());
    if (n > MAX_MUTATION_FIELDS) {
      context.reportError(new GraphQLError(TOO_MANY_MUTATIONS, { nodes: [node] }));
    }
  },
});

/**
 * Stripe を呼ぶフィールドを 1 リクエスト合計 1 つまでにする。
 * 同じフラグメントを何度展開しても、その中身を毎回数える。
 */
export const singleStripeFieldRule: ValidationRule = (context) => ({
  OperationDefinition(node) {
    const count = (set: SelectionSetNode, stack: Set<string>): number => {
      let n = 0;
      for (const s of set.selections) {
        if (s.kind === Kind.FIELD) {
          if (STRIPE_FIELDS.has(s.name.value)) n += 1;
        } else if (s.kind === Kind.INLINE_FRAGMENT) {
          n += count(s.selectionSet, stack);
        } else if (s.kind === Kind.FRAGMENT_SPREAD) {
          const name = s.name.value;
          const fragment = context.getFragment(name);
          // 循環は別の規則（NoFragmentCycles）が弾く。ここでは無限再帰だけ防ぐ
          if (!fragment || stack.has(name)) continue;
          n += count(fragment.selectionSet, new Set([...stack, name]));
        }
        if (n > MAX_STRIPE_FIELDS) return n;
      }
      return n;
    };
    if (count(node.selectionSet, new Set()) > MAX_STRIPE_FIELDS) {
      context.reportError(new GraphQLError(TOO_MANY_STRIPE_FIELDS, { nodes: [node] }));
    }
  },
});

/**
 * 選択するフィールドの総数を 200 までにする。エイリアス・同名フィールドの重複は 1 つずつ数え、
 * フラグメントは展開した回数だけ数える（フラグメントごとの数はメモして指数的な展開を避ける）。
 */
export const maxSelectedFieldsRule: ValidationRule = (context) => {
  const memo = new Map<string, number>();
  const countSet = (set: SelectionSetNode, stack: Set<string>): number => {
    let n = 0;
    for (const s of set.selections) {
      if (s.kind === Kind.FIELD) {
        n += 1;
        if (s.selectionSet) n += countSet(s.selectionSet, stack);
      } else if (s.kind === Kind.INLINE_FRAGMENT) {
        n += countSet(s.selectionSet, stack);
      } else if (s.kind === Kind.FRAGMENT_SPREAD) {
        n += countFragment(context.getFragment(s.name.value), stack);
      }
      if (n > MAX_SELECTED_FIELDS) return n;
    }
    return n;
  };
  const countFragment = (
    fragment: FragmentDefinitionNode | null | undefined,
    stack: Set<string>
  ): number => {
    if (!fragment) return 0;
    const name = fragment.name.value;
    const cached = memo.get(name);
    if (cached !== undefined) return cached;
    if (stack.has(name)) return 0;
    const n = countSet(fragment.selectionSet, new Set([...stack, name]));
    memo.set(name, n);
    return n;
  };
  return {
    OperationDefinition(node) {
      if (countSet(node.selectionSet, new Set()) > MAX_SELECTED_FIELDS) {
        context.reportError(new GraphQLError(TOO_MANY_FIELDS, { nodes: [node] }));
      }
    },
  };
};

const limitsPlugin: Plugin = {
  onValidate({ addValidationRule }) {
    addValidationRule(singleMutationRule);
    addValidationRule(singleStripeFieldRule);
    addValidationRule(maxSelectedFieldsRule);
  },
};

/** 件数に上限のある小さなキャッシュ（Map の挿入順で古いものから捨てる） */
function boundedCache<T>(max: number) {
  const map = new Map<string, T>();
  return {
    get(key: string): T | undefined {
      const value = map.get(key);
      if (value !== undefined) {
        map.delete(key);
        map.set(key, value);
      }
      return value;
    },
    set(key: string, value: T): void {
      map.delete(key);
      map.set(key, value);
      while (map.size > max) {
        const oldest = map.keys().next();
        if (oldest.done) break;
        map.delete(oldest.value);
      }
    },
  };
}

type HandlerOptions = {
  /** Stripe クライアントを返す関数（リクエストのたびに呼ぶ） */
  getStripe: GraphqlContext["getStripe"];
  /** 決済後の戻り先の基準（NEXT_PUBLIC_BASE_URL）。無ければリクエスト URL の origin */
  baseUrl?: string;
};

function jsonError(message: string, status: number): Response {
  return Response.json({ errors: [{ message }] }, { status });
}

export function createGraphqlHandler({ getStripe, baseUrl }: HandlerOptions) {
  const yoga = createYoga<object, GraphqlContext>({
    schema,
    graphqlEndpoint: GRAPHQL_ENDPOINT,
    maskedErrors: { isDev: false },
    parserAndValidationCache: {
      documentCache: boundedCache(PARSE_CACHE_MAX),
      errorCache: boundedCache(PARSE_CACHE_MAX),
    },
    plugins: [limitsPlugin],
    context: ({ request }) => ({ request, getStripe, baseUrl }),
  });

  /** Content-Type と本文の上限を先に当ててから yoga に渡す */
  async function fetch(request: Request): Promise<Response> {
    if (request.method !== "POST") return yoga.fetch(request);

    if (!isJsonContentType(request.headers.get("content-type"))) {
      return jsonError(UNSUPPORTED_MEDIA_TYPE, 415);
    }
    let text: string | null;
    try {
      text = await readBodyWithLimit(request, MAX_GRAPHQL_BODY_BYTES);
    } catch {
      return jsonError(BAD_REQUEST, 400);
    }
    if (text === null) return jsonError(TOO_LARGE, 413);

    // 読み終えた本文で Request を作り直す（URL・ヘッダーはそのまま）
    const headers = new Headers(request.headers);
    headers.delete("content-length");
    return yoga.fetch(
      new Request(request.url, { method: "POST", headers, body: text, signal: request.signal })
    );
  }

  return { fetch };
}
