/**
 * テスト用の偽の Stripe（Stripe にも外部の DB にも通信しない）
 * ---------------------------------------------------
 * 決済の確認・注文の確定・Webhook のテストが共有する。`tests/*.test.ts` のグロブには当たらないので、テストとしては実行されない。
 * Stripe のクライアントは getStripe() を引数で受ける形（lib/checkout-session.ts の StripeLike）なので、これを差し込む。
 */
import { encodeOrderMetadata } from "../../lib/checkout.ts";
import type { StripeLike } from "../../lib/checkout-session.ts";
import type { ItemQuantity } from "../../lib/types.ts";

/** Stripe の例外文に秘密が入っていても、外へ（応答にもログの対象にも）出ないことを確かめるための文字列 */
export const STRIPE_ERROR_TEXT =
  "sk_live_SECRET_DETAIL stack at Stripe.request";

/** 支払い済み（payment_status が paid）の Checkout Session。metadata は購入した id と数量 */
export function paidSession(
  id: string,
  items: ItemQuantity[],
  extra: Record<string, unknown> = {},
) {
  return {
    id,
    payment_status: "paid",
    metadata: encodeOrderMetadata(items),
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
