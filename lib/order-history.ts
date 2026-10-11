/**
 * 注文履歴（利用者ごとの注文の読み取り）
 * ---------------------------------------------------
 * GraphQL の myOrders・order と、ページ /orders は、どれも同じ関数を呼ぶ。ここは読むだけで、注文を書くのは
 * lib/fulfillment.ts の fulfillCheckout だけ。
 *  - 持ち主の絞り込み（orders.user_id = 利用者の id）は、このファイルの SQL の where にだけ書く。ゲストの注文（user_id が null）は
 *    どの利用者の履歴にも出ない。他の人の注文は、番号を知っていても返さず、存在しないのと同じ見え方にする（存在を漏らさない）
 *  - 並びは新しい順（created_at の降順、同じなら id の降順）。ページ送りは、前のページの最後の注文の番号（cursor）の「次」から取る
 *    （番号から created_at を DB の中で引くので、JS の Date に丸めたときに失われるマイクロ秒でページの境目がずれることはない）
 *
 * DB は引数で受け取る（lib/db/client.ts の getDb() は server-only でテストから読めない。getStripe と同じ流儀）。
 */
import { and, desc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getProductById } from "./catalog.ts";
import type { Db } from "./db/connect.ts";
import { orders } from "./db/schema.ts";
import { readStoredOrders } from "./fulfillment.ts";
import type { StoredOrder } from "./fulfillment.ts";
import type { ProductLookup } from "./types.ts";

/** GraphQL の myOrders(first:) の既定と上限（1 ページの件数） */
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 50;

/** /orders が 1 回で読む注文の上限。これより古い注文は出さない（1 人でこれだけの注文を持つことは想定しない） */
export const MAX_HISTORY_ORDERS = 500;

/** 1 ページの件数として受け付ける値か（1〜MAX_PAGE_SIZE の整数） */
export function isValidPageSize(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= MAX_PAGE_SIZE
  );
}

/** 注文の 1 ページ */
export type OrderPage = {
  orders: StoredOrder[];
  /** 次のページがあるときだけ、このページの最後の注文の番号（次の呼び出しの after にそのまま渡す）。最後のページは null */
  nextCursor: string | null;
};

export type ListOrdersOptions = {
  /** 1 ページの件数（1〜MAX_PAGE_SIZE。既定は DEFAULT_PAGE_SIZE） */
  first?: number;
  /** 前のページの nextCursor。この注文より古いものから返す。知らない番号・他の人の注文の番号は、空のページになる */
  after?: string | null;
  /** 商品の引き方（テストから差し替えられる） */
  lookup?: ProductLookup;
};

/**
 * 前のページの最後の注文（after）より古い注文だけを選ぶ条件。
 * after の注文の created_at と id は DB の中で引く（持ち主の注文に限る。他の人の注文の番号を渡しても、何も選ばれない）。
 */
function olderThan(db: Db, userId: string, after: string) {
  const cursor = alias(orders, "cursor_order");
  const cursorRow = db
    .select({ createdAt: cursor.createdAt, id: cursor.id })
    .from(cursor)
    .where(and(eq(cursor.orderNo, after), eq(cursor.userId, userId)));
  return sql`(${orders.createdAt}, ${orders.id}) < (${cursorRow})`;
}

/**
 * 利用者の注文を新しい順に 1 ページ返す。この利用者の注文（orders.user_id が一致するもの）だけで、
 * ゲストの注文・他の人の注文は含まない。
 */
export async function listOrdersByUser(
  db: Db,
  userId: string,
  {
    first = DEFAULT_PAGE_SIZE,
    after,
    lookup = getProductById,
  }: ListOrdersOptions = {},
): Promise<OrderPage> {
  if (!isValidPageSize(first)) {
    throw new RangeError(
      `first は 1〜${MAX_PAGE_SIZE} の整数にしてください: ${String(first)}`,
    );
  }
  // 1 件多く読んで、次のページがあるかを知る
  const rows = await db
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.userId, userId),
        after ? olderThan(db, userId, after) : undefined,
      ),
    )
    .orderBy(desc(orders.createdAt), desc(orders.id))
    .limit(first + 1);
  const pageRows = rows.slice(0, first);
  const last = pageRows.at(-1);
  return {
    orders: await readStoredOrders(db, pageRows, lookup),
    nextCursor: rows.length > first && last ? last.orderNo : null,
  };
}

/** 注文番号で、利用者自身の注文を 1 件探す。他の人の注文・ゲストの注文・存在しない番号はどれも undefined */
export async function findOrderOfUser(
  db: Db,
  userId: string,
  orderNo: string,
  lookup: ProductLookup = getProductById,
): Promise<StoredOrder | undefined> {
  const rows = await db
    .select()
    .from(orders)
    .where(and(eq(orders.orderNo, orderNo), eq(orders.userId, userId)))
    .limit(1);
  const [order] = await readStoredOrders(db, rows, lookup);
  return order;
}

/**
 * 利用者の注文を新しい順に、上限まで全部集める（/orders のページが使う）。
 * 1 ページずつ読み進め、最後のページか、limit 件に届いたところで止める。
 */
export async function listAllOrdersByUser(
  db: Db,
  userId: string,
  {
    pageSize = MAX_PAGE_SIZE,
    limit = MAX_HISTORY_ORDERS,
    lookup = getProductById,
  }: { pageSize?: number; limit?: number; lookup?: ProductLookup } = {},
): Promise<StoredOrder[]> {
  const collected: StoredOrder[] = [];
  let after: string | null = null;
  while (collected.length < limit) {
    const page: OrderPage = await listOrdersByUser(db, userId, {
      first: pageSize,
      after,
      lookup,
    });
    collected.push(...page.orders);
    if (page.nextCursor === null) break;
    after = page.nextCursor;
  }
  return collected.slice(0, limit);
}
