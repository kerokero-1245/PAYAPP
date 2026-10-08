/**
 * Stripe Checkout Session の作成（/checkout と GraphQL の Mutation で共有する本体）
 * ---------------------------------------------------
 * - readBodyWithLimit: リクエスト本文を上限つきで読む（超えたら null）
 * - createCheckoutSessionCore: 検査・価格決定・戻り先の決定・sessions.create をまとめて行う
 *
 * Stripe クライアントは引数の getStripe() から受け取る（lib/stripe.js は server-only なので
 * ここでは import しない。node --test から偽の Stripe を差し込めるようにするため）。
 */
import { buildLineItems, encodeOrderMetadata } from "./checkout.mjs";
import { resolveReturnOrigin } from "./site.mjs";

/** 本文を上限つきで読む。上限を超えたら null */
export async function readBodyWithLimit(request, limit) {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limit) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

/**
 * Checkout Session を作る。価格と商品名はカタログから引き、送られた price / name は使わない。
 * 購入した id と数量は session の metadata に持たせる。
 *
 * @param {{ items: unknown, requestUrl: string, baseUrl?: string, getStripe: () => any }} input
 * @returns {Promise<
 *   | { ok: true, url: string }
 *   | { ok: false, kind: "invalid", error: string }
 *   | { ok: false, kind: "stripe", cause: unknown }
 * >}
 */
export async function createCheckoutSessionCore({ items, requestUrl, baseUrl, getStripe }) {
  const result = buildLineItems(items);
  if (!result.ok) return { ok: false, kind: "invalid", error: result.error };

  try {
    // 戻り先は NEXT_PUBLIC_BASE_URL、無ければリクエスト URL の origin（Origin ヘッダーは使わない）
    const origin = resolveReturnOrigin({ requestUrl, baseUrl });
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      line_items: result.lineItems,
      metadata: encodeOrderMetadata(result.items),
      // {CHECKOUT_SESSION_ID} は Stripe が実際の session id に置き換える。
      // 成功ページはこの id で決済状況を確認してから注文を記録する。
      success_url: `${origin}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/cancel`,
    });
    return { ok: true, url: session.url };
  } catch (cause) {
    return { ok: false, kind: "stripe", cause };
  }
}
