import { getStripe } from "@/lib/stripe";
import {
  isSessionPaid,
  isStripeNotFound,
  isValidSessionId,
  orderFromSession,
} from "@/lib/checkout.mjs";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * 決済確認: GET /api/checkout/session?session_id=cs_...
 * Stripe から Checkout Session を取得し、payment_status が "paid" のときだけ
 * { paid: true, order } を返す。order は session の metadata（購入した id と数量）を
 * カタログに当てて作った注文の内容（品目・単価・数量・合計）。
 *
 *  - 200 { paid: false }   未払い、またはその session が存在しない
 *  - 400                   session_id の形が不正
 *  - 500 / 502             確認できなかった（成功ページは「確認が取れていません」を出す）
 */
export async function GET(request) {
  const sessionId = new URL(request.url).searchParams.get("session_id");
  if (!isValidSessionId(sessionId)) {
    return Response.json(
      { paid: false, error: "session_id が不正です" },
      { status: 400, headers: NO_STORE }
    );
  }

  let session;
  try {
    session = await getStripe().checkout.sessions.retrieve(sessionId);
  } catch (err) {
    if (isStripeNotFound(err)) {
      return Response.json({ paid: false }, { headers: NO_STORE });
    }
    console.error("Checkout session verify error:", err);
    return Response.json(
      { paid: false, error: "決済情報を確認できませんでした" },
      { status: 502, headers: NO_STORE }
    );
  }

  if (!isSessionPaid(session)) {
    return Response.json({ paid: false }, { headers: NO_STORE });
  }
  const result = orderFromSession(session);
  if (!result.ok) {
    console.error("Checkout session order error:", result.error);
    return Response.json(
      { paid: false, error: "注文の内容を確認できませんでした" },
      { status: 500, headers: NO_STORE }
    );
  }
  return Response.json({ paid: true, order: result.order }, { headers: NO_STORE });
}
