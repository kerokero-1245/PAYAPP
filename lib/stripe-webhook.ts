/**
 * Stripe の Webhook を受ける本体（POST /api/stripe/webhook の Route Handler が呼ぶ）
 * ---------------------------------------------------
 * 注文を確定するイベントは 2 種だけ。
 *  - checkout.session.completed: Checkout の支払いが済んだ（カードなら payment_status は paid）
 *  - checkout.session.async_payment_succeeded: あとから入金される支払い方法の入金が済んだ
 * 受け取ったら、成功ページと同じ fulfillCheckout（lib/fulfillment.ts）を呼ぶ。Webhook と成功ページのどちらが先に来ても、
 * 同時に来ても、同じ決済の注文は 1 件になる。
 *
 * 守ること:
 *  - 署名の検証: 加工していない本文と Stripe-Signature ヘッダー、STRIPE_WEBHOOK_SECRET で検証する。通らなければ 400 で、
 *    DB にも Stripe にも触れない。秘密が未設定なら 503（検証できないものを受け付けない）。許容時間はライブラリの既定（5 分）
 *  - 本文の中身は信じない: イベントから取り出すのは Checkout Session の id だけ。注文の中身は Stripe から取り直した session で決める
 *  - 冪等: 処理済みのイベント id（stripe_events）は 2 回処理しない。処理済みの記録は注文と同じトランザクションで書くので、
 *    失敗したイベントは記録されず、Stripe の再送で拾い直せる
 *  - 失敗は 5xx（や 4xx）で返して Stripe に再送させる。2xx を返すのは、受け取って片付いたとき（確定した・既に確定していた・
 *    処理済みだった・未払いだった・対象外のイベントだった）だけ
 *
 * 署名の検証関数・秘密・DB・Stripe はすべて引数で受ける（lib/db/client.ts の getDb は server-only でテストから読めない）。
 * Route Handler は createWebhookDeps（Stripe.webhooks.constructEvent と環境変数の秘密を渡す配線）を使い、
 * tests/webhook.test.ts が本物の署名を作って、配線ごと呼ぶ。
 */
import Stripe from "stripe";
import { isValidSessionId } from "./checkout.ts";
import {
  BAD_REQUEST,
  TOO_LARGE,
  readBodyWithLimit,
} from "./checkout-session.ts";
import type { StripeLike } from "./checkout-session.ts";
import type { Db } from "./db/connect.ts";
import { fulfillCheckout, hasProcessedEvent } from "./fulfillment.ts";

/** 注文を確定するイベントの種類 */
export const FULFILLMENT_EVENT_TYPES: ReadonlySet<string> = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
]);

/** 受け付ける本文の上限（バイト）。Stripe のイベントは数 KB なので、署名の検証の前に大きすぎる本文を弾く */
export const MAX_WEBHOOK_BODY_BYTES = 1024 * 1024;

/** Stripe の署名を持つヘッダー */
export const SIGNATURE_HEADER = "stripe-signature";

/** イベント id の形（evt_ で始まり、英数字とアンダースコア） */
const EVENT_ID = /^evt_[A-Za-z0-9_]{1,200}$/;

/** parseWebhookEvent の結果 */
export type ParsedWebhookEvent =
  /** 注文を確定する対象。eventId は処理済みの記録、sessionId は取り直す Checkout Session */
  | { kind: "fulfill"; eventId: string; sessionId: string }
  /** 形は正しいが、注文を確定するイベントではない */
  | { kind: "ignore"; type: string }
  /** イベントの形が不正 */
  | { kind: "invalid" };

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/**
 * 署名の検証を通ったイベント（JSON として読んだだけの未検査の値）から、必要な項目だけを取り出す。
 * 対象は FULFILLMENT_EVENT_TYPES の 2 種だけで、取り出すのはイベント id と Checkout Session の id。
 */
export function parseWebhookEvent(event: unknown): ParsedWebhookEvent {
  const record = asRecord(event);
  if (
    !record ||
    typeof record.id !== "string" ||
    !EVENT_ID.test(record.id) ||
    typeof record.type !== "string"
  ) {
    return { kind: "invalid" };
  }
  if (!FULFILLMENT_EVENT_TYPES.has(record.type)) {
    return { kind: "ignore", type: record.type };
  }
  const object = asRecord(asRecord(record.data)?.object);
  if (!object || !isValidSessionId(object.id)) return { kind: "invalid" };
  return { kind: "fulfill", eventId: record.id, sessionId: object.id };
}

/** handleStripeWebhook に差し込むもの */
export type WebhookDeps = {
  /**
   * 署名を検証して、イベント（JSON として読んだ値）を返す。通らなければ例外。
   * 本物は Stripe.webhooks.constructEvent（Route Handler が渡す）
   */
  constructEvent: (
    payload: string,
    signature: string,
    secret: string,
  ) => unknown;
  /** STRIPE_WEBHOOK_SECRET（whsec_...）。未設定・空なら 503 */
  secret: string | undefined;
  getDb: () => Promise<Db>;
  getStripe: () => StripeLike;
};

/**
 * Route Handler（app/api/stripe/webhook/route.ts）が handleStripeWebhook に渡す本物の依存を作る。
 * 署名の検証は Stripe のライブラリの constructEvent、秘密は環境変数 STRIPE_WEBHOOK_SECRET（STRIPE_SECRET_KEY ではない）。
 * route.ts は node --test から import できない（"@/" と server-only）ので、取り違えると常に 400 / 503 になる配線を、ここに置いて
 * tests/webhook.test.ts が確かめる。
 */
export function createWebhookDeps(
  env: Readonly<Record<string, string | undefined>>,
  { getDb, getStripe }: Pick<WebhookDeps, "getDb" | "getStripe">,
): WebhookDeps {
  return {
    // constructEvent は this を使うので、メソッドのまま呼ぶ（関数だけを取り出して渡すと検証が常に失敗する）
    constructEvent: (payload, signature, secret) =>
      Stripe.webhooks.constructEvent(payload, signature, secret),
    secret: env.STRIPE_WEBHOOK_SECRET,
    getDb,
    getStripe,
  };
}

/** 失敗の応答（利用者向けの文ではなく、Stripe のダッシュボードで読むための短い説明。例外の中身は入れない） */
function failure(status: number, error: string): Response {
  return Response.json({ error }, { status });
}

/** 受け取って片付いた応答（Stripe は 2xx なら再送しない） */
function received(result: string): Response {
  return Response.json({ received: true, result });
}

/**
 * Webhook を受ける。
 *  - 200 { received: true, result }  fulfilled（注文を作った）/ already-fulfilled（既にあった）/ duplicate（処理済みのイベント）/
 *                                    unpaid（未払い。何も記録しない）/ ignored（対象外のイベント）
 *  - 400  署名が無い・通らない・本文が読めない・イベントの形が不正
 *  - 413  本文が大きすぎる
 *  - 422  支払い済みだが、metadata から注文を作れない・請求額/通貨が注文の合計と合わない（再送されても直るまで 2xx にしない。手で直す）
 *  - 502  Stripe から Checkout Session を取れなかった
 *  - 500  DB の失敗など
 *  - 503  STRIPE_WEBHOOK_SECRET が未設定
 */
export async function handleStripeWebhook(
  request: Request,
  { constructEvent, secret, getDb, getStripe }: WebhookDeps,
): Promise<Response> {
  const signingSecret = secret?.trim();
  if (!signingSecret) {
    console.error("Stripe webhook error: STRIPE_WEBHOOK_SECRET が未設定です");
    return failure(503, "署名の秘密が設定されていないため受け付けられません");
  }

  const signature = request.headers.get(SIGNATURE_HEADER);
  if (!signature) return failure(400, "Stripe-Signature ヘッダーがありません");

  let payload: string | null;
  try {
    payload = await readBodyWithLimit(request, MAX_WEBHOOK_BODY_BYTES);
  } catch {
    return failure(400, BAD_REQUEST);
  }
  if (payload === null) return failure(413, TOO_LARGE);

  let event: unknown;
  try {
    event = constructEvent(payload, signature, signingSecret);
  } catch (err) {
    // 例外の中身（本文や署名を持つ）は出さず、理由の文だけをログに残す
    console.error(
      "Stripe webhook signature error:",
      err instanceof Error ? err.message : "unknown",
    );
    return failure(400, "署名を検証できませんでした");
  }

  const parsed = parseWebhookEvent(event);
  if (parsed.kind === "invalid") {
    return failure(400, "イベントの形式が不正です");
  }
  if (parsed.kind === "ignore") return received("ignored");

  try {
    const db = await getDb();
    if (await hasProcessedEvent(db, parsed.eventId)) {
      return received("duplicate");
    }
    const result = await fulfillCheckout({
      db,
      getStripe,
      sessionId: parsed.sessionId,
      eventId: parsed.eventId,
    });
    switch (result.status) {
      case "fulfilled":
        return received(result.created ? "fulfilled" : "already-fulfilled");
      case "unpaid":
        // 支払いがまだ済んでいない（あとから入金される方法など）。何も記録せず、入金のイベントを待つ
        return received("unpaid");
      case "unreadable-order":
        console.error(
          `Stripe webhook order error: ${parsed.sessionId}:`,
          result.error,
        );
        return failure(422, "注文の内容を読み取れませんでした");
      case "stripe-error":
        console.error("Stripe webhook retrieve error:", result.cause);
        return failure(502, "決済情報を取得できませんでした");
      case "payment-mismatch":
        // 記録（値を含まない構造化ログ）は fulfillCheckout が残している
        return failure(422, "請求額・通貨が注文の合計と一致しませんでした");
      case "invalid-session-id":
        // parseWebhookEvent が形を確かめているので通常は来ない
        return failure(400, "イベントの形式が不正です");
    }
  } catch (err) {
    console.error("Stripe webhook error:", err);
    return failure(500, "イベントを処理できませんでした");
  }
}
