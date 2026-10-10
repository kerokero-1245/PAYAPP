/**
 * Webhook のテストの道具（本物の署名を作る）
 * ---------------------------------------------------
 * 署名は Stripe のライブラリ（stripe 20 の webhooks.generateTestHeaderString）が作り、検証も本物の
 * webhooks.constructEvent で行う。署名の計算を自前で書かないので、Stripe の実際の署名と食い違わない。
 * `tests/*.test.ts` のグロブには当たらない。
 */
import Stripe from "stripe";

export const WEBHOOK_SECRET = "whsec_test_unit_secret";
export const WEBHOOK_URL = "http://localhost/api/stripe/webhook";

/**
 * 本番の Route Handler（app/api/stripe/webhook/route.ts）と同じ呼び方の署名検証。
 * constructEvent は this を使うので、メソッドのまま呼ぶ。
 */
export function constructEvent(
  payload: string,
  signature: string,
  secret: string,
): unknown {
  return Stripe.webhooks.constructEvent(payload, signature, secret);
}

/**
 * Checkout Session のイベント（Stripe が送る形のうち、読む項目だけ）。
 * session には、本文を信じていないことを確かめるための項目（payment_status や metadata など）を足せる。
 */
export function sessionEvent(
  type: string,
  sessionId: string,
  eventId = "evt_test_1",
  session: Record<string, unknown> = {},
) {
  return {
    id: eventId,
    object: "event",
    type,
    data: { object: { id: sessionId, object: "checkout.session", ...session } },
  };
}

export type SignOptions = {
  /** 署名に使う秘密（既定は WEBHOOK_SECRET） */
  secret?: string;
  /** 署名の時刻（秒。既定は今） */
  timestamp?: number;
  /** ヘッダーをこの値にする。null ならヘッダー自体を付けない */
  signature?: string | null;
};

/** Stripe-Signature つきの Webhook のリクエスト。body が文字列ならそのまま、そうでなければ JSON にして送る */
export function webhookRequest(
  body: unknown,
  { secret = WEBHOOK_SECRET, timestamp, signature }: SignOptions = {},
): Request {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  const headers = new Headers({ "content-type": "application/json" });
  if (signature !== null) {
    headers.set(
      "stripe-signature",
      signature ??
        Stripe.webhooks.generateTestHeaderString({
          payload,
          secret,
          timestamp,
        }),
    );
  }
  return new Request(WEBHOOK_URL, { method: "POST", headers, body: payload });
}
