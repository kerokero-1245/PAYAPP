/**
 * GraphQL の resolver（無状態）
 * ---------------------------------------------------
 * 既存の純粋な関数（lib/catalog.mjs・lib/checkout.mjs）と、/checkout と共有する
 * createCheckoutSessionCore（lib/checkout-session.mjs）を呼ぶだけで、サーバに状態を持たない。
 * Stripe は context.getStripe() 経由でだけ触る（server-only の Stripe クライアントのモジュールは import しない）。
 */
import { createSchema } from "graphql-yoga";
import { CATEGORIES, PRODUCTS, getProductById } from "../catalog.mjs";
import {
  CHECKOUT_ERRORS,
  isSessionPaid,
  isStripeNotFound,
  isValidSessionId,
  normalizeOrderItems,
  orderFromSession,
} from "../checkout.mjs";
import { createCheckoutSessionCore } from "../checkout-session.mjs";
import { typeDefs } from "./sdl.ts";
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
  getStripe: () => any; // eslint-disable-line @typescript-eslint/no-explicit-any -- stripe の型に依存させない（偽の Stripe を差し込むため）
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
function toCartItems(items: { id: string; quantity: number }[]): CartItem[] {
  return items.map(({ id, quantity }) => {
    const product = findProduct(id);
    return { product, quantity, subtotal: product.price * quantity };
  });
}

/** app/product/page.js と同じ絞り込み（カテゴリ → 小文字の部分一致） */
function filterProducts(category?: string | null, q?: string | null): Product[] {
  const slug = CATEGORIES.find((c) => c.slug === (category ?? "all"))?.slug ?? "all";
  const query = (q ?? "").trim().toLowerCase();
  return PRODUCTS.filter((p) => {
    if (slug !== "all" && p.category !== slug) return false;
    if (!query) return true;
    const p2: { tagline?: string; description?: string } = p;
    const haystack = `${p.name} ${p2.tagline ?? ""} ${p2.description ?? ""}`.toLowerCase();
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
      if (!normalized.ok) return { quote: null, errors: [toUserError(normalized.error)] };
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
    orderBySession: async (_parent, { sessionId }, context) => {
      // 形の不正な id は実在しうる決済の参照ではない（既存の 400 → unpaid と同じ扱い）
      if (!isValidSessionId(sessionId)) return { state: "UNPAID", order: null };
      let session;
      try {
        session = await context.getStripe().checkout.sessions.retrieve(sessionId);
      } catch (err) {
        if (isStripeNotFound(err)) return { state: "UNPAID", order: null };
        // それ以外は「確認できなかった」。例外の中身は maskedErrors で利用者に返さない
        throw err;
      }
      if (!isSessionPaid(session)) return { state: "UNPAID", order: null };
      const result = orderFromSession(session);
      if (!result.ok) throw new Error(result.error);
      const { order } = result;
      // orderFromSession は JSDoc で items を object[] と書いているので、形をここで明示する
      const items = toCartItems(order.items as { id: string; quantity: number }[]);
      return {
        state: "PAID",
        order: { sessionId: order.sessionId, items, total: order.total },
      };
    },
  },
  Mutation: {
    createCheckoutSession: async (_parent, { items }, context) => {
      const result = await createCheckoutSessionCore({
        items,
        requestUrl: context.request.url,
        baseUrl: context.baseUrl,
        getStripe: context.getStripe,
      });
      if (result.ok) return { url: result.url, errors: [] };
      if (result.kind === "invalid") return { url: null, errors: [toUserError(result.error)] };
      console.error("GraphQL checkout error:", result.cause);
      return {
        url: null,
        errors: [{ code: "STRIPE_UNAVAILABLE", message: STRIPE_UNAVAILABLE_MESSAGE }],
      };
    },
  },
};

export const schema = createSchema<GraphqlContext>({ typeDefs, resolvers });
