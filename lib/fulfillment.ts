/**
 * 注文の確定（支払い済みの Checkout Session から、DB に注文を 1 件だけ作る）
 * ---------------------------------------------------
 * Webhook（POST /api/stripe/webhook）・成功ページの決済確認（GET /api/checkout/session）・
 * GraphQL の orderBySession は、どれも同じ fulfillCheckout を呼ぶ。どの順に・何度・同時に呼ばれても、
 * 同じ Checkout Session から注文は 1 件しかできない。
 *  - orders.stripe_session_id の一意制約 + INSERT … ON CONFLICT DO NOTHING が、同時に来た 2 つ目を空振りにする
 *  - 先に DB を探し、あれば Stripe を呼ばずにそれを返す（Webhook のあとに来た成功ページは Stripe に問い合わせない）
 *  - 注文・明細・処理済みイベントの記録は 1 つのトランザクション（途中で失敗したら全部取り消す。再送や再確認でやり直せる）
 *
 * 注文の中身は Webhook の本文ではなく、session_id で Stripe から取り直した Checkout Session から作る
 * （metadata の id と数量をカタログに当てる。既存の orderFromSession をそのまま使う）。
 * 注文の持ち主（orders.user_id）も同じ session から決める: ログイン中に買った決済は client_reference_id に user.id が付いている
 * （createCheckoutSessionCore）ので、その利用者が実在すれば持ち主にする。付いていない・実在しない利用者ならゲスト（null）。
 * どの経路（Webhook・成功ページ・GraphQL）から確定しても、持ち主は Stripe の session だけで決まる（確認ルートを開いた人は関係しない）。
 * DB は引数で受け取る（lib/db/client.ts の getDb() は server-only でテストから読めない。getStripe と同じ流儀）。
 *
 * 支払い済みでも、Stripe の請求額（amount_total）・通貨が、metadata とカタログから作った合計と合わなければ、注文を作らない
 * （決済を作ってから確定するまでにカタログの価格が変わった場合。請求額と違う合計で記録しないため。値を含まない構造化ログを残し、
 * Webhook は 422 を返す。手で直す前提。明細を Stripe の line_items から作る設計は段 7 の課題）。
 *
 * - decideFulfillment / toOrderRows / toStoredOrder / generateOrderNo: DB に触れない純粋な関数
 * - readStoredOrders / findOrderBySessionId / hasProcessedEvent / fulfillCheckout: DB を読み書きする
 *   （利用者ごとの注文の読み取りは lib/order-history.ts。そちらも readStoredOrders で StoredOrder にする）
 */
import { eq, inArray } from "drizzle-orm";
import { getProductById } from "./catalog.ts";
import {
  findPaymentMismatch,
  isSessionPaid,
  isStripeNotFound,
  isValidSessionId,
  orderFromSession,
  ownerIdFromSession,
} from "./checkout.ts";
import type { PaidOrder, PaymentMismatch } from "./checkout.ts";
import type { StripeLike } from "./checkout-session.ts";
import type { Db } from "./db/connect.ts";
import { orderItems, orders, stripeEvents, user } from "./db/schema.ts";
import type { OrderStatus } from "./db/schema.ts";
import { logEvent } from "./log.ts";
import type { OrderItem, ProductLookup } from "./types.ts";

/* ---------- 注文番号 ---------- */

/** 画面に出す注文番号の先頭（お問い合わせフォームの検査 lib/contact.ts も ORD-<英大文字と数字> を受け付ける） */
export const ORDER_NO_PREFIX = "ORD-";
const ORDER_NO_LENGTH = 10;
/**
 * 注文番号に使う 32 文字（Crockford の base32 から読み間違えやすい I L O U を除いたもの）。
 * ちょうど 32 文字なので、乱数 1 バイトの下位 5 ビットで偏りなく選べる。
 */
export const ORDER_NO_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** 乱数のバイト列を返す関数（テストから固定の値を差し込める） */
type RandomBytes = (length: number) => Uint8Array;

const secureRandomBytes: RandomBytes = (length) =>
  crypto.getRandomValues(new Uint8Array(length));

/**
 * 注文番号（ORD- と 10 文字）を作る。1 文字 5 ビットの乱数なので 50 ビット。
 * 万一ほかの注文と重なれば orders.order_no の一意制約が INSERT を失敗させる（確定は失敗し、再送や再確認でやり直せる）。
 */
export function generateOrderNo(
  randomBytes: RandomBytes = secureRandomBytes,
): string {
  let suffix = "";
  for (const byte of randomBytes(ORDER_NO_LENGTH)) {
    suffix += ORDER_NO_ALPHABET[byte & 31];
  }
  return ORDER_NO_PREFIX + suffix;
}

/* ---------- 純粋な関数 ---------- */

/** Checkout Session から見た、注文にしてよいかの判定 */
export type FulfillmentDecision =
  /**
   * 支払い済みで、metadata とカタログから注文を作れた。
   * ownerId は session の client_reference_id（ログイン中に買った人の user.id。ゲストは null）。実在する利用者かは確かめていない
   */
  | { kind: "paid"; order: PaidOrder; ownerId: string | null }
  /** 支払い済みではない（注文を作らない） */
  | { kind: "unpaid" }
  /** 支払い済みだが、metadata から注文を作れない（この店の決済ではない・metadata が壊れている） */
  | { kind: "unreadable"; error: string }
  /** 支払い済みで metadata も読めたが、Stripe の請求額・通貨が自前の合計と合わない（注文を作らない）。field は食い違った項目 */
  | { kind: "mismatch"; field: PaymentMismatch };

/**
 * Stripe から取り直した Checkout Session を「支払い済み / 未払い / 注文を読み取れない / 請求額が合わない」に分ける。
 * 未払いの session は metadata が付いていても注文にしない。支払い済みでも、請求額・通貨が自前の合計と違えば注文にしない。
 */
export function decideFulfillment(
  session: unknown,
  lookup: ProductLookup = getProductById,
): FulfillmentDecision {
  if (!isSessionPaid(session)) return { kind: "unpaid" };
  const result = orderFromSession(session, lookup);
  if (!result.ok) return { kind: "unreadable", error: result.error };
  const mismatch = findPaymentMismatch(session, result.order.total);
  if (mismatch) return { kind: "mismatch", field: mismatch };
  return {
    kind: "paid",
    order: result.order,
    ownerId: ownerIdFromSession(session),
  };
}

type NewOrderRow = typeof orders.$inferInsert;
type NewOrderItemRow = Omit<typeof orderItems.$inferInsert, "orderId">;
type OrderRow = typeof orders.$inferSelect;
type OrderItemRow = typeof orderItems.$inferSelect;

/**
 * 支払い済みの注文から、orders と order_items に入れる行を作る。
 * 名前と単価は購入した時点のカタログの写し（あとでカタログが変わっても注文は変わらない）。
 * order_items の order_id は orders の行ができてから付ける。持ち主（user_id）は meta.userId（実在を確かめた user.id。無ければゲスト = null）。
 */
export function toOrderRows(
  order: PaidOrder,
  meta: { orderNo: string; paidAt: Date; userId?: string | null },
): { order: NewOrderRow; items: NewOrderItemRow[] } {
  return {
    order: {
      orderNo: meta.orderNo,
      userId: meta.userId ?? null,
      stripeSessionId: order.sessionId,
      status: "paid",
      total: order.total,
      paidAt: meta.paidAt,
    },
    items: order.items.map(({ id, name, price, quantity }) => ({
      productId: id,
      name,
      unitPrice: price,
      quantity,
    })),
  };
}

/** DB に確定した注文（画面と API に返す形） */
export type StoredOrder = {
  /** 画面に出す注文番号 */
  orderNo: string;
  /** 持ち主の user.id（ゲストの注文は null）。画面と API の応答には出さない（持ち主かどうかの判定に使う） */
  userId: string | null;
  /** Stripe の Checkout Session の id */
  sessionId: string;
  status: OrderStatus;
  total: number;
  paidAt: Date | null;
  createdAt: Date;
  /** 名前と単価（price）は購入時の写し。画像とカテゴリは表示のためにカタログから引く（カタログに無ければ null） */
  items: OrderItem[];
};

/** 商品 id を数の大きさで比べる（"2" < "10"）。注文の明細は DB が並び順を持たないので、この順で返す */
const compareProductIds = new Intl.Collator("en", { numeric: true }).compare;

/** DB から読んだ行を StoredOrder にする。明細は商品 id の順（どの経路で読んでも同じ並びになる） */
export function toStoredOrder(
  row: OrderRow,
  itemRows: readonly OrderItemRow[],
  lookup: ProductLookup = getProductById,
): StoredOrder {
  const items = [...itemRows]
    .sort((a, b) => compareProductIds(a.productId, b.productId))
    .map((item): OrderItem => {
      const product = lookup(item.productId);
      return {
        id: item.productId,
        name: item.name,
        price: item.unitPrice,
        quantity: item.quantity,
        image: product?.images?.[0] ?? null,
        category: product?.category ?? null,
      };
    });
  return {
    orderNo: row.orderNo,
    userId: row.userId,
    sessionId: row.stripeSessionId,
    status: row.status,
    total: row.total,
    paidAt: row.paidAt,
    createdAt: row.createdAt,
    items,
  };
}

/* ---------- DB の読み書き ---------- */

/**
 * orders の行に明細を足して StoredOrder にする（明細は 1 回の問い合わせでまとめて読む。行の順を保つ）。
 * 注文を DB から読む経路（決済の確認・Webhook・注文履歴）は、どれもこの関数で StoredOrder にする。
 */
export async function readStoredOrders(
  db: Db,
  rows: readonly OrderRow[],
  lookup: ProductLookup = getProductById,
): Promise<StoredOrder[]> {
  if (rows.length === 0) return [];
  const itemRows = await db
    .select()
    .from(orderItems)
    .where(
      inArray(
        orderItems.orderId,
        rows.map((row) => row.id),
      ),
    );
  return rows.map((row) =>
    toStoredOrder(
      row,
      itemRows.filter((item) => item.orderId === row.id),
      lookup,
    ),
  );
}

/** Checkout Session の id で、確定済みの注文を探す（無ければ undefined） */
export async function findOrderBySessionId(
  db: Db,
  sessionId: string,
  lookup: ProductLookup = getProductById,
): Promise<StoredOrder | undefined> {
  const rows = await db
    .select()
    .from(orders)
    .where(eq(orders.stripeSessionId, sessionId))
    .limit(1);
  const [order] = await readStoredOrders(db, rows, lookup);
  return order;
}

/**
 * 注文の持ち主にしてよい利用者か確かめる（実在すればその id、無ければ null）。
 * ログイン中に決済を始めたあと、確定までに利用者が消えていても、注文を失わずにゲストの注文として確定するため
 * （存在しない user を orders.user_id に入れると外部キーで失敗し、支払い済みの注文が確定できなくなる）
 */
async function findOwnerId(
  db: Db,
  ownerId: string | null,
): Promise<string | null> {
  if (ownerId === null) return null;
  const [row] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.id, ownerId))
    .limit(1);
  return row?.id ?? null;
}

/** この Webhook イベントを処理済みとして記録してあるか */
export async function hasProcessedEvent(
  db: Db,
  eventId: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: stripeEvents.id })
    .from(stripeEvents)
    .where(eq(stripeEvents.id, eventId))
    .limit(1);
  return rows.length > 0;
}

/** fulfillCheckout の引数 */
export type FulfillInput = {
  db: Db;
  getStripe: () => StripeLike;
  /** Checkout Session の id（形は中で確かめる） */
  sessionId: string;
  /**
   * Webhook から呼ぶときのイベント id（evt_...）。注文と同じトランザクションで処理済みとして記録する
   * （注文ができたことと、処理済みの記録が、片方だけ残ることがない）。成功ページ・GraphQL からは渡さない。
   */
  eventId?: string;
  /** 注文の paid_at に入れる時刻（テストから固定できる） */
  now?: () => Date;
  /** 注文番号の作り方（テストから固定できる） */
  newOrderNo?: () => string;
  /** 商品の引き方（テストから差し替えられる） */
  lookup?: ProductLookup;
};

/** fulfillCheckout の結果。DB や想定外の失敗は例外のまま投げる（呼び出し側が 5xx にする） */
export type FulfillResult =
  /** 注文が DB にある。created は「この呼び出しが作った」（false = 既にあった / 同時に来た別の呼び出しが作った） */
  | { status: "fulfilled"; order: StoredOrder; created: boolean }
  /** 未払い、またはその Checkout Session が Stripe に存在しない（注文は作っていない） */
  | { status: "unpaid" }
  /** session_id の形が不正（Stripe も DB も呼んでいない） */
  | { status: "invalid-session-id" }
  /** Stripe から Checkout Session を取れなかった（404 以外。cause は呼び出し側がログに出す） */
  | { status: "stripe-error"; cause: unknown }
  /** 支払い済みだが、metadata から注文を作れなかった */
  | { status: "unreadable-order"; error: string }
  /** 支払い済みだが、請求額・通貨が自前の合計と合わなかった（注文は作っていない。値を含まない記録は fulfillCheckout が残した） */
  | { status: "payment-mismatch"; field: PaymentMismatch };

/** 処理済みのイベントとして記録する（記録済みなら何もしない） */
function recordEvent(db: Db, eventId: string) {
  return db.insert(stripeEvents).values({ id: eventId }).onConflictDoNothing();
}

/**
 * 支払い済みの Checkout Session から、注文を 1 件だけ確定する（冪等）。
 * 1. 既に DB に注文があれば、Stripe を呼ばずにそれを返す
 * 2. Stripe から Checkout Session を取り直し、支払い済みでなければ何もしない
 * 3. 1 トランザクションで orders（ON CONFLICT DO NOTHING）・order_items・処理済みイベントを書き、DB の注文を返す
 */
export async function fulfillCheckout({
  db,
  getStripe,
  sessionId,
  eventId,
  now = () => new Date(),
  newOrderNo = generateOrderNo,
  lookup = getProductById,
}: FulfillInput): Promise<FulfillResult> {
  if (!isValidSessionId(sessionId)) return { status: "invalid-session-id" };

  const existing = await findOrderBySessionId(db, sessionId, lookup);
  if (existing) {
    // 注文は既にあるので、イベントを処理済みにしても失われるものは無い
    if (eventId) await recordEvent(db, eventId);
    return { status: "fulfilled", order: existing, created: false };
  }

  let session: unknown;
  try {
    session = await getStripe().checkout.sessions.retrieve(sessionId);
  } catch (cause) {
    if (!isStripeNotFound(cause)) return { status: "stripe-error", cause };
    // Webhook（eventId がある）が届けた決済を Stripe が知らない: 署名の通ったイベントなので、STRIPE_SECRET_KEY が
    // 別のアカウント・別のモードの鍵かもしれない（成功ページの経路は、利用者が好きな id を送れるので記録しない）
    if (eventId) {
      logEvent("warn", "fulfillment.session-not-found", {
        eventId,
        sessionId,
        hint: "STRIPE_SECRET_KEY と STRIPE_WEBHOOK_SECRET が同じアカウント・同じモード（テスト / 本番）か確かめる",
      });
    }
    return { status: "unpaid" };
  }

  const decision = decideFulfillment(session, lookup);
  if (decision.kind === "unpaid") {
    // Webhook の checkout.session.completed なのに未払い（あとから入金される支払い方法）。注文は作らず入金のイベントを待つ
    if (eventId) {
      logEvent("warn", "fulfillment.session-unpaid", { eventId, sessionId });
    }
    return { status: "unpaid" };
  }
  if (decision.kind === "unreadable") {
    return { status: "unreadable-order", error: decision.error };
  }
  if (decision.kind === "mismatch") {
    // 値（金額・通貨・品目）は書かない。どの決済かと、食い違った項目だけ（手で直すときは Stripe のダッシュボードで session を見る）
    logEvent("error", "fulfillment.payment-mismatch", {
      eventId,
      sessionId,
      field: decision.field,
    });
    return { status: "payment-mismatch", field: decision.field };
  }

  // 持ち主は、確かめてからトランザクションの外で決める（確かめたあとに利用者が消えると外部キーで失敗するが、
  // そのときは確定が失敗するだけで半端な注文は残らず、再送や再確認でやり直せば、利用者が居ないのでゲストの注文になる）
  const rows = toOrderRows(decision.order, {
    orderNo: newOrderNo(),
    paidAt: now(),
    userId: await findOwnerId(db, decision.ownerId),
  });
  // トランザクションの中では tx だけを使う（db を使うと、PGlite では自分の終わりを待って止まる）
  return db.transaction(async (tx): Promise<FulfillResult> => {
    const [inserted] = await tx
      .insert(orders)
      .values(rows.order)
      .onConflictDoNothing({ target: orders.stripeSessionId })
      .returning({ id: orders.id });
    // 空振り = 同時に来た別の呼び出しが先に確定した。明細はそちらが入れているので足さない
    if (inserted) {
      await tx
        .insert(orderItems)
        .values(rows.items.map((item) => ({ ...item, orderId: inserted.id })));
    }
    if (eventId) await recordEvent(tx, eventId);
    const order = await findOrderBySessionId(tx, sessionId, lookup);
    if (!order) throw new Error("確定した注文を読み戻せませんでした");
    return { status: "fulfilled", order, created: inserted !== undefined };
  });
}
