/**
 * 注文履歴のテストの道具（持ち主と日時を指定して、注文を DB に直接入れる）
 * ---------------------------------------------------
 * fulfillCheckout は注文を「いま」の時刻で作り、持ち主は Stripe の session から決まる。履歴の並びや持ち主ごとの絞り込みを確かめるには、
 * 時刻と持ち主を自由に決めたいので、fulfillCheckout と同じ行の組み立て（toOrderRows）で直接入れる。
 * `tests/*.test.ts` のグロブには当たらないので、テストとしては実行されない。
 */
import assert from "node:assert/strict";
import { orderFromSession } from "../../lib/checkout.ts";
import type { Db } from "../../lib/db/connect.ts";
import { orderItems, orders, user } from "../../lib/db/schema.ts";
import { toOrderRows } from "../../lib/fulfillment.ts";
import type { ItemQuantity } from "../../lib/types.ts";
import { paidSession } from "./stripe.ts";

/** 買った品目の既定（商品 1 を 2 点と商品 5 を 1 点） */
export const DEFAULT_ITEMS: ItemQuantity[] = [
  { id: "1", quantity: 2 },
  { id: "5", quantity: 1 },
];

/** 時刻の基準。placeOrder の既定の時刻は、n 分後 */
export const BASE_TIME = Date.parse("2026-10-11T00:00:00.000Z");

/** 基準から minutes 分後の時刻 */
export const timeAt = (minutes: number): Date =>
  new Date(BASE_TIME + minutes * 60_000);

/** 利用者を 1 人入れる（認証の表。Better Auth を通さず、注文の持ち主にできる利用者だけを用意する） */
export async function insertUser(db: Db, id: string): Promise<void> {
  await db
    .insert(user)
    .values({ id, name: `利用者 ${id}`, email: `${id}@example.com` });
}

/** placeOrder が決める注文番号（n ごとに別。画面に出す番号の形 ORD- と 10 文字） */
export const orderNoOf = (n: number): string =>
  `ORD-TEST${String(n).padStart(6, "0")}`;

/**
 * 注文を 1 件入れて、その注文番号を返す。Checkout Session の id は cs_test_<n>。
 * userId を省くとゲストの注文。時刻（created_at と paid_at）の既定は BASE_TIME の n 分後
 */
export async function placeOrder(
  db: Db,
  n: number,
  {
    userId = null,
    items = DEFAULT_ITEMS,
    at = timeAt(n),
  }: { userId?: string | null; items?: ItemQuantity[]; at?: Date } = {},
): Promise<string> {
  const result = orderFromSession(paidSession(`cs_test_${n}`, items));
  assert.ok(result.ok, "前提: 品目がカタログにある");
  const rows = toOrderRows(result.order, {
    orderNo: orderNoOf(n),
    paidAt: at,
    userId,
  });
  const [inserted] = await db
    .insert(orders)
    .values({ ...rows.order, createdAt: at })
    .returning({ id: orders.id });
  assert.ok(inserted);
  await db
    .insert(orderItems)
    .values(rows.items.map((item) => ({ ...item, orderId: inserted.id })));
  return orderNoOf(n);
}
