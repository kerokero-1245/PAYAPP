/**
 * Stripe Checkout Session の作成と決済の確認（Route Handler と GraphQL で共有する本体）
 * ---------------------------------------------------
 * - readBodyWithLimit: リクエスト本文を上限つきで読む（超えたら null）
 * - createCheckoutSessionCore: 検査・価格決定・戻り先の決定・sessions.create をまとめて行う（/checkout と GraphQL の Mutation）
 * - verifyCheckoutSession: session_id の決済を fulfillCheckout で DB に確定し、DB の注文を返す（/api/checkout/session）
 *
 * Stripe クライアントと DB は引数の getStripe() / getDb() から受け取る（lib/stripe.ts と lib/db/client.ts は
 * server-only なので、ここでは import しない。node --test から偽の Stripe とテスト用の DB を差し込めるようにするため）。
 */
import type Stripe from "stripe";
import {
  buildLineItems,
  encodeOrderMetadata,
  isValidSessionId,
} from "./checkout.ts";
import type { ConfirmedOrder } from "./checkout.ts";
import type { Db } from "./db/connect.ts";
import { fulfillCheckout } from "./fulfillment.ts";
import type { FulfillResult, StoredOrder } from "./fulfillment.ts";
import { resolveReturnOrigin } from "./site.ts";

/**
 * getStripe() が返す Stripe クライアントのうち、決済で使うメソッドだけの最小の型。
 * 本物の Stripe はこの型に代入でき（構造的部分型）、テストの偽の Stripe も同じ型で書ける。
 * retrieve の戻り値は unknown で受け、読む側（isSessionPaid・orderFromSession）が絞る。
 */
export type StripeLike = {
  checkout: {
    sessions: {
      create(
        params: Stripe.Checkout.SessionCreateParams,
      ): Promise<{ url: string | null }>;
      retrieve(id: string): Promise<unknown>;
    };
  };
};

/** createCheckoutSessionCore の引数 */
export type CheckoutSessionInput = {
  items: unknown;
  requestUrl: string;
  baseUrl?: string;
  getStripe: () => StripeLike;
};

/** createCheckoutSessionCore の結果（url は Stripe の型どおり null がありうる） */
export type CheckoutSessionResult =
  | { ok: true; url: string | null }
  | { ok: false; kind: "invalid"; error: string }
  | { ok: false; kind: "stripe"; cause: unknown };

/** Content-Type が application/json でないときの文言（/checkout と GraphQL で共通） */
export const UNSUPPORTED_MEDIA_TYPE =
  "Content-Type は application/json にしてください";

/**
 * Content-Type が application/json か（大文字小文字は問わない。; charset=... などの引数は可）。
 * application/graphql-response+json や application/json-seq は受け付けない。
 */
export function isJsonContentType(value: unknown): boolean {
  return typeof value === "string" && /^application\/json\s*(;|$)/i.test(value);
}

/** 本文を上限つきで読む。上限を超えたら null */
export async function readBodyWithLimit(
  request: Request,
  limit: number,
): Promise<string | null> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limit) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
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
 */
export async function createCheckoutSessionCore({
  items,
  requestUrl,
  baseUrl,
  getStripe,
}: CheckoutSessionInput): Promise<CheckoutSessionResult> {
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

/** verifyCheckoutSession の引数 */
export type VerifyCheckoutSessionInput = {
  /** 確認ルートが受けたリクエストの URL（?session_id= を読む） */
  requestUrl: string;
  getStripe: () => StripeLike;
  getDb: () => Promise<Db>;
};

/** 確認結果は Stripe と DB の状態そのものなので、どの応答もキャッシュさせない */
const NO_STORE = { "Cache-Control": "no-store" };

/** 確認ルートが返す注文（DB の注文のうち、成功ページが使う項目） */
export function toConfirmedOrder({
  orderNo,
  sessionId,
  items,
  total,
}: StoredOrder): ConfirmedOrder {
  return { orderNo, sessionId, items, total };
}

/**
 * 決済確認の本体: ?session_id=cs_... の決済を fulfillCheckout（Webhook と同じ関数）で DB に確定し、DB の注文を返す。
 * 既に確定していれば（Webhook が先に来ていれば）Stripe に問い合わせず、その注文を返す。
 * 確定するのは、Stripe の Checkout Session の payment_status が "paid" のときだけ。
 * 注文の中身は session の metadata（購入した id と数量）をカタログに当てて作った品目・単価・数量・合計。
 *
 *  - 200 { paid: true, order }  支払い済みで、注文が DB にある（order に画面に出す注文番号 orderNo を含む）
 *  - 200 { paid: false }        未払い、またはその session が存在しない
 *  - 400                        session_id の形が不正（Stripe も DB も呼ばない）
 *  - 500 / 502                  確認できなかった（成功ページは「確認が取れていません」を出す）。
 *                               500 は DB に確定できなかったか、注文の内容を読めなかった。502 は Stripe から取れなかった
 */
export async function verifyCheckoutSession({
  requestUrl,
  getStripe,
  getDb,
}: VerifyCheckoutSessionInput): Promise<Response> {
  const sessionId = new URL(requestUrl).searchParams.get("session_id");
  const invalid = () =>
    Response.json(
      { paid: false, error: "session_id が不正です" },
      { status: 400, headers: NO_STORE },
    );
  if (!isValidSessionId(sessionId)) return invalid();

  let result: FulfillResult;
  try {
    result = await fulfillCheckout({ db: await getDb(), getStripe, sessionId });
  } catch (err) {
    console.error("Checkout session fulfill error:", err);
    return Response.json(
      { paid: false, error: "注文を記録できませんでした" },
      { status: 500, headers: NO_STORE },
    );
  }

  switch (result.status) {
    case "fulfilled":
      return Response.json(
        { paid: true, order: toConfirmedOrder(result.order) },
        { headers: NO_STORE },
      );
    case "unpaid":
      return Response.json({ paid: false }, { headers: NO_STORE });
    case "invalid-session-id":
      return invalid();
    case "stripe-error":
      console.error("Checkout session verify error:", result.cause);
      return Response.json(
        { paid: false, error: "決済情報を確認できませんでした" },
        { status: 502, headers: NO_STORE },
      );
    case "unreadable-order":
      console.error("Checkout session order error:", result.error);
      return Response.json(
        { paid: false, error: "注文の内容を確認できませんでした" },
        { status: 500, headers: NO_STORE },
      );
  }
}
