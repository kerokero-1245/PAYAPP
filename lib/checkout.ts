/**
 * 決済まわりの純粋な関数（Stripe を呼ばない）
 * ---------------------------------------------------
 * - normalizeOrderItems / buildLineItems: 届いた { id, quantity } を検査・合算し、
 *   価格と名前はカタログから引いて Stripe の line_items を組み立てる
 * - encodeOrderMetadata / decodeOrderMetadata: 購入した id と数量を session の metadata に持たせる
 * - orderFromSession: 支払い済みの session から注文（品目・単価・数量・合計）を作る（DB に確定する前の形。確定は lib/fulfillment.ts）
 * - decideVerifyOutcome: 成功ページの確認結果を「支払い済み / 未払い / 確認できなかった」に分ける
 * - isValidSessionId / isSessionPaid / isStripeNotFound / findOrderBySession
 *
 * tests/*.test.ts で `node --test` から検証する。
 */
import { getProductById } from "./catalog.ts";
import { MAX_QUANTITY } from "./cart.ts";
import type {
  ItemQuantity,
  Order,
  OrderItem,
  ProductLookup,
  RawItem,
} from "./types.ts";

export { MAX_QUANTITY };

/** 1 回の決済で受け付ける行数の上限（Stripe Checkout の line_items 上限と同じ） */
export const MAX_LINE_ITEMS = 100;
/** /checkout が受け付けるリクエスト本文の上限（バイト） */
export const MAX_BODY_BYTES = 16 * 1024;
/** 商品 id として受け付ける最大の長さ */
const MAX_ID_LENGTH = 64;
/** 成功ページが確認ルートの応答を待つ時間 */
export const VERIFY_TIMEOUT_MS = 10_000;

/** 利用者に見せるエラー文（入力の値は入れない） */
export const CHECKOUT_ERRORS = {
  empty: "カートが空です",
  tooMany: "商品の種類が多すぎます",
  unknownItem:
    "カートに購入できない商品が含まれています。カートを確認してください",
  badQuantity: `数量は 1〜${MAX_QUANTITY} の整数で指定してください`,
};

/** normalizeOrderItems の結果 */
export type NormalizeResult =
  { ok: true; items: ItemQuantity[] } | { ok: false; error: string };

/** Stripe Checkout の line_items の 1 行（価格と名前はカタログから引いた値） */
export type StripeLineItem = {
  price_data: {
    currency: string;
    product_data: { name: string };
    unit_amount: number;
  };
  quantity: number;
};

/** buildLineItems の結果 */
export type LineItemsResult =
  | { ok: true; items: ItemQuantity[]; lineItems: StripeLineItem[] }
  | { ok: false; error: string };

/** 支払い済みの session から作る注文（DB に確定する前の、品目・単価・数量・合計） */
export type PaidOrder = {
  sessionId: string;
  items: OrderItem[];
  total: number;
};

/** DB に確定した注文（決済確認ルートが返す形）。PaidOrder に、画面に出す注文番号を足したもの */
export type ConfirmedOrder = PaidOrder & { orderNo: string };

/** orderFromSession の結果 */
export type OrderFromSessionResult =
  { ok: true; order: PaidOrder } | { ok: false; error: string };

/** 支払い済みと確認できた Checkout Session のうち、ここで読む項目（本物は Stripe の Checkout Session） */
export type PaidSession = {
  id: string;
  payment_status: "paid";
  metadata: unknown;
};

/** 成功ページが確認ルートへ問い合わせた結果 */
export type VerifyInput =
  | { kind: "missing-session" }
  | { kind: "network-error" }
  | { kind: "timeout" }
  | { kind: "response"; status: number; body: unknown };

/** decideVerifyOutcome の結果 */
export type VerifyOutcome =
  | { state: "paid"; order: ConfirmedOrder }
  | { state: "unpaid" }
  | { state: "unverified" };

/** appendOrder に渡す注文（id・date は無ければ生成する） */
export type NewOrder = {
  id?: string;
  date?: string;
  items?: OrderItem[];
  total?: number;
  sessionId?: string;
};

/**
 * 届いた items を検査し、同じ id の行を合算する（数量の上限は合算後に当てる）。
 */
export function normalizeOrderItems(
  items: unknown,
  lookup: ProductLookup = getProductById,
): NormalizeResult {
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, error: CHECKOUT_ERRORS.empty };
  }
  if (items.length > MAX_LINE_ITEMS) {
    return { ok: false, error: CHECKOUT_ERRORS.tooMany };
  }
  const merged = new Map<string, number>();
  for (const item of items as RawItem[]) {
    const id = item?.id;
    const quantity = item?.quantity;
    if (
      typeof id !== "string" ||
      id === "" ||
      id.length > MAX_ID_LENGTH ||
      !lookup(id)
    ) {
      return { ok: false, error: CHECKOUT_ERRORS.unknownItem };
    }
    if (
      typeof quantity !== "number" ||
      !Number.isSafeInteger(quantity) ||
      quantity < 1 ||
      quantity > MAX_QUANTITY
    ) {
      return { ok: false, error: CHECKOUT_ERRORS.badQuantity };
    }
    merged.set(id, (merged.get(id) ?? 0) + quantity);
  }
  for (const quantity of merged.values()) {
    if (quantity > MAX_QUANTITY)
      return { ok: false, error: CHECKOUT_ERRORS.badQuantity };
  }
  return {
    ok: true,
    items: [...merged].map(([id, quantity]) => ({ id, quantity })),
  };
}

/**
 * カートの内容から Stripe Checkout の line_items を作る。
 * 送られてきた price や name は一切使わない。
 */
export function buildLineItems(
  items: unknown,
  lookup: ProductLookup = getProductById,
): LineItemsResult {
  const normalized = normalizeOrderItems(items, lookup);
  if (!normalized.ok) return normalized;
  const lineItems = normalized.items.map(({ id, quantity }) => {
    // normalizeOrderItems が lookup(id) の引けた id だけを通している
    const product = lookup(id)!;
    return {
      price_data: {
        currency: "jpy",
        product_data: { name: product.name },
        unit_amount: product.price,
      },
      quantity,
    };
  });
  return { ok: true, items: normalized.items, lineItems };
}

/* ---- session の metadata（購入した id と数量） ---- */

const META_KEY = "order_items_";
/** Stripe の metadata は値 1 つが 500 文字まで */
const META_CHUNK = 500;

/** [{ id, quantity }] → { order_items_0: "1:2,5:1", ... } */
export function encodeOrderMetadata(
  items: ItemQuantity[],
): Record<string, string> {
  const text = items.map(({ id, quantity }) => `${id}:${quantity}`).join(",");
  const metadata: Record<string, string> = {};
  for (let i = 0, n = 0; i < text.length; i += META_CHUNK, n += 1) {
    metadata[`${META_KEY}${n}`] = text.slice(i, i + META_CHUNK);
  }
  return metadata;
}

/** encodeOrderMetadata の逆。読めなければ null */
export function decodeOrderMetadata(metadata: unknown): ItemQuantity[] | null {
  if (!metadata || typeof metadata !== "object") return null;
  const entries = metadata as Record<string, unknown>;
  const parts: string[] = [];
  for (let n = 0; typeof entries[`${META_KEY}${n}`] === "string"; n += 1) {
    parts.push(entries[`${META_KEY}${n}`] as string);
  }
  const text = parts.join("");
  if (text === "") return null;
  const items: ItemQuantity[] = [];
  for (const pair of text.split(",")) {
    const m = /^([^:,]+):(\d{1,3})$/.exec(pair);
    if (!m) return null;
    items.push({ id: m[1], quantity: Number(m[2]) });
  }
  return items;
}

/**
 * 支払い済みの session から注文を作る。品目と数量は session の metadata、
 * 単価・商品名はカタログから引く（ブラウザのカートは使わない）。
 */
export function orderFromSession(
  session: unknown,
  lookup: ProductLookup = getProductById,
): OrderFromSessionResult {
  if (!isSessionPaid(session)) return { ok: false, error: "未払いの決済です" };
  const decoded = decodeOrderMetadata(session.metadata);
  const normalized = decoded ? normalizeOrderItems(decoded, lookup) : null;
  if (!normalized?.ok)
    return { ok: false, error: "注文の内容を読み取れませんでした" };

  const items = normalized.items.map(({ id, quantity }) => {
    // normalizeOrderItems が lookup(id) の引けた id だけを通している
    const product = lookup(id)!;
    return {
      id,
      name: product.name,
      price: product.price,
      quantity,
      image: product.images?.[0] ?? null,
      category: product.category ?? null,
    };
  });
  const total = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  return { ok: true, order: { sessionId: session.id, items, total } };
}

/**
 * 確認ルートが返した注文の形が正しいか。
 * 検査するのは注文番号（空でない文字列）と、品目の id・name・price・quantity と合計。image・category・sessionId は検査しない
 * （サーバが DB の注文から作る形を信用する）ので、型ガードは ConfirmedOrder と宣言するが実行時の保証ではない。
 */
export function isValidOrder(order: unknown): order is ConfirmedOrder {
  const probe = order as
    { orderNo?: unknown; items?: unknown; total?: unknown } | null | undefined;
  if (!probe || typeof probe.orderNo !== "string" || probe.orderNo === "")
    return false;
  if (!Array.isArray(probe.items) || probe.items.length === 0) return false;
  let sum = 0;
  for (const i of probe.items as Partial<Record<keyof OrderItem, unknown>>[]) {
    if (typeof i?.id !== "string" || typeof i.name !== "string") return false;
    if (
      typeof i.price !== "number" ||
      !Number.isSafeInteger(i.price) ||
      i.price < 0
    )
      return false;
    if (
      typeof i.quantity !== "number" ||
      !Number.isInteger(i.quantity) ||
      i.quantity < 1 ||
      i.quantity > MAX_QUANTITY
    ) {
      return false;
    }
    sum += i.price * i.quantity;
  }
  return probe.total === sum;
}

/**
 * 成功ページの確認結果を 3 つの状態に分ける。
 *  - "paid": 支払い済みと確認できた（order は DB に確定した注文。購入分をカートから外してよい）
 *  - "unpaid": 未払い・決済の参照が無いと確認できた（買い直してよい）
 *  - "unverified": 確認できなかった（通信失敗・サーバエラー・時間切れ・形の崩れた応答）
 */
export function decideVerifyOutcome(
  result: VerifyInput | null | undefined,
): VerifyOutcome {
  if (result?.kind === "missing-session") return { state: "unpaid" };
  if (result?.kind !== "response") return { state: "unverified" };
  // 応答の本文は形が未検査（isValidOrder が注文の形を確かめる）
  const { status, body } = result as {
    status: number;
    body: { paid?: unknown; order?: unknown } | null | undefined;
  };
  if (status === 200 && body?.paid === true && isValidOrder(body.order)) {
    return { state: "paid", order: body.order };
  }
  if (status === 200 && body?.paid === false) return { state: "unpaid" };
  // session_id の形が不正（実在しうる決済の参照ではない）
  if (status === 400) return { state: "unpaid" };
  return { state: "unverified" };
}

/** Stripe Checkout Session の id の形か（cs_ で始まり、英数字とアンダースコア、200 文字以下） */
export function isValidSessionId(sessionId: unknown): sessionId is string {
  return (
    typeof sessionId === "string" &&
    sessionId.length <= 200 &&
    /^cs_[A-Za-z0-9_]+$/.test(sessionId)
  );
}

/** Stripe から取得した Checkout Session が支払い済みか（payment_status が paid のときだけ true） */
export function isSessionPaid(session: unknown): session is PaidSession {
  return (
    (session as { payment_status?: unknown } | null | undefined)
      ?.payment_status === "paid"
  );
}

/** Stripe の「その session は存在しない」エラーか（それ以外は一時的な失敗として扱う） */
export function isStripeNotFound(err: unknown): boolean {
  return (
    (err as { statusCode?: unknown } | null | undefined)?.statusCode === 404
  );
}

/** 注文履歴から、指定の session_id で記録済みの注文を探す */
export function findOrderBySession(
  orders: unknown,
  sessionId: unknown,
): Order | undefined {
  if (!sessionId || !Array.isArray(orders)) return undefined;
  return (orders as Order[]).find((o) => o?.sessionId === sessionId);
}

/**
 * 注文履歴の先頭に注文を足した新しい配列を返す。
 * sessionId 付きの注文は、同じ sessionId が記録済みなら足さない（元の配列をそのまま返す）。
 * orders は新しい順の注文履歴。
 *
 * ブラウザ（localStorage）の注文履歴用。注文は DB に確定する（lib/fulfillment.ts）ようになったので、
 * 呼び出し元は無い（store/orderStore.ts の addOrder だけ）。段 4 で /orders をサーバから読む形にしたとき、ストアごと消す。
 */
export function appendOrder(
  orders: Order[],
  order: NewOrder,
  now: Date = new Date(),
): Order[] {
  const list = Array.isArray(orders) ? orders : [];
  if (order.sessionId && findOrderBySession(list, order.sessionId)) return list;
  const record: Order = {
    id: order.id ?? `ORD-${now.getTime().toString(36).toUpperCase()}`,
    date: order.date ?? now.toISOString(),
    items: order.items ?? [],
    total: order.total ?? 0,
    ...(order.sessionId ? { sessionId: order.sessionId } : {}),
  };
  return [record, ...list];
}
