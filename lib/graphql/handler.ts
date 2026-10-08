/**
 * GraphQL の handler（graphql-yoga）
 * ---------------------------------------------------
 * createGraphqlHandler({ getStripe }) は fetch(Request) → Response の関数を返す。
 * app/api/graphql/route.ts が本物の getStripe を渡し、tests/graphql.test.mjs は偽の Stripe を渡す。
 *
 * - 本文は /checkout と同じ 16KB 上限（超えたら 413）。yoga に渡す前に当てる
 * - POST は Content-Type が application/json のものだけ受け付ける（フォーム送信を通さない）
 * - 1 リクエストあたり Mutation のフィールドは 1 つまで（エイリアスで Stripe に何度も要求させない）
 * - maskedErrors を明示的に有効にし、Stripe の例外文やスタックを返さない
 */
import { GraphQLError, Kind } from "graphql";
import type { SelectionSetNode, ValidationContext, ValidationRule } from "graphql";
import { createYoga } from "graphql-yoga";
import type { Plugin } from "graphql-yoga";
import { MAX_BODY_BYTES } from "../checkout.mjs";
import {
  UNSUPPORTED_MEDIA_TYPE,
  isJsonContentType,
  readBodyWithLimit,
} from "../checkout-session.mjs";
import { schema } from "./schema.ts";
import type { GraphqlContext } from "./schema.ts";

export const GRAPHQL_ENDPOINT = "/api/graphql";
export const MAX_MUTATION_FIELDS = 1;
export const TOO_MANY_MUTATIONS = "1 回のリクエストで実行できる Mutation は 1 つまでです";
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

const limitsPlugin: Plugin = {
  onValidate({ addValidationRule }) {
    addValidationRule(singleMutationRule);
  },
};

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
      text = await readBodyWithLimit(request, MAX_BODY_BYTES);
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
