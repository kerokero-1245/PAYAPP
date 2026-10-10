/**
 * Stripe Checkout Session の作成と決済の確認（Route Handler と GraphQL で共有する本体）
 * ---------------------------------------------------
 * - readBodyWithLimit: リクエスト本文を上限つきで読む（超えたら null）
 * - createCheckoutSessionCore: 検査・価格決定・戻り先の決定・sessions.create をまとめて行う（/checkout と GraphQL の Mutation）
 * - verifyCheckoutSession: session_id から Checkout Session を引き、支払い済みなら注文を返す（/api/checkout/session）
 *
 * Stripe クライアントは引数の getStripe() から受け取る（lib/stripe.ts は server-only なので
 * ここでは import しない。node --test から偽の Stripe を差し込めるようにするため）。
 */
import type Stripe from "stripe";
import {
  buildLineItems,
  encodeOrderMetadata,
  isSessionPaid,
  isStripeNotFound,
  isValidSessionId,
  orderFromSession,
} from "./checkout.ts";
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
};

/** 確認結果は Stripe の状態そのものなので、どの応答もキャッシュさせない */
const NO_STORE = { "Cache-Control": "no-store" };

/**
 * 決済確認の本体: ?session_id=cs_... の Checkout Session を Stripe から取得し、payment_status が "paid" の
 * ときだけ { paid: true, order } を返す。order は session の metadata（購入した id と数量）をカタログに当てて
 * 作った注文の内容（品目・単価・数量・合計）。
 *
 *  - 200 { paid: false }   未払い、またはその session が存在しない
 *  - 400                   session_id の形が不正（Stripe は呼ばない）
 *  - 500 / 502             確認できなかった（成功ページは「確認が取れていません」を出す）
 */
export async function verifyCheckoutSession({
  requestUrl,
  getStripe,
}: VerifyCheckoutSessionInput): Promise<Response> {
  const sessionId = new URL(requestUrl).searchParams.get("session_id");
  if (!isValidSessionId(sessionId)) {
    return Response.json(
      { paid: false, error: "session_id が不正です" },
      { status: 400, headers: NO_STORE },
    );
  }

  let session: unknown;
  try {
    session = await getStripe().checkout.sessions.retrieve(sessionId);
  } catch (err) {
    if (isStripeNotFound(err)) {
      return Response.json({ paid: false }, { headers: NO_STORE });
    }
    console.error("Checkout session verify error:", err);
    return Response.json(
      { paid: false, error: "決済情報を確認できませんでした" },
      { status: 502, headers: NO_STORE },
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
      { status: 500, headers: NO_STORE },
    );
  }
  return Response.json(
    { paid: true, order: result.order },
    { headers: NO_STORE },
  );
}
