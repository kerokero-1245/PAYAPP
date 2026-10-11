/**
 * DB のスキーマ（Drizzle）
 * ---------------------------------------------------
 * ここが表・制約・外部キーの正本。`npm run db:generate`（drizzle-kit generate）が drizzle/ に SQL のマイグレーションを出す。
 * 生成物はコミットし、CI が「generate を打っても差分が出ない」ことで鮮度を確かめる。`drizzle-kit push` は使わない（履歴が残らない）。
 *
 * 商品の正本は lib/catalog.ts のまま。products 表は scripts/seed-products.ts がカタログから upsert する
 * （order_items の外部キーと在庫のため。商品ページの SSG は DB を読まない）。
 * 注文は fulfillCheckout（lib/fulfillment.ts）だけが書く。Webhook・決済確認 API・GraphQL の orderBySession が、それを通して orders / order_items / stripe_events を読み書きする。
 * 利用者ごとの注文の読み取り（GraphQL の myOrders・order と、ページ /orders）は lib/order-history.ts が受け持つ。
 * 商品ページ・一覧・カートは DB を読まない。
 * 認証の表（user・session・account・verification）は Better Auth（lib/auth/）が読み書きする。アプリのコードは直接書かない。
 */
import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
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

/* ---------- 認証（Better Auth） ---------- */

/**
 * 認証の表。Better Auth が読み書きする（lib/auth/config.ts の drizzleAdapter に渡す）。
 * 列は Better Auth の CLI（`npx auth@1.7.6 generate --adapter drizzle --dialect postgresql`）の出力が正本で、
 * このリポジトリの書き方に合わせたのは時刻の列だけ（生成物は timestamp（タイムゾーン無し）、ここは timestamptz）。
 * プロパティ名（emailVerified・createdAt など）は Better Auth のフィールド名で、アダプタはこの名前で列を引く。変えない。
 * Better Auth を上げたとき、表と列の過不足は tests/auth.test.ts の「認証の表」が検出する。
 * role 列は持たない（管理画面の段で足す）。
 */

/** 利用者。email は Better Auth が小文字にして保存し、一意 */
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: timestamptz("created_at").defaultNow().notNull(),
  updatedAt: timestamptz("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

/** ログインのセッション。token は一意。利用者を消すとセッションも消える */
export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamptz("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
    updatedAt: timestamptz("updated_at")
      .$onUpdate(() => new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_userId_idx").on(table.userId)],
);

/**
 * 認証方法ごとの口座。メール + パスワードは providerId = "credential" の行で、password にハッシュ（scrypt。salt:key の 16 進）が入る。
 * 利用者を消すと口座も消える
 */
export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamptz("access_token_expires_at"),
    refreshTokenExpiresAt: timestamptz("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
    updatedAt: timestamptz("updated_at")
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("account_userId_idx").on(table.userId)],
);

/** メール確認・パスワード再設定などの一時的な値。今は使わない（メール確認も再設定も付けていない）が、Better Auth が要求する表 */
export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamptz("expires_at").notNull(),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
    updatedAt: timestamptz("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, { fields: [session.userId], references: [user.id] }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, { fields: [account.userId], references: [user.id] }),
}));

/* ---------- 商品・注文 ---------- */

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
    /**
     * 持ち主。null = ゲスト（ログインせずに買った注文）。ログイン中に買った注文は、Checkout Session の client_reference_id（= user.id）を入れる。
     * 利用者を消しても注文は残す（持ち主だけ外れて、ゲストの注文になる）
     */
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
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
    // 利用者ごとの注文履歴（lib/order-history.ts）の絞り込みと、利用者を消したときの user_id の付け替え（ON DELETE SET NULL）の走査に使う。
    // 外部キーは索引を作らない
    index("orders_user_id_idx").on(t.userId),
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
