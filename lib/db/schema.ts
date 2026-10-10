/**
 * DB のスキーマ（Drizzle）
 * ---------------------------------------------------
 * ここが表・制約・外部キーの正本。`npm run db:generate`（drizzle-kit generate）が drizzle/ に SQL のマイグレーションを出す。
 * 生成物はコミットし、CI が「generate を打っても差分が出ない」ことで鮮度を確かめる。`drizzle-kit push` は使わない（履歴が残らない）。
 *
 * 商品の正本は lib/catalog.ts のまま。products 表は scripts/seed-products.ts がカタログから upsert する
 * （order_items の外部キーと在庫のため。商品ページの SSG は DB を読まない）。
 * 注文は fulfillCheckout（lib/fulfillment.ts）だけが書く。Webhook・決済確認 API・GraphQL の orderBySession が、それを通して orders / order_items / stripe_events を読み書きする。
 * 商品ページ・一覧・カートは DB を読まない。
 */
import { sql } from "drizzle-orm";
import {
  check,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { MAX_QUANTITY, MIN_QUANTITY } from "../cart.ts";

/** 注文の状態（orders.status）。型と CHECK 制約の両方がこの 1 つから作られる */
export const ORDER_STATUSES = ["paid", "pending", "failed"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/**
 * CHECK 制約へ埋め込む定数。drizzle-kit が DDL を出すときは値がパラメータ（$1）にならず困るので、SQL にそのまま入れる。
 * このファイルの定数（数・固定の文字列）だけを渡す。外から来た値は渡さない。
 */
const literal = (value: number | string) =>
  sql.raw(
    typeof value === "number"
      ? String(value)
      : `'${value.replaceAll("'", "''")}'`,
  );

/** 時刻の列（タイムゾーン付き） */
const timestamptz = (name: string) => timestamp(name, { withTimezone: true });

/** 商品。id は lib/catalog.ts の id */
export const products = pgTable(
  "products",
  {
    id: text("id").primaryKey(),
    /** 税込の円（整数） */
    price: integer("price").notNull(),
    /** 在庫数。null = 在庫を管理しない（段 7 から使う。seed は触らない） */
    stock: integer("stock"),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    check("products_price_nonnegative", sql`${t.price} >= 0`),
    check("products_stock_nonnegative", sql`${t.stock} >= 0`),
  ],
);

/** 注文。Stripe の Checkout Session 1 つにつき 1 件（stripe_session_id の一意制約が二重確定を止める） */
export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** 画面に出す注文番号 */
    orderNo: text("order_no").notNull().unique("orders_order_no_unique"),
    /** 持ち主。null = ゲスト。user 表は段 3（認証）で作るので、外部キーはそのときに張る */
    userId: text("user_id"),
    stripeSessionId: text("stripe_session_id")
      .notNull()
      .unique("orders_stripe_session_id_unique"),
    status: text("status", { enum: ORDER_STATUSES }).notNull(),
    /** 税込の円（整数） */
    total: integer("total").notNull(),
    paidAt: timestamptz("paid_at"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [
    check("orders_total_nonnegative", sql`${t.total} >= 0`),
    check(
      "orders_status_valid",
      sql`${t.status} in (${sql.join(ORDER_STATUSES.map(literal), sql`, `)})`,
    ),
  ],
);

/**
 * 注文の明細。名前と単価は購入した時点のカタログの写し（あとでカタログが変わっても注文は変わらない）。
 * 数量の上下限は lib/cart.ts の MIN_QUANTITY / MAX_QUANTITY と同じ値（変えると generate の差分が出て CI が落ちる）。
 */
export const orderItems = pgTable(
  "order_items",
  {
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    unitPrice: integer("unit_price").notNull(),
    quantity: integer("quantity").notNull(),
  },
  (t) => [
    primaryKey({ name: "order_items_pkey", columns: [t.orderId, t.productId] }),
    check(
      "order_items_quantity_range",
      sql`${t.quantity} between ${literal(MIN_QUANTITY)} and ${literal(MAX_QUANTITY)}`,
    ),
    check("order_items_unit_price_nonnegative", sql`${t.unitPrice} >= 0`),
  ],
);

/** 処理した Stripe の Webhook イベント。同じ id は 2 回処理しない（主キーの一意制約 + ON CONFLICT DO NOTHING） */
export const stripeEvents = pgTable("stripe_events", {
  /** evt_... */
  id: text("id").primaryKey(),
  processedAt: timestamptz("processed_at").notNull().defaultNow(),
});
