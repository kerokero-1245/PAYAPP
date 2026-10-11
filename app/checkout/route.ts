import { getViewerFromHeaders } from "@/lib/auth/server";
import { getStripe } from "@/lib/stripe";
import { handleCheckoutRequest } from "@/lib/checkout-session";

/**
 * Stripe Checkout Session を作成する（REST）。
 * クライアントからは { items: [{ id, quantity }] } だけを受け取り、
 * 価格と商品名はサーバ側のカタログ（lib/catalog.ts）から引く。
 * 購入した id と数量は session の metadata に持たせ、成功ページの確認で注文を作るのに使う。
 * ログイン中なら、持ち主の id（セッションから引く。本文の値は使わない）を client_reference_id に付ける。
 * 本体は lib/checkout-session.ts の handleCheckoutRequest（GraphQL の createCheckoutSession と同じ createCheckoutSessionCore を呼ぶ。
 * ログイン中の持ち主の受け渡しは tests/checkout-route.test.ts が確かめている）。
 */
export async function POST(request: Request) {
  return handleCheckoutRequest(request, {
    getViewer: getViewerFromHeaders,
    getStripe,
    baseUrl: process.env.NEXT_PUBLIC_BASE_URL,
  });
}
