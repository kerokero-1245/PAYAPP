import { getStripe } from "@/lib/stripe";
import { verifyCheckoutSession } from "@/lib/checkout-session";

/**
 * 決済確認: GET /api/checkout/session?session_id=cs_...
 * Stripe から Checkout Session を取得し、payment_status が "paid" のときだけ
 * { paid: true, order } を返す。order は session の metadata（購入した id と数量）を
 * カタログに当てて作った注文の内容（品目・単価・数量・合計）。
 *
 *  - 200 { paid: false }   未払い、またはその session が存在しない
 *  - 400                   session_id の形が不正
 *  - 500 / 502             確認できなかった（成功ページは「確認が取れていません」を出す）
 *
 * 本体は lib/checkout-session.ts の verifyCheckoutSession（Stripe は getStripe で差し込む。
 * tests/checkout-verify.test.ts が偽の Stripe を渡して、支払い済みの経路を確かめている）。
 */
export async function GET(request: Request) {
  return verifyCheckoutSession({ requestUrl: request.url, getStripe });
}
