/**
 * GraphQL の resolver
 * ---------------------------------------------------
 * 既存の純粋な関数（lib/catalog.ts・lib/checkout.ts）と、/checkout と共有する
 * createCheckoutSessionCore（lib/checkout-session.ts）、注文を確定する fulfillCheckout（lib/fulfillment.ts）を呼ぶだけで、
 * resolver 自身は状態を持たない（カートはブラウザ。注文は DB）。
 * Stripe・DB・ログイン中の利用者は context.getStripe() / getDb() / getViewer() 経由でだけ触る（server-only のモジュールは import しない）。
 * DB を引くのは orderBySession と、ログインの cookie を持つ人の viewer・createCheckoutSession だけ
 * （cookie の無い人（ゲスト）の要求は、ほかのフィールドと同じく DB に繋がない）。
 */
import { createSchema } from "graphql-yoga";
import { CATEGORIES, PRODUCTS, getProductById } from "../catalog.ts";
import {
  CHECKOUT_ERRORS,
  isValidSessionId,
  normalizeOrderItems,
} from "../checkout.ts";
import { createCheckoutSessionCore } from "../checkout-session.ts";
import type { StripeLike } from "../checkout-session.ts";
import type { Db } from "../db/connect.ts";
import { fulfillCheckout } from "../fulfillment.ts";
import type { StoredOrder } from "../fulfillment.ts";
import { typeDefs } from "./sdl.ts";
import type { ItemQuantity, Viewer } from "../types.ts";
import type {
  CartItem,
  CheckoutErrorCode,
  Product,
  Resolvers,
  UserError,
} from "./__generated__/types.ts";

/** resolver が受け取る context（handler.ts が組み立てる） */
export type GraphqlContext = {
  request: Request;
  getStripe: () => StripeLike;
  /** DB を返す関数（orderBySession が呼んだときだけ呼ばれる） */
  getDb: () => Promise<Db>;
  /**
   * ログイン中の利用者を返す関数（ログインしていなければ null）。viewer・createCheckoutSession が呼んだときだけ呼ばれ、
   * 1 リクエストの中では 1 回しか引かない（handler.ts がそう包む）。引けなければ例外
   */
  getViewer: () => Promise<Viewer | null>;
  baseUrl?: string;
};

/** Stripe に届かなかったときの利用者向けの文言（/checkout の 500 と同じ） */
export const STRIPE_UNAVAILABLE_MESSAGE =
  "決済セッションの作成に失敗しました。時間をおいてもう一度お試しください";

const ERROR_CODES: Record<string, CheckoutErrorCode> = {
  [CHECKOUT_ERRORS.empty]: "EMPTY",
  [CHECKOUT_ERRORS.tooMany]: "TOO_MANY",
  [CHECKOUT_ERRORS.unknownItem]: "UNKNOWN_ITEM",
  [CHECKOUT_ERRORS.badQuantity]: "BAD_QUANTITY",
};

/** normalizeOrderItems の文言を UserError にする（文言は CHECKOUT_ERRORS のまま。入力値は入れない） */
function toUserError(message: string): UserError {
  return { code: ERROR_CODES[message] ?? "UNKNOWN_ITEM", message };
}

function findProduct(id: string): Product {
  const product = getProductById(id);
  if (!product) throw new Error(`catalog に無い id: ${id}`);
  return product;
}

/** 検査済みの { id, quantity } からカートの行を作る（価格はカタログ） */
function toCartItems(items: ItemQuantity[]): CartItem[] {
  return items.map(({ id, quantity }) => {
    const product = findProduct(id);
    return { product, quantity, subtotal: product.price * quantity };
  });
}

/**
 * DB の注文から GraphQL の Order を作る。小計は購入した時点の単価（DB の写し）× 数量で、product.price（カタログの今の価格）とは限らない。
 * product はカタログから引く（カタログから消えた商品を含む注文は、ここで例外になり GraphQL エラーになる）。
 */
function toGraphqlOrder(order: StoredOrder) {
  return {
    orderNo: order.orderNo,
    sessionId: order.sessionId,
    total: order.total,
    items: order.items.map(({ id, price, quantity }): CartItem => ({
      product: findProduct(id),
      quantity,
      subtotal: price * quantity,
    })),
  };
}

/** app/product/page.tsx と同じ絞り込み（カテゴリ → 小文字の部分一致） */
function filterProducts(
  category?: string | null,
  q?: string | null,
): Product[] {
  const slug =
    CATEGORIES.find((c) => c.slug === (category ?? "all"))?.slug ?? "all";
  const query = (q ?? "").trim().toLowerCase();
  return PRODUCTS.filter((p) => {
    if (slug !== "all" && p.category !== slug) return false;
    if (!query) return true;
    const haystack =
      `${p.name} ${p.tagline ?? ""} ${p.description ?? ""}`.toLowerCase();
    return haystack.includes(query);
  });
}

export const resolvers: Resolvers<GraphqlContext> = {
  Query: {
    categories: () => CATEGORIES,
    products: (_parent, { category, q }) => filterProducts(category, q),
    product: (_parent, { id }) => getProductById(id) ?? null,
    cartQuote: (_parent, { items }) => {
      const normalized = normalizeOrderItems(items);
      if (!normalized.ok)
        return { quote: null, errors: [toUserError(normalized.error)] };
      const lines = toCartItems(normalized.items);
      return {
        quote: {
          items: lines,
          total: lines.reduce((sum, l) => sum + l.subtotal, 0),
          totalQuantity: lines.reduce((sum, l) => sum + l.quantity, 0),
        },
        errors: [],
      };
    },
    viewer: (_parent, _args, context) => context.getViewer(),
    orderBySession: async (_parent, { sessionId }, context) => {
      // 形の不正な id は実在しうる決済の参照ではない（既存の 400 → unpaid と同じ扱い）
      if (!isValidSessionId(sessionId)) return { state: "UNPAID", order: null };
      // DB に確定済みならそれを返し、無ければ Stripe に 1 回だけ照会して確定する（成功ページ・Webhook と同じ fulfillCheckout）
      const result = await fulfillCheckout({
        db: await context.getDb(),
        getStripe: context.getStripe,
        sessionId,
      });
      switch (result.status) {
        case "fulfilled":
          return { state: "PAID", order: toGraphqlOrder(result.order) };
        case "unpaid":
        case "invalid-session-id":
          return { state: "UNPAID", order: null };
        case "stripe-error":
          // 「確認できなかった」。例外の中身は maskedErrors で利用者に返さない
          throw result.cause;
        case "unreadable-order":
          throw new Error(result.error);
      }
    },
  },
  Mutation: {
    createCheckoutSession: async (_parent, { items }, context) => {
      // 持ち主はサーバがセッションから引く（引数には持たせない）。引けなければ例外（利用者には既定の文言が返る）
      const viewer = await context.getViewer();
      const result = await createCheckoutSessionCore({
        items,
        requestUrl: context.request.url,
        baseUrl: context.baseUrl,
        userId: viewer?.id,
        getStripe: context.getStripe,
      });
      if (result.ok) return { url: result.url, errors: [] };
      if (result.kind === "invalid")
        return { url: null, errors: [toUserError(result.error)] };
      console.error("GraphQL checkout error:", result.cause);
      return {
        url: null,
        errors: [
          { code: "STRIPE_UNAVAILABLE", message: STRIPE_UNAVAILABLE_MESSAGE },
        ],
      };
    },
  },
};

export const schema = createSchema<GraphqlContext>({ typeDefs, resolvers });
