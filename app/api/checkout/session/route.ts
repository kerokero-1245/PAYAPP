import { getDb } from "@/lib/db/client";
import { getStripe } from "@/lib/stripe";
import { verifyCheckoutSession } from "@/lib/checkout-session";

/**
 * 決済確認: GET /api/checkout/session?session_id=cs_...
 * その決済を fulfillCheckout（Stripe の Webhook と同じ関数）で DB に確定し、DB の注文を返す。
 * 既に確定していれば（Webhook が先に来ていれば）Stripe には問い合わせない。
 * Stripe の Checkout Session の payment_status が "paid" のときだけ { paid: true, order } を返し、
 * order は session の metadata（購入した id と数量）をカタログに当てて作った品目・単価・数量・合計と、
 * 画面に出す注文番号（orderNo）。
 *
 *  - 200 { paid: false }   未払い、またはその session が存在しない
 *  - 400                   session_id の形が不正
 *  - 500 / 502             確認できなかった（成功ページは「確認が取れていません」を出す）
 *
 * 本体は lib/checkout-session.ts の verifyCheckoutSession（Stripe と DB は getStripe / getDb で差し込む。
 * tests/checkout-verify.test.ts が偽の Stripe とテスト用の DB を渡して、支払い済みの経路を確かめている）。
 */
export async function GET(request: Request) {
  return verifyCheckoutSession({ requestUrl: request.url, getStripe, getDb });
}
