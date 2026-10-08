import { getStripe } from "@/lib/stripe";
import { MAX_BODY_BYTES } from "@/lib/checkout.mjs";
import {
  UNSUPPORTED_MEDIA_TYPE,
  createCheckoutSessionCore,
  isJsonContentType,
  readBodyWithLimit,
} from "@/lib/checkout-session.mjs";

const TOO_LARGE = "リクエストが大きすぎます";
const BAD_REQUEST = "リクエストの形式が不正です";

/**
 * Stripe Checkout Session を作成する。
 * クライアントからは { items: [{ id, quantity }] } だけを受け取り、
 * 価格と商品名はサーバ側のカタログ（lib/catalog.mjs）から引く。
 * 購入した id と数量は session の metadata に持たせ、成功ページの確認で注文を作るのに使う。
 * 本体は lib/checkout-session.mjs（GraphQL の createCheckoutSession と共有）。
 */
export async function POST(request) {
  // フォーム送信など JSON 以外は受け付けない（GraphQL の入口と同じ判定）
  if (!isJsonContentType(request.headers.get("content-type"))) {
    return Response.json({ error: UNSUPPORTED_MEDIA_TYPE }, { status: 415 });
  }

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

  const result = await createCheckoutSessionCore({
    items: body?.items,
    requestUrl: request.url,
    baseUrl: process.env.NEXT_PUBLIC_BASE_URL,
    getStripe,
  });
  if (result.ok) return Response.json({ url: result.url });
  if (result.kind === "invalid") {
    return Response.json({ error: result.error }, { status: 400 });
  }
  console.error("Checkout error:", result.cause);
  return Response.json(
    { error: "決済セッションの作成に失敗しました。時間をおいてもう一度お試しください" },
    { status: 500 }
  );
}
