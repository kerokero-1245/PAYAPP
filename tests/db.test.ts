// DB 基盤（スキーマ・マイグレーション・seed・接続先の決め方）のテスト。実行: npm test
//
// なぜあるか: 注文と在庫をサーバに置くための土台。注文の確定（fulfillCheckout。tests/fulfillment.test.ts ほか）はここで固定する制約を前提に動き、
// 後の段（認証・注文履歴・在庫）も同じ制約を前提にする。
//  - 二重確定: orders.stripe_session_id と stripe_events.id の一意制約で止める
//  - 数量: order_items.quantity は lib/cart.ts の MIN_QUANTITY〜MAX_QUANTITY と同じ範囲
//  - 在庫: seed を打ち直しても stock を上書きしない
// DB は PGlite をテストごとにメモリ上に立て、drizzle/ の全マイグレーションを当てた状態から始める（外部のサービスは使わない）。
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { eq } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";

import { MAX_QUANTITY, MIN_QUANTITY } from "../lib/cart.ts";
import { PRODUCTS } from "../lib/catalog.ts";
import {
  PGLITE_DATA_DIR,
  connectDb,
  describeDbTarget,
  resolveDbTarget,
} from "../lib/db/connect.ts";
import type { Db } from "../lib/db/connect.ts";
import { loadLocalEnv } from "../lib/db/load-env.ts";
import {
  account,
  orderItems,
  orders,
  products,
  session,
  stripeEvents,
  user,
} from "../lib/db/schema.ts";
import { seedProducts } from "../lib/db/seed.ts";
import {
  MIGRATIONS_FOLDER,
  PG_CHECK_VIOLATION,
  PG_FOREIGN_KEY_VIOLATION,
  PG_RESTRICT_VIOLATION,
  PG_UNIQUE_VIOLATION,
  assertPgError,
  createTestDb,
  withTestDb,
} from "../lib/db/test-helpers.ts";

type NewOrder = typeof orders.$inferInsert;

/** 注文 1 件ぶんの入力（番号ごとに注文番号と Checkout Session の id がずれる） */
const newOrder = (n: number, overrides: Partial<NewOrder> = {}): NewOrder => ({
  orderNo: `MS-${n}`,
  stripeSessionId: `cs_test_${n}`,
  status: "paid",
  total: 248000,
  ...overrides,
});

/** 注文を 1 件入れて、その id を返す */
async function insertOrder(
  db: Db,
  n = 1,
  overrides: Partial<NewOrder> = {},
): Promise<string> {
  const [row] = await db
    .insert(orders)
    .values(newOrder(n, overrides))
    .returning({ id: orders.id });
  assert.ok(row);
  return row.id;
}

/** 明細 1 行ぶんの入力（商品は seed 済みのカタログから） */
const newItem = (orderId: string, productId: string, quantity = 1) => ({
  orderId,
  productId,
  name: "Éclat Automatic 41",
  unitPrice: 248000,
  quantity,
});

const byId = (a: { id: string }, b: { id: string }) =>
  a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

// ---------- マイグレーション ----------

test("マイグレーション: 履歴どおり全部当たり、8 つの表（注文の 4 つと認証の 4 つ）ができる", () =>
  withTestDb(async ({ client }) => {
    const tables = await client.query<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema = 'public' order by table_name",
    );
    assert.deepEqual(
      tables.rows.map((row) => row.table_name),
      [
        "account",
        "order_items",
        "orders",
        "products",
        "session",
        "stripe_events",
        "user",
        "verification",
      ],
    );

    // drizzle/meta/_journal.json（外から来る値なので unknown で受けて絞る）の件数と、当たった件数・SQL の件数が一致する
    const journal: unknown = JSON.parse(
      fs.readFileSync(
        path.join(MIGRATIONS_FOLDER, "meta", "_journal.json"),
        "utf8",
      ),
    );
    assert.ok(
      typeof journal === "object" &&
        journal !== null &&
        "entries" in journal &&
        Array.isArray(journal.entries),
    );
    const applied = await client.query<{ n: number }>(
      "select count(*)::int as n from drizzle.__drizzle_migrations",
    );
    assert.equal(applied.rows[0]?.n, journal.entries.length);
    assert.ok(journal.entries.length >= 1);
    const sqlFiles = fs
      .readdirSync(MIGRATIONS_FOLDER)
      .filter((name) => name.endsWith(".sql"));
    assert.equal(
      sqlFiles.length,
      journal.entries.length,
      "履歴に載っていない SQL がある（generate を打たずに手で置いた？）",
    );
  }));

test("テストごとの DB は独立している（片方で入れた行がもう片方に見えない）", async () => {
  await withTestDb(async ({ db }) => {
    await db.insert(stripeEvents).values({ id: "evt_isolated" });
    assert.equal((await db.select().from(stripeEvents)).length, 1);
  });
  await withTestDb(async ({ db }) => {
    assert.equal((await db.select().from(stripeEvents)).length, 0);
  });
});

// ---------- seed ----------

test("seed: カタログの全商品が入り、2 回目は何も変えない（冪等）", () =>
  withTestDb(async ({ db }) => {
    assert.equal(await seedProducts(db), PRODUCTS.length);
    const first = await db.select().from(products);
    assert.deepEqual(
      first.map(({ id, price, stock }) => ({ id, price, stock })).sort(byId),
      PRODUCTS.map(({ id, price }) => ({ id, price, stock: null })).sort(byId),
      "価格はカタログと同じで、在庫は null（= 在庫を管理しない）",
    );

    assert.equal(await seedProducts(db), 0, "変わった行が無いので 0 件");
    const second = await db.select().from(products);
    assert.deepEqual(
      second.sort(byId),
      first.sort(byId),
      "updated_at も含めて 1 回目と同じ",
    );
  }));

test("seed: 価格がずれていれば直すが、在庫は上書きしない", () =>
  withTestDb(async ({ db }) => {
    await seedProducts(db);
    await db
      .update(products)
      .set({ price: 1, stock: 7 })
      .where(eq(products.id, "1"));

    assert.equal(await seedProducts(db), 1, "ずれていた 1 件だけ更新する");
    const [row] = await db.select().from(products).where(eq(products.id, "1"));
    assert.equal(row?.price, PRODUCTS[0]?.price);
    assert.equal(
      row?.stock,
      7,
      "在庫は DB が正本。seed を打ち直しても戻さない",
    );
  }));

test("seed: カタログから消えた商品は消さず、空のカタログは何もしない", () =>
  withTestDb(async ({ db }) => {
    await seedProducts(db);
    assert.equal(await seedProducts(db, []), 0);
    assert.equal(await seedProducts(db, [{ id: "1", price: 248000 }]), 0);
    assert.equal((await db.select().from(products)).length, PRODUCTS.length);
  }));

// ---------- 制約: products ----------

test("制約: products — 同じ id は入らない / 価格と在庫は負にできない", () =>
  withTestDb(async ({ db }) => {
    await db.insert(products).values({ id: "p1", price: 1000 });
    await assertPgError(
      () => db.insert(products).values({ id: "p1", price: 2000 }),
      {
        code: PG_UNIQUE_VIOLATION,
        constraint: "products_pkey",
      },
    );
    await assertPgError(
      () => db.insert(products).values({ id: "p2", price: -1 }),
      {
        code: PG_CHECK_VIOLATION,
        constraint: "products_price_nonnegative",
      },
    );
    await assertPgError(
      () => db.insert(products).values({ id: "p3", price: 1000, stock: -1 }),
      {
        code: PG_CHECK_VIOLATION,
        constraint: "products_stock_nonnegative",
      },
    );
    // 在庫 0 と null（管理しない）は入る
    await db.insert(products).values([
      { id: "p4", price: 1000, stock: 0 },
      { id: "p5", price: 1000 },
    ]);
  }));

// ---------- 制約: orders ----------

test("制約: orders — 合計は負にできない / 状態は paid・pending・failed だけ", () =>
  withTestDb(async ({ db, client }) => {
    await assertPgError(
      () => db.insert(orders).values(newOrder(1, { total: -1 })),
      {
        code: PG_CHECK_VIOLATION,
        constraint: "orders_total_nonnegative",
      },
    );
    // 型が許さない状態は、生の SQL で入れて DB が止めることを確かめる
    await assertPgError(
      () =>
        client.query(
          "insert into orders (order_no, stripe_session_id, status, total) values ('MS-2', 'cs_test_2', 'shipped', 1)",
        ),
      { code: PG_CHECK_VIOLATION, constraint: "orders_status_valid" },
    );
    for (const [n, status] of [
      [3, "paid"],
      [4, "pending"],
      [5, "failed"],
    ] as const) {
      await insertOrder(db, n, { status });
    }
    await insertOrder(db, 6, { total: 0, userId: null });
  }));

test("制約: orders — 注文番号と Checkout Session の id は 1 つの注文にだけ付き、二重の確定は ON CONFLICT DO NOTHING で 0 件になる", () =>
  withTestDb(async ({ db }) => {
    await insertOrder(db, 1);
    await assertPgError(
      () => db.insert(orders).values(newOrder(2, { orderNo: "MS-1" })),
      {
        code: PG_UNIQUE_VIOLATION,
        constraint: "orders_order_no_unique",
      },
    );
    await assertPgError(
      () =>
        db.insert(orders).values(newOrder(3, { stripeSessionId: "cs_test_1" })),
      {
        code: PG_UNIQUE_VIOLATION,
        constraint: "orders_stripe_session_id_unique",
      },
    );

    const again = await db
      .insert(orders)
      .values(newOrder(4, { stripeSessionId: "cs_test_1" }))
      .onConflictDoNothing({ target: orders.stripeSessionId })
      .returning({ id: orders.id });
    assert.deepEqual(again, [], "同じ session の 2 回目は注文を増やさない");
    assert.equal((await db.select().from(orders)).length, 1);
  }));

// ---------- 制約: order_items ----------

test("制約: order_items — 数量は MIN_QUANTITY〜MAX_QUANTITY（lib/cart.ts と同じ範囲）", () =>
  withTestDb(async ({ db }) => {
    await seedProducts(db);
    const orderId = await insertOrder(db);

    for (const quantity of [MIN_QUANTITY - 1, -1, MAX_QUANTITY + 1]) {
      await assertPgError(
        () => db.insert(orderItems).values(newItem(orderId, "1", quantity)),
        {
          code: PG_CHECK_VIOLATION,
          constraint: "order_items_quantity_range",
        },
      );
    }
    // 端の値は入る
    await db
      .insert(orderItems)
      .values([
        newItem(orderId, "1", MIN_QUANTITY),
        newItem(orderId, "2", MAX_QUANTITY),
      ]);
    assert.equal((await db.select().from(orderItems)).length, 2);

    await assertPgError(
      () =>
        db
          .insert(orderItems)
          .values({ ...newItem(orderId, "3"), unitPrice: -1 }),
      {
        code: PG_CHECK_VIOLATION,
        constraint: "order_items_unit_price_nonnegative",
      },
    );
  }));

test("制約: order_items — 存在しない注文・存在しない商品は参照できない", () =>
  withTestDb(async ({ db }) => {
    await seedProducts(db);
    const orderId = await insertOrder(db);

    await assertPgError(
      () => db.insert(orderItems).values(newItem(crypto.randomUUID(), "1")),
      {
        code: PG_FOREIGN_KEY_VIOLATION,
        constraint: "order_items_order_id_orders_id_fk",
      },
    );
    await assertPgError(
      () => db.insert(orderItems).values(newItem(orderId, "no-such-product")),
      {
        code: PG_FOREIGN_KEY_VIOLATION,
        constraint: "order_items_product_id_products_id_fk",
      },
    );
    assert.equal((await db.select().from(orderItems)).length, 0);
  }));

test("制約: order_items — 同じ注文に同じ商品の行は 2 つ入らない", () =>
  withTestDb(async ({ db }) => {
    await seedProducts(db);
    const orderId = await insertOrder(db);
    await db.insert(orderItems).values(newItem(orderId, "1"));
    await assertPgError(
      () => db.insert(orderItems).values(newItem(orderId, "1", 2)),
      {
        code: PG_UNIQUE_VIOLATION,
        constraint: "order_items_pkey",
      },
    );
  }));

test("外部キー: 注文を消すと明細も消え、売れた商品は消せない", () =>
  withTestDb(async ({ db }) => {
    await seedProducts(db);
    const orderId = await insertOrder(db);
    await db.insert(orderItems).values(newItem(orderId, "1"));

    await assertPgError(() => db.delete(products).where(eq(products.id, "1")), {
      code: PG_RESTRICT_VIOLATION,
      constraint: "order_items_product_id_products_id_fk",
    });

    await db.delete(orders).where(eq(orders.id, orderId));
    assert.equal(
      (await db.select().from(orderItems)).length,
      0,
      "注文と一緒に明細が消える",
    );
    await db.delete(products).where(eq(products.id, "1"));
    assert.equal(
      (await db.select().from(products)).length,
      PRODUCTS.length - 1,
      "明細が無くなれば商品は消せる",
    );
  }));

// ---------- 認証の表と、orders.user_id の外部キー ----------

/** 利用者を 1 人入れる（Better Auth を通さず、行だけ） */
const newUser = (n: number) => ({
  id: `user_${n}`,
  name: `利用者 ${n}`,
  email: `user${n}@example.com`,
});

test("外部キー: orders.user_id は user を指す（存在しない利用者は拒否、null のゲストは入る）。利用者を消しても注文は残り、user_id だけ null になる", () =>
  withTestDb(async ({ db }) => {
    await db.insert(user).values(newUser(1));

    await assertPgError(
      () => db.insert(orders).values(newOrder(1, { userId: "user_gone" })),
      {
        code: PG_FOREIGN_KEY_VIOLATION,
        constraint: "orders_user_id_user_id_fk",
      },
    );
    assert.equal((await db.select().from(orders)).length, 0);

    const owned = await insertOrder(db, 2, { userId: "user_1" });
    const guest = await insertOrder(db, 3, { userId: null });
    assert.equal(
      (await db.select().from(orders).where(eq(orders.id, owned)))[0]?.userId,
      "user_1",
    );

    await db.delete(user).where(eq(user.id, "user_1"));
    const after = await db.select().from(orders);
    assert.deepEqual(
      after.map(({ id, userId }) => ({ id, userId })).sort(byId),
      [
        { id: owned, userId: null },
        { id: guest, userId: null },
      ].sort(byId),
      "注文は 2 件とも残り、持ち主だけが外れる（ゲストの注文になる）",
    );
  }));

test("索引: orders.user_id に索引がある（マイグレーションが作り、スキーマの定義と一致する）。利用者ごとの注文履歴の絞り込みと、利用者を消すときの user_id の付け替えが、全件の走査にならない", () =>
  withTestDb(async ({ client }) => {
    const { rows } = await client.query<{ indexdef: string }>(
      "select indexdef from pg_indexes where schemaname = 'public' and tablename = 'orders' and indexname = 'orders_user_id_idx'",
    );
    assert.equal(rows.length, 1, "マイグレーションが索引を作っている");
    assert.match(rows[0]!.indexdef, /^CREATE INDEX orders_user_id_idx ON /);
    assert.match(rows[0]!.indexdef, /USING btree \(user_id\)$/);

    // スキーマ（Drizzle）の定義にも同じ索引がある。片方だけ直して db:generate を忘れた食い違いを、CI の前に見つける
    // （索引の列は、表の定義とは別のオブジェクトなので、列の名前で比べる）
    const declared = getTableConfig(orders).indexes.find(
      (index) => index.config.name === "orders_user_id_idx",
    );
    assert.ok(declared, "スキーマに索引がある");
    assert.deepEqual(
      declared.config.columns.map((c) => ("name" in c ? c.name : null)),
      ["user_id"],
    );
  }));

test("制約: 認証の表 — user.email と session.token は一意で、session・account は存在しない利用者を指せない。利用者を消すとセッションと口座も消える", () =>
  withTestDb(async ({ db }) => {
    await db.insert(user).values(newUser(1));
    await assertPgError(
      () =>
        db.insert(user).values({ ...newUser(2), email: "user1@example.com" }),
      { code: PG_UNIQUE_VIOLATION, constraint: "user_email_unique" },
    );

    const expiresAt = new Date(Date.now() + 60_000);
    const sessionRow = (n: number, userId: string, token: string) => ({
      id: `session_${n}`,
      userId,
      token,
      expiresAt,
    });
    await db.insert(session).values(sessionRow(1, "user_1", "token_1"));
    await assertPgError(
      () => db.insert(session).values(sessionRow(2, "user_1", "token_1")),
      { code: PG_UNIQUE_VIOLATION, constraint: "session_token_unique" },
    );
    await assertPgError(
      () => db.insert(session).values(sessionRow(3, "user_gone", "token_3")),
      {
        code: PG_FOREIGN_KEY_VIOLATION,
        constraint: "session_user_id_user_id_fk",
      },
    );
    await assertPgError(
      () =>
        db.insert(account).values({
          id: "account_1",
          accountId: "user_gone",
          providerId: "credential",
          userId: "user_gone",
        }),
      {
        code: PG_FOREIGN_KEY_VIOLATION,
        constraint: "account_user_id_user_id_fk",
      },
    );

    await db.insert(account).values({
      id: "account_2",
      accountId: "user_1",
      providerId: "credential",
      userId: "user_1",
    });
    await db.delete(user).where(eq(user.id, "user_1"));
    assert.equal((await db.select().from(session)).length, 0);
    assert.equal((await db.select().from(account)).length, 0);
  }));

// ---------- 制約: stripe_events ----------

test("stripe_events: 同じイベント id は 2 回入らず、ON CONFLICT DO NOTHING なら 2 回目は 0 件になる", () =>
  withTestDb(async ({ db }) => {
    const record = (id: string) =>
      db
        .insert(stripeEvents)
        .values({ id })
        .onConflictDoNothing()
        .returning({ id: stripeEvents.id });

    assert.deepEqual(
      await record("evt_1"),
      [{ id: "evt_1" }],
      "初めてのイベントは記録できる（=処理してよい）",
    );
    assert.deepEqual(
      await record("evt_1"),
      [],
      "2 回目は何も返さない（=処理済み）",
    );
    assert.deepEqual(await record("evt_2"), [{ id: "evt_2" }]);

    await assertPgError(() => db.insert(stripeEvents).values({ id: "evt_1" }), {
      code: PG_UNIQUE_VIOLATION,
      constraint: "stripe_events_pkey",
    });
    const rows = await db.select().from(stripeEvents);
    assert.equal(rows.length, 2);
    for (const row of rows) {
      assert.ok(
        Math.abs(Date.now() - row.processedAt.getTime()) < 60_000,
        "processed_at は記録した時刻が入る",
      );
    }
  }));

// ---------- 接続先 ----------

test("接続先: PGlite のファイルに保存でき、閉じて開き直しても残る（DATABASE_URL が無いときの dev）", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "maison-noir-pglite-"));
  const dataDir = path.join(dir, "pglite");
  try {
    const created = await createTestDb({ dataDir });
    await created.db.insert(stripeEvents).values({ id: "evt_persisted" });
    await created.close();

    // 開き直すのは、アプリや seed が使う connectDb の経路
    const reopened = await connectDb({ kind: "pglite", dataDir });
    try {
      assert.deepEqual(
        (await reopened.db.select().from(stripeEvents)).map((row) => row.id),
        ["evt_persisted"],
      );
    } finally {
      await reopened.close();
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("接続先: Neon の接続は作れて閉じられる（実際に繋ぐのは最初のクエリのとき。ここでは繋がない）", async () => {
  const connection = await connectDb({
    kind: "neon",
    url: "postgres://user:password@db.invalid/neondb",
  });
  try {
    assert.equal(typeof connection.db.select, "function");
  } finally {
    await connection.close();
  }
});

test("接続先: DATABASE_URL が無ければ（空・空白だけも）PGlite のファイル。runtime は DATABASE_URL_UNPOOLED を見ない", () => {
  const local = { kind: "pglite", dataDir: PGLITE_DATA_DIR };
  for (const env of [
    {},
    { DATABASE_URL: undefined },
    { DATABASE_URL: "" },
    { DATABASE_URL: "  \n" },
  ]) {
    assert.deepEqual(resolveDbTarget(env), local, JSON.stringify(env));
    assert.deepEqual(
      resolveDbTarget(env, "migrate"),
      local,
      JSON.stringify(env),
    );
  }
  assert.deepEqual(
    resolveDbTarget({ DATABASE_URL_UNPOOLED: "postgres://direct.example/db" }),
    local,
  );
});

test("接続先: DATABASE_URL があれば Neon。migrate は DATABASE_URL_UNPOOLED（直結）を優先する", () => {
  const env = {
    DATABASE_URL: " postgresql://app@pooler.example/db ",
    DATABASE_URL_UNPOOLED: "postgres://app@direct.example/db",
  };
  assert.deepEqual(resolveDbTarget(env), {
    kind: "neon",
    url: "postgresql://app@pooler.example/db",
  });
  assert.deepEqual(resolveDbTarget(env, "migrate"), {
    kind: "neon",
    url: "postgres://app@direct.example/db",
  });
  // UNPOOLED が無い・空なら migrate も DATABASE_URL
  const poolOnly = {
    DATABASE_URL: "postgres://app@pooler.example/db",
    DATABASE_URL_UNPOOLED: "",
  };
  assert.deepEqual(resolveDbTarget(poolOnly, "migrate"), {
    kind: "neon",
    url: "postgres://app@pooler.example/db",
  });
});

test("接続先: 本番（NODE_ENV=production）で接続先が決まらなければ例外にする。PGlite のファイルに黙って切り替えない", () => {
  const pooler = "postgres://app@pooler.example/db";
  const direct = "postgres://app@direct.example/db";
  const production = { NODE_ENV: "production" };

  // 接続先が無い（未設定・空・空白だけ）。runtime は DATABASE_URL_UNPOOLED だけでは足りない
  const undecided: Record<string, string | undefined>[] = [
    production,
    { ...production, DATABASE_URL: undefined },
    { ...production, DATABASE_URL: "" },
    { ...production, DATABASE_URL: "  \n" },
    { ...production, PGLITE_DATA_DIR: "" },
    { ...production, PGLITE_DATA_DIR: "  " },
  ];
  for (const env of undecided) {
    for (const purpose of ["runtime", "migrate"] as const) {
      assert.throws(
        () => resolveDbTarget(env, purpose),
        (error: unknown) =>
          error instanceof Error &&
          error.message.includes("DATABASE_URL") &&
          error.message.includes("PGLITE_DATA_DIR"),
        `${purpose} ${JSON.stringify(env)}`,
      );
    }
  }
  assert.throws(
    () => resolveDbTarget({ ...production, DATABASE_URL_UNPOOLED: direct }),
    /DATABASE_URL/,
    "runtime は DATABASE_URL_UNPOOLED を見ない",
  );

  // 接続先があれば本番でも通る
  assert.deepEqual(resolveDbTarget({ ...production, DATABASE_URL: pooler }), {
    kind: "neon",
    url: pooler,
  });
  assert.deepEqual(
    resolveDbTarget(
      { ...production, DATABASE_URL_UNPOOLED: direct },
      "migrate",
    ),
    { kind: "neon", url: direct },
  );

  // 本番以外（dev・test・NODE_ENV 未設定）は従来どおり、既定の PGlite
  for (const NODE_ENV of ["development", "test", "", undefined]) {
    assert.deepEqual(resolveDbTarget({ NODE_ENV }), {
      kind: "pglite",
      dataDir: PGLITE_DATA_DIR,
    });
  }
});

test("接続先: PGLITE_DATA_DIR があれば、本番ビルドでもそのディレクトリの PGlite。DATABASE_URL があれば Neon が先", () => {
  const e2e = { kind: "pglite", dataDir: ".pglite-e2e" };
  const url = "postgres://app@pooler.example/db";
  for (const NODE_ENV of ["production", "development", "test", undefined]) {
    const env = { NODE_ENV, PGLITE_DATA_DIR: " .pglite-e2e " };
    assert.deepEqual(resolveDbTarget(env), e2e, String(NODE_ENV));
    assert.deepEqual(resolveDbTarget(env, "migrate"), e2e, String(NODE_ENV));
    assert.deepEqual(
      resolveDbTarget({ ...env, DATABASE_URL: url }),
      { kind: "neon", url },
      "接続文字列があれば PGLITE_DATA_DIR は使わない",
    );
  }
});

test("接続先: postgres:// 以外の値は例外にし、パスワードをメッセージにも表示文にも出さない", () => {
  for (const url of [
    "mysql://app:s3cret@host/db",
    "app:s3cret@host/db",
    "file:./local.db",
  ]) {
    assert.throws(
      () => resolveDbTarget({ DATABASE_URL: url }),
      (error: unknown) =>
        error instanceof Error &&
        /postgres/.test(error.message) &&
        !error.message.includes("s3cret"),
      url,
    );
  }
  assert.ok(
    !describeDbTarget({
      kind: "neon",
      url: "postgres://app:s3cret@host/db",
    }).includes("s3cret"),
  );
  assert.match(
    describeDbTarget({ kind: "pglite", dataDir: PGLITE_DATA_DIR }),
    /PGlite/,
  );
});

test(".env.local の読み込み: 無ければ何もせず、あれば読み、既にある環境変数は上書きしない", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "maison-noir-env-"));
  const file = path.join(dir, ".env.local");
  const names = ["maison_noir_test_env_new", "maison_noir_test_env_existing"];
  try {
    loadLocalEnv(file); // ファイルが無い: 例外にならない
    assert.equal(process.env.maison_noir_test_env_new, undefined);

    fs.writeFileSync(
      file,
      'maison_noir_test_env_new="from file"\nmaison_noir_test_env_existing=from_file\n',
    );
    process.env.maison_noir_test_env_existing = "from_shell";
    loadLocalEnv(file);
    assert.equal(process.env.maison_noir_test_env_new, "from file");
    assert.equal(
      process.env.maison_noir_test_env_existing,
      "from_shell",
      "シェルや CI で指定した値が勝つ",
    );
  } finally {
    for (const name of names) delete process.env[name];
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("接続先: Vercel（VERCEL=1）では PGLITE_DATA_DIR を無視する（本番は DATABASE_URL 必須のまま。Neon が先なのも変わらない）。VERCEL が 1 以外なら従来どおり", () => {
  const dir = "/tmp/maison-noir-pglite";
  const url = "postgres://app@pooler.example/db";

  // 本番の Vercel: PGLITE_DATA_DIR があっても例外（消える DB に注文を書かない）。理由を文に出し、値は出さない
  assert.throws(
    () =>
      resolveDbTarget({
        NODE_ENV: "production",
        VERCEL: "1",
        PGLITE_DATA_DIR: dir,
      }),
    (error: unknown) =>
      error instanceof Error &&
      /DATABASE_URL/.test(error.message) &&
      /Vercel/.test(error.message) &&
      !error.message.includes(dir),
  );
  // 本番以外の Vercel（vercel dev など）でも無視して、既定の PGlite
  assert.deepEqual(
    resolveDbTarget({
      NODE_ENV: "development",
      VERCEL: "1",
      PGLITE_DATA_DIR: dir,
    }),
    { kind: "pglite", dataDir: PGLITE_DATA_DIR },
  );
  // 接続文字列があれば Neon
  assert.deepEqual(
    resolveDbTarget({
      NODE_ENV: "production",
      VERCEL: "1",
      PGLITE_DATA_DIR: dir,
      DATABASE_URL: url,
    }),
    { kind: "neon", url },
  );
  // VERCEL が 1 でなければ（E2E・ローカルの next start）従来どおり PGLITE_DATA_DIR が効く
  for (const VERCEL of [undefined, "", "0", "true"]) {
    assert.deepEqual(
      resolveDbTarget({ NODE_ENV: "production", VERCEL, PGLITE_DATA_DIR: dir }),
      { kind: "pglite", dataDir: dir },
      String(VERCEL),
    );
  }
});
