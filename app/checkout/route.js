import { getStripe } from "@/lib/stripe";
import { buildLineItems, encodeOrderMetadata, MAX_BODY_BYTES } from "@/lib/checkout.mjs";
import { resolveReturnOrigin } from "@/lib/site.mjs";

const TOO_LARGE = "リクエストが大きすぎます";
const BAD_REQUEST = "リクエストの形式が不正です";

/** 本文を上限つきで読む。上限を超えたら null */
async function readBodyWithLimit(request, limit) {
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
 * Stripe Checkout Session を作成する。
 * クライアントからは { items: [{ id, quantity }] } だけを受け取り、
 * 価格と商品名はサーバ側のカタログ（lib/catalog.mjs）から引く。
 * 購入した id と数量は session の metadata に持たせ、成功ページの確認で注文を作るのに使う。
 */
export async function POST(request) {
  let text;
  try {
    text = await readBodyWithLimit(request, MAX_BODY_BYTES);
  } catch {
    return Response.json({ error: BAD_REQUEST }, { status: 400 });
  }
  if (text === null) return Response.json({ error: TOO_LARGE }, { status: 413 });

  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return Response.json({ error: BAD_REQUEST }, { status: 400 });
  }

  const result = buildLineItems(body?.items);
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 400 });
  }

  try {
    // 戻り先は NEXT_PUBLIC_BASE_URL、無ければリクエスト URL の origin（Origin ヘッダーは使わない）
    const origin = resolveReturnOrigin({
      requestUrl: request.url,
      headers: request.headers,
      baseUrl: process.env.NEXT_PUBLIC_BASE_URL,
    });

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

    return Response.json({ url: session.url });
  } catch (err) {
    console.error("Checkout error:", err);
    return Response.json(
      { error: "決済セッションの作成に失敗しました。時間をおいてもう一度お試しください" },
      { status: 500 }
    );
  }
}
