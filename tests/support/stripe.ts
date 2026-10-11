/**
 * テスト用の偽の Stripe（Stripe にも外部の DB にも通信しない）
 * ---------------------------------------------------
 * 決済の確認・注文の確定・Webhook のテストが共有する。`tests/*.test.ts` のグロブには当たらないので、テストとしては実行されない。
 * Stripe のクライアントは getStripe() を引数で受ける形（lib/checkout-session.ts の StripeLike）なので、これを差し込む。
 */
import type Stripe from "stripe";
import { getProductById } from "../../lib/catalog.ts";
import { CHECKOUT_CURRENCY, encodeOrderMetadata } from "../../lib/checkout.ts";
import type { StripeLike } from "../../lib/checkout-session.ts";
import type { ItemQuantity } from "../../lib/types.ts";

/** Stripe の例外文に秘密が入っていても、外へ（応答にもログの対象にも）出ないことを確かめるための文字列 */
export const STRIPE_ERROR_TEXT =
  "sk_live_SECRET_DETAIL stack at Stripe.request";

/** 買った品目の合計（カタログの今の価格 × 数量）。Stripe の本物の session の amount_total と同じ値 */
export function totalOf(items: ItemQuantity[]): number {
  return items.reduce(
    (sum, { id, quantity }) =>
      sum + (getProductById(id)?.price ?? 0) * quantity,
    0,
  );
}

/**
 * 支払い済み（payment_status が paid）の Checkout Session。metadata は購入した id と数量。
 * 本物の session と同じく、請求額（amount_total。品目の合計）と通貨（jpy）を持つ。照合で食い違う session は extra で上書きして作る
 */
export function paidSession(
  id: string,
  items: ItemQuantity[],
  extra: Record<string, unknown> = {},
) {
  return {
    id,
    payment_status: "paid",
    metadata: encodeOrderMetadata(items),
    amount_total: totalOf(items),
    currency: CHECKOUT_CURRENCY,
    ...extra,
  };
}

/**
 * retrieve に渡された id を記録する偽の Stripe。
 *  - sessions に入れた id の Checkout Session を返す（テストの途中で書き換えてよい）
 *  - cs_test_missing は 404（存在しない session）、それ以外の知らない id は 500（秘密を含む例外文）
 *  - waitFor を渡すと、retrieve が waitFor 回呼ばれるまで全員の応答を止める。同時に来た呼び出しが
 *    「DB にまだ注文が無い」と見たまま、そろって書き込みに進む競合を作るのに使う（止めなければ、先の呼び出しが
 *    書き終えてから後の呼び出しが DB を見ることがあり、競合に当たらない）
 */
export function fakeStripe(
  sessions: Record<string, unknown>,
  { waitFor = 0 }: { waitFor?: number } = {},
) {
  const retrieved: string[] = [];
  let arrived: () => void = () => {};
  const allArrived = new Promise<void>((resolve) => {
    arrived = resolve;
  });
  const stripe: StripeLike = {
    checkout: {
      sessions: {
        async create(): Promise<{ url: string | null }> {
          throw new Error(
            "決済の確認・注文の確定で sessions.create は呼ばれないはず",
          );
        },
        async retrieve(id: string) {
          retrieved.push(id);
          if (waitFor > 0) {
            if (retrieved.length >= waitFor) arrived();
            await allArrived;
          }
          if (id in sessions) return sessions[id];
          if (id === "cs_test_missing")
            throw Object.assign(new Error("No such session"), {
              statusCode: 404,
            });
          throw Object.assign(new Error(STRIPE_ERROR_TEXT), {
            statusCode: 500,
          });
        },
      },
    },
  };
  return { retrieved, sessions, getStripe: () => stripe };
}

/**
 * Checkout Session を作る側（sessions.create）の偽の Stripe。create に渡された引数を created に記録し、決済ページの URL を返す。
 * fail を渡すと create が（秘密を含む文の）例外で失敗する。retrieve は呼ばれないはず
 */
export function fakeCheckoutStripe({ fail = false }: { fail?: boolean } = {}) {
  const created: Stripe.Checkout.SessionCreateParams[] = [];
  const stripe: StripeLike = {
    checkout: {
      sessions: {
        async create(params): Promise<{ url: string | null }> {
          created.push(params);
          if (fail) throw new Error(STRIPE_ERROR_TEXT);
          return { url: "https://checkout.stripe.test/pay" };
        },
        async retrieve(): Promise<unknown> {
          throw new Error("決済の作成で sessions.retrieve は呼ばれないはず");
        },
      },
    },
  };
  return { created, getStripe: () => stripe };
}
