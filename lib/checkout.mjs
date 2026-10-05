/**
 * 決済まわりの純粋な関数（Stripe を呼ばない）
 * ---------------------------------------------------
 * - normalizeOrderItems / buildLineItems: 届いた { id, quantity } を検査・合算し、
 *   価格と名前はカタログから引いて Stripe の line_items を組み立てる
 * - encodeOrderMetadata / decodeOrderMetadata: 購入した id と数量を session の metadata に持たせる
 * - orderFromSession: 支払い済みの session から注文（品目・単価・数量・合計）を作る
 * - decideVerifyOutcome: 成功ページの確認結果を「支払い済み / 未払い / 確認できなかった」に分ける
 * - isValidSessionId / isSessionPaid / isStripeNotFound / findOrderBySession
 *
 * tests/*.test.mjs で `node --test` から検証する。
 */
import { getProductById } from "./catalog.mjs";
import { MAX_QUANTITY } from "./cart.mjs";

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
  unknownItem: "カートに購入できない商品が含まれています。カートを確認してください",
  badQuantity: `数量は 1〜${MAX_QUANTITY} の整数で指定してください`,
};

/**
 * 届いた items を検査し、同じ id の行を合算する（数量の上限は合算後に当てる）。
 * @returns {{ ok: true, items: { id: string, quantity: number }[] } | { ok: false, error: string }}
 */
export function normalizeOrderItems(items, lookup = getProductById) {
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, error: CHECKOUT_ERRORS.empty };
  }
  if (items.length > MAX_LINE_ITEMS) {
    return { ok: false, error: CHECKOUT_ERRORS.tooMany };
  }
  const merged = new Map();
  for (const item of items) {
    const id = item?.id;
    const quantity = item?.quantity;
    if (typeof id !== "string" || id === "" || id.length > MAX_ID_LENGTH || !lookup(id)) {
      return { ok: false, error: CHECKOUT_ERRORS.unknownItem };
    }
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
      return { ok: false, error: CHECKOUT_ERRORS.badQuantity };
    }
    merged.set(id, (merged.get(id) ?? 0) + quantity);
  }
  for (const quantity of merged.values()) {
    if (quantity > MAX_QUANTITY) return { ok: false, error: CHECKOUT_ERRORS.badQuantity };
  }
  return { ok: true, items: [...merged].map(([id, quantity]) => ({ id, quantity })) };
}

/**
 * カートの内容から Stripe Checkout の line_items を作る。
 * 送られてきた price や name は一切使わない。
 * @returns {{ ok: true, items: object[], lineItems: object[] } | { ok: false, error: string }}
 */
export function buildLineItems(items, lookup = getProductById) {
  const normalized = normalizeOrderItems(items, lookup);
  if (!normalized.ok) return normalized;
  const lineItems = normalized.items.map(({ id, quantity }) => {
    const product = lookup(id);
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
export function encodeOrderMetadata(items) {
  const text = items.map(({ id, quantity }) => `${id}:${quantity}`).join(",");
  const metadata = {};
  for (let i = 0, n = 0; i < text.length; i += META_CHUNK, n += 1) {
    metadata[`${META_KEY}${n}`] = text.slice(i, i + META_CHUNK);
  }
  return metadata;
}

/** encodeOrderMetadata の逆。読めなければ null */
export function decodeOrderMetadata(metadata) {
  if (!metadata || typeof metadata !== "object") return null;
  const parts = [];
  for (let n = 0; typeof metadata[`${META_KEY}${n}`] === "string"; n += 1) {
    parts.push(metadata[`${META_KEY}${n}`]);
  }
  const text = parts.join("");
  if (text === "") return null;
  const items = [];
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
 * @returns {{ ok: true, order: { sessionId: string, items: object[], total: number } } | { ok: false, error: string }}
 */
export function orderFromSession(session, lookup = getProductById) {
  if (!isSessionPaid(session)) return { ok: false, error: "未払いの決済です" };
  const decoded = decodeOrderMetadata(session.metadata);
  const normalized = decoded ? normalizeOrderItems(decoded, lookup) : null;
  if (!normalized?.ok) return { ok: false, error: "注文の内容を読み取れませんでした" };

  const items = normalized.items.map(({ id, quantity }) => {
    const product = lookup(id);
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

/** 確認ルートが返した注文の形が正しいか */
export function isValidOrder(order) {
  if (!order || !Array.isArray(order.items) || order.items.length === 0) return false;
  let sum = 0;
  for (const i of order.items) {
    if (typeof i?.id !== "string" || typeof i.name !== "string") return false;
    if (!Number.isSafeInteger(i.price) || i.price < 0) return false;
    if (!Number.isInteger(i.quantity) || i.quantity < 1 || i.quantity > MAX_QUANTITY) return false;
    sum += i.price * i.quantity;
  }
  return order.total === sum;
}

/**
 * 成功ページの確認結果を 3 つの状態に分ける。
 *  - "paid": 支払い済みと確認できた（order を記録してよい）
 *  - "unpaid": 未払い・決済の参照が無いと確認できた（買い直してよい）
 *  - "unverified": 確認できなかった（通信失敗・サーバエラー・時間切れ・形の崩れた応答）
 *
 * @param {{ kind: "missing-session" } | { kind: "network-error" } | { kind: "timeout" }
 *   | { kind: "response", status: number, body: unknown }} result
 * @returns {{ state: "paid", order: object } | { state: "unpaid" } | { state: "unverified" }}
 */
export function decideVerifyOutcome(result) {
  if (result?.kind === "missing-session") return { state: "unpaid" };
  if (result?.kind !== "response") return { state: "unverified" };
  const { status, body } = result;
  if (status === 200 && body?.paid === true && isValidOrder(body.order)) {
    return { state: "paid", order: body.order };
  }
  if (status === 200 && body?.paid === false) return { state: "unpaid" };
  // session_id の形が不正（実在しうる決済の参照ではない）
  if (status === 400) return { state: "unpaid" };
  return { state: "unverified" };
}

/** Stripe Checkout Session の id の形か（cs_ で始まり、英数字とアンダースコア、200 文字以下） */
export function isValidSessionId(sessionId) {
  return (
    typeof sessionId === "string" &&
    sessionId.length <= 200 &&
    /^cs_[A-Za-z0-9_]+$/.test(sessionId)
  );
}

/** Stripe から取得した Checkout Session が支払い済みか（payment_status が paid のときだけ true） */
export function isSessionPaid(session) {
  return session?.payment_status === "paid";
}

/** Stripe の「その session は存在しない」エラーか（それ以外は一時的な失敗として扱う） */
export function isStripeNotFound(err) {
  return err?.statusCode === 404;
}

/** 注文履歴から、指定の session_id で記録済みの注文を探す */
export function findOrderBySession(orders, sessionId) {
  if (!sessionId || !Array.isArray(orders)) return undefined;
  return orders.find((o) => o?.sessionId === sessionId);
}

/**
 * 注文履歴の先頭に注文を足した新しい配列を返す。
 * sessionId 付きの注文は、同じ sessionId が記録済みなら足さない（元の配列をそのまま返す）。
 * @param {object[]} orders 新しい順の注文履歴
 * @param {{ id?: string, date?: string, items?: object[], total?: number, sessionId?: string }} order
 * @param {Date} [now]
 */
export function appendOrder(orders, order, now = new Date()) {
  const list = Array.isArray(orders) ? orders : [];
  if (order.sessionId && findOrderBySession(list, order.sessionId)) return list;
  const record = {
    id: order.id ?? `ORD-${now.getTime().toString(36).toUpperCase()}`,
    date: order.date ?? now.toISOString(),
    items: order.items ?? [],
    total: order.total ?? 0,
    ...(order.sessionId ? { sessionId: order.sessionId } : {}),
  };
  return [record, ...list];
}
