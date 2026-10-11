/**
 * Stripe Checkout Session の作成と決済の確認（Route Handler と GraphQL で共有する本体）
 * ---------------------------------------------------
 * - readBodyWithLimit: リクエスト本文を上限つきで読む（超えたら null）。TOO_LARGE・BAD_REQUEST・UNSUPPORTED_MEDIA_TYPE・NO_STORE は
 *   入口（/checkout・GraphQL・Webhook・/api/auth）で共通の応答の文言とヘッダー
 * - createCheckoutSessionCore: 検査・価格決定・戻り先の決定・sessions.create をまとめて行う（/checkout と GraphQL の Mutation）
 * - handleCheckoutRequest: POST /checkout の本体（Content-Type・本文の上限・JSON・ログイン中の持ち主を見てから createCheckoutSessionCore を呼ぶ）
 * - verifyCheckoutSession: session_id の決済を fulfillCheckout で DB に確定し、DB の注文を返す（/api/checkout/session）
 *
 * Stripe クライアントと DB は引数の getStripe() / getDb() から受け取る（lib/stripe.ts と lib/db/client.ts は
 * server-only なので、ここでは import しない。node --test から偽の Stripe とテスト用の DB を差し込めるようにするため）。
 */
import type Stripe from "stripe";
import {
  MAX_BODY_BYTES,
  buildLineItems,
  encodeOrderMetadata,
  isValidSessionId,
} from "./checkout.ts";
import type { ConfirmedOrder } from "./checkout.ts";
import type { Db } from "./db/connect.ts";
import { fulfillCheckout } from "./fulfillment.ts";
import type { FulfillResult, StoredOrder } from "./fulfillment.ts";
import { describeError, logEvent } from "./log.ts";
import { resolveReturnOrigin } from "./site.ts";
import type { Viewer } from "./types.ts";

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
  /**
   * ログイン中の利用者の id（user.id）。あれば Checkout Session の client_reference_id に付け、注文の持ち主（orders.user_id）になる。
   * 無い（ゲスト）なら付けない。サーバがセッションから引いた値だけを渡す（リクエストの本文の値は使わない）
   */
  userId?: string | null;
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

/** 本文が上限を超えた（413）・本文を読めない／形が不正な（400）ときの文言。/checkout・GraphQL・Webhook・/api/auth で共通 */
export const TOO_LARGE = "リクエストが大きすぎます";
export const BAD_REQUEST = "リクエストの形式が不正です";

/** 決済の確認・認証・GraphQL の応答はどれもキャッシュさせない（Stripe と DB の状態そのもの・cookie を扱うため） */
export const NO_STORE = { "Cache-Control": "no-store" };

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
 * 購入した id と数量は session の metadata に持たせる。ログイン中なら持ち主の id を client_reference_id に付ける
 * （Webhook と成功ページの確認が、同じ session から注文を確定するとき、これを orders.user_id に入れる）。
 */
export async function createCheckoutSessionCore({
  items,
  requestUrl,
  baseUrl,
  userId,
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
      ...(userId ? { client_reference_id: userId } : {}),
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
 *                               500 は DB に確定できなかったか、注文の内容を読めなかった・請求額が注文の合計と合わなかった。
 *                               502 は Stripe から取れなかった
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
    // DB の失敗の例外は SQL の引数を持つので、例外ごと console に渡さず、名前とコードだけを記録する
    logEvent("error", "checkout.fulfill-failed", {
      sessionId,
      ...describeError(err),
    });
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
    case "payment-mismatch":
      // 記録（値を含まない構造化ログ）は fulfillCheckout が残している。成功ページには「確認が取れていません」を出す
      return Response.json(
        { paid: false, error: "注文の内容を確認できませんでした" },
        { status: 500, headers: NO_STORE },
      );
  }
}

/** 決済セッションを作れなかったときの利用者向けの文言（GraphQL の STRIPE_UNAVAILABLE_MESSAGE と同じ） */
const CHECKOUT_FAILED =
  "決済セッションの作成に失敗しました。時間をおいてもう一度お試しください";

/** handleCheckoutRequest に差し込むもの */
export type CheckoutRequestDeps = {
  /** リクエストのヘッダー（cookie）からログイン中の利用者を引く関数（ログインしていなければ null。引けなければ例外） */
  getViewer: (headers: Headers) => Promise<Viewer | null>;
  getStripe: () => StripeLike;
  baseUrl?: string;
};

/**
 * POST /checkout（REST）の本体。クライアントからは { items: [{ id, quantity }] } だけを受け取り、価格と商品名はカタログから引く
 * （本体は createCheckoutSessionCore。GraphQL の createCheckoutSession と共有）。
 *  - 415 Content-Type が application/json でない / 413 本文が MAX_BODY_BYTES（16KB）を超える / 400 本文が読めない・JSON でない・品目が不正
 *  - ログイン中なら、持ち主の id（セッションから引く。本文の値は使わない）を client_reference_id に付ける。
 *    cookie の無い要求（ゲスト）は DB に触れない。セッションを引けなければ（DB の失敗など）、持ち主を決められないので 500
 *  - 200 { url } / 500 Stripe に届かなかった
 */
export async function handleCheckoutRequest(
  request: Request,
  { getViewer, getStripe, baseUrl }: CheckoutRequestDeps,
): Promise<Response> {
  // フォーム送信など JSON 以外は受け付けない（GraphQL の入口と同じ判定）
  if (!isJsonContentType(request.headers.get("content-type"))) {
    return Response.json({ error: UNSUPPORTED_MEDIA_TYPE }, { status: 415 });
  }

  let text: string | null;
  try {
    text = await readBodyWithLimit(request, MAX_BODY_BYTES);
  } catch {
    return Response.json({ error: BAD_REQUEST }, { status: 400 });
  }
  if (text === null)
    return Response.json({ error: TOO_LARGE }, { status: 413 });

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return Response.json({ error: BAD_REQUEST }, { status: 400 });
  }

  let userId: string | undefined;
  try {
    userId = (await getViewer(request.headers))?.id;
  } catch (cause) {
    // セッションの確認が DB で失敗したときの例外は、SQL の引数（セッションの識別子）を持つので、名前とコードだけ記録する
    logEvent("error", "checkout.viewer-failed", describeError(cause));
    return Response.json({ error: CHECKOUT_FAILED }, { status: 500 });
  }

  const result = await createCheckoutSessionCore({
    items: (body as { items?: unknown } | null | undefined)?.items,
    requestUrl: request.url,
    baseUrl,
    userId,
    getStripe,
  });
  if (result.ok) return Response.json({ url: result.url });
  if (result.kind === "invalid") {
    return Response.json({ error: result.error }, { status: 400 });
  }
  console.error("Checkout error:", result.cause);
  return Response.json({ error: CHECKOUT_FAILED }, { status: 500 });
}
