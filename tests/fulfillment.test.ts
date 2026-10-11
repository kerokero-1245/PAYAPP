// 注文の確定（lib/fulfillment.ts の fulfillCheckout ほか）のテスト。実行: npm test
//
// なぜあるか: 注文をブラウザの localStorage からサーバの DB に移す（段 2）と、同じ決済が Webhook と成功ページの
// 両方から、何度も・同時に確定されに来る。ここでは次を固定する。
//  - 注文は Checkout Session 1 つにつき 1 件だけ（2 回呼んでも・同時に呼んでも・Webhook と成功ページが同時でも）
//  - 未払い・存在しない session・読めない metadata からは注文を作らない
//  - 途中で失敗したら、半端な注文も処理済みの記録も残さない（やり直せる）
//  - 注文には購入した時点の名前と単価を写す
//  - 注文の持ち主（orders.user_id）は、Stripe の session の client_reference_id（ログイン中に買った人の user.id）だけで決まる。
//    ゲスト・実在しない利用者・不正な値は、支払い済みの注文を失わずにゲストの注文として確定する
// DB は PGlite をテストごとにメモリ上に立て（lib/db/test-helpers.ts）、Stripe は偽物を差し込む。外部には通信しない。
import assert from "node:assert/strict";
import { test } from "node:test";

import { getProductById } from "../lib/catalog.ts";
import { CHECKOUT_CURRENCY, findPaymentMismatch } from "../lib/checkout.ts";
import type { PaidOrder } from "../lib/checkout.ts";
import { validateContactField } from "../lib/contact.ts";
import type { Db } from "../lib/db/connect.ts";
import { orderItems, orders } from "../lib/db/schema.ts";
import { seedProducts } from "../lib/db/seed.ts";
import {
  PG_FOREIGN_KEY_VIOLATION,
  PG_UNIQUE_VIOLATION,
  assertPgError,
  withTestDb,
} from "../lib/db/test-helpers.ts";
import {
  ORDER_NO_ALPHABET,
  decideFulfillment,
  fulfillCheckout,
  generateOrderNo,
  hasProcessedEvent,
  toOrderRows,
  toStoredOrder,
} from "../lib/fulfillment.ts";
import type { FulfillResult } from "../lib/fulfillment.ts";
import type { ItemQuantity, ProductLookup } from "../lib/types.ts";
import { captureConsole } from "./support/console.ts";
import { NOTHING, counts, insertUser } from "./support/orders.ts";
import { fakeStripe, paidSession, totalOf } from "./support/stripe.ts";

const NOW = new Date("2026-10-11T03:00:00.000Z");
/** 購入した品目。商品 5 を 1 点と商品 1 を 2 点（買った順と商品 id の順がずれるように、id の大きい方を先に置く） */
const BOUGHT: ItemQuantity[] = [
  { id: "5", quantity: 1 },
  { id: "1", quantity: 2 },
];

/** 商品の名前と単価（金額はテストに直書きせず、カタログから組む） */
function catalogLine(id: string) {
  const { name, price } = getProductById(id)!;
  return { name, price };
}

/** 注文番号を呼び出しごとに変える（固定にしたいテストは自分で渡す） */
function numbering(prefix = "ORD-TEST") {
  let n = 0;
  return () => `${prefix}${String((n += 1)).padStart(6, "0")}`;
}

/** fulfillCheckout を呼ぶ共通の引数（sessionId は各テストが足す） */
function inputFor(db: Db, stripe: ReturnType<typeof fakeStripe>) {
  return {
    db,
    getStripe: stripe.getStripe,
    now: () => NOW,
    newOrderNo: numbering(),
  };
}

/** 結果が fulfilled であることを確かめて、その中身を返す */
function fulfilled(result: FulfillResult) {
  assert.ok(result.status === "fulfilled", JSON.stringify(result));
  return result;
}

const ONE_ORDER = {
  orders: 1,
  orderItems: BOUGHT.length,
  stripeEvents: 0,
};

/* ---------- 純粋な関数 ---------- */

test("decideFulfillment: 支払い済みならカタログに当てた注文、未払いは注文にしない、metadata が読めなければ読めないと返す", () => {
  const paid = decideFulfillment(paidSession("cs_test_a", BOUGHT));
  assert.ok(paid.kind === "paid");
  assert.equal(paid.order.sessionId, "cs_test_a");
  assert.equal(paid.order.total, totalOf(BOUGHT));
  assert.deepEqual(
    paid.order.items.map(({ id, quantity }) => ({ id, quantity })),
    BOUGHT,
  );

  // 未払いの session は metadata が付いていても注文にしない。paid 以外はすべて未払い扱い
  for (const payment_status of ["unpaid", "no_payment_required", undefined]) {
    assert.deepEqual(
      decideFulfillment(paidSession("cs_test_a", BOUGHT, { payment_status })),
      { kind: "unpaid" },
      String(payment_status),
    );
  }
  for (const notSession of [null, undefined, "paid", 1, []]) {
    assert.deepEqual(decideFulfillment(notSession), { kind: "unpaid" });
  }

  // 支払い済みでも、metadata が空・読めない・カタログに無い商品なら、注文は作れない
  for (const metadata of [
    {},
    { order_items_0: "1:x" },
    { order_items_0: "999:1" },
  ]) {
    const decision = decideFulfillment({
      id: "cs_test_a",
      payment_status: "paid",
      metadata,
    });
    assert.ok(decision.kind === "unreadable", JSON.stringify(metadata));
    assert.ok(decision.error.length > 0);
  }
});

test("decideFulfillment: 支払い済みの決済には、持ち主の id（client_reference_id）を添える。無い・文字列でない・空・200 文字超はゲスト（null）", () => {
  const ownerOf = (extra: Record<string, unknown>) => {
    const decision = decideFulfillment(
      paidSession("cs_test_owner", BOUGHT, extra),
    );
    assert.ok(decision.kind === "paid", JSON.stringify(extra));
    return decision.ownerId;
  };
  assert.equal(ownerOf({}), null);
  assert.equal(
    ownerOf({ client_reference_id: null }),
    null,
    "Stripe はゲストの決済に null を返す",
  );
  assert.equal(ownerOf({ client_reference_id: "user_1" }), "user_1");
  assert.equal(
    ownerOf({ client_reference_id: "u".repeat(200) }),
    "u".repeat(200),
  );
  for (const bad of ["", 1, true, {}, [], "u".repeat(201)]) {
    assert.equal(
      ownerOf({ client_reference_id: bad }),
      null,
      JSON.stringify(bad),
    );
  }
  // 未払いの決済は、持ち主が付いていても注文にしない
  assert.deepEqual(
    decideFulfillment(
      paidSession("cs_test_owner", BOUGHT, {
        payment_status: "unpaid",
        client_reference_id: "user_1",
      }),
    ),
    { kind: "unpaid" },
  );
});

test("注文番号: ORD- に 32 文字の中から 10 文字。お問い合わせフォームが受け付ける形で、重ならない", () => {
  assert.equal(ORDER_NO_ALPHABET.length, 32);
  assert.equal(new Set(ORDER_NO_ALPHABET).size, 32);
  for (const confusing of ["I", "L", "O", "U"]) {
    assert.ok(!ORDER_NO_ALPHABET.includes(confusing), confusing);
  }

  const numbers = Array.from({ length: 2000 }, () => generateOrderNo());
  for (const orderNo of numbers) {
    assert.match(orderNo, /^ORD-[0-9A-Z]{10}$/);
    assert.equal(
      validateContactField("orderId", { orderId: orderNo }),
      undefined,
      `${orderNo} をお問い合わせフォームが弾いた`,
    );
  }
  assert.equal(new Set(numbers).size, numbers.length, "2000 件で重なった");

  // 乱数の 1 バイトの下位 5 ビットで 1 文字を選ぶ（0→"0"、31→"Z"、32→"0"、255→"Z"、10→"A"）
  const bytes = Uint8Array.from([0, 1, 31, 32, 33, 255, 8, 9, 10, 11]);
  assert.equal(
    generateOrderNo(() => bytes),
    "ORD-01Z01Z89AB",
  );
});

test("toOrderRows: 注文の行は paid・購入時の合計・持ち主（渡さなければゲストの null）、明細の行は購入時の名前と単価の写し", () => {
  const order: PaidOrder = {
    sessionId: "cs_test_rows",
    total: totalOf(BOUGHT),
    items: BOUGHT.map(({ id, quantity }) => {
      const product = getProductById(id)!;
      return {
        id,
        name: product.name,
        price: product.price,
        quantity,
        image: product.images[0],
        category: product.category,
      };
    }),
  };

  const rows = toOrderRows(order, { orderNo: "ORD-ROWS000001", paidAt: NOW });

  assert.deepEqual(rows.order, {
    orderNo: "ORD-ROWS000001",
    userId: null,
    stripeSessionId: "cs_test_rows",
    status: "paid",
    total: totalOf(BOUGHT),
    paidAt: NOW,
  });
  const owned = toOrderRows(order, {
    orderNo: "ORD-ROWS000002",
    paidAt: NOW,
    userId: "user_1",
  });
  assert.equal(owned.order.userId, "user_1");
  assert.equal(
    toOrderRows(order, { orderNo: "ORD-ROWS000003", paidAt: NOW, userId: null })
      .order.userId,
    null,
  );
  assert.deepEqual(
    rows.items,
    BOUGHT.map(({ id, quantity }) => ({
      productId: id,
      name: catalogLine(id).name,
      unitPrice: catalogLine(id).price,
      quantity,
    })),
  );
});

test("toStoredOrder: 明細は商品 id の数の順、名前と単価は DB の写し、画像とカテゴリはカタログから（無ければ null）", () => {
  const row = {
    id: "00000000-0000-4000-8000-000000000001",
    orderNo: "ORD-STORED0001",
    userId: null,
    stripeSessionId: "cs_test_stored",
    status: "paid",
    total: 30000,
    paidAt: NOW,
    createdAt: NOW,
  } satisfies typeof orders.$inferSelect;
  const item = (productId: string, unitPrice: number) => ({
    orderId: row.id,
    productId,
    name: `購入時の名前 ${productId}`,
    unitPrice,
    quantity: 1,
  });
  // あとでカタログが変わった想定: 名前と価格が変わり、商品 "10" は消えた
  const changedCatalog = (id: string) => {
    const product = getProductById(id);
    return id === "10" || !product
      ? undefined
      : { ...product, name: "あとで変えた名前", price: product.price + 1 };
  };

  const stored = toStoredOrder(
    row,
    [item("10", 3000), item("2", 20000), item("1", 7000)],
    changedCatalog,
  );

  assert.deepEqual(
    stored.items.map(({ id }) => id),
    ["1", "2", "10"],
    "文字の順なら 1, 10, 2 になる",
  );
  assert.deepEqual(
    stored.items.map(({ name, price }) => ({ name, price })),
    [
      { name: "購入時の名前 1", price: 7000 },
      { name: "購入時の名前 2", price: 20000 },
      { name: "購入時の名前 10", price: 3000 },
    ],
    "購入時の写し（カタログの今の値ではない）",
  );
  assert.equal(stored.items[0].image, getProductById("1")!.images[0]);
  assert.equal(stored.items[0].category, getProductById("1")!.category);
  assert.equal(stored.items[2].image, null);
  assert.equal(stored.items[2].category, null);
  assert.equal(
    stored.userId,
    null,
    "持ち主は DB の行のとおり（ゲスト = null）",
  );
  assert.equal(
    toStoredOrder({ ...row, userId: "user_1" }, [], changedCatalog).userId,
    "user_1",
  );
  assert.deepEqual(
    {
      orderNo: stored.orderNo,
      sessionId: stored.sessionId,
      status: stored.status,
      total: stored.total,
      paidAt: stored.paidAt,
      createdAt: stored.createdAt,
    },
    {
      orderNo: "ORD-STORED0001",
      sessionId: "cs_test_stored",
      status: "paid",
      total: 30000,
      paidAt: NOW,
      createdAt: NOW,
    },
  );
});

/* ---------- 注文を 1 件だけ作る ---------- */

test("fulfillCheckout: ログイン中に決済した session（client_reference_id = 実在する user.id）は、その利用者の注文として確定する。同じ session を Webhook から再び確定しても持ち主は変わらない", () =>
  withTestDb(async ({ db }) => {
    await seedProducts(db);
    await insertUser(db, "user_1");
    await insertUser(db, "user_2");
    const stripe = fakeStripe({
      cs_test_member: paidSession("cs_test_member", BOUGHT, {
        client_reference_id: "user_1",
      }),
    });

    const first = fulfilled(
      await fulfillCheckout({
        ...inputFor(db, stripe),
        sessionId: "cs_test_member",
      }),
    );
    assert.equal(first.created, true);
    assert.equal(first.order.userId, "user_1", "返す注文が持ち主を持つ");
    const [row, ...others] = await db.select().from(orders);
    assert.deepEqual(others, []);
    assert.equal(row.userId, "user_1", "DB の orders.user_id に入る");

    // 別の経路（Webhook。イベント id つき）が同じ session を確定しに来ても、注文は 1 件のままで持ち主は変わらない
    const again = fulfilled(
      await fulfillCheckout({
        ...inputFor(db, stripe),
        sessionId: "cs_test_member",
        eventId: "evt_member_1",
      }),
    );
    assert.equal(again.created, false);
    assert.equal(again.order.userId, "user_1");
    assert.equal((await db.select().from(orders)).length, 1);
  }));

test("fulfillCheckout: ゲストの決済・実在しない利用者・不正な持ち主の値は、ゲストの注文（user_id = null）として確定する。支払い済みの注文を失わない", () =>
  withTestDb(async ({ db }) => {
    await seedProducts(db);
    await insertUser(db, "user_1");
    const cases: [string, Record<string, unknown>][] = [
      ["guest", {}],
      ["null", { client_reference_id: null }],
      // ログイン中に決済を始めたあと、確定までに利用者が消えた（外部キーで失敗して注文が確定できなくなるのを避ける）
      ["gone", { client_reference_id: "user_gone" }],
      ["empty", { client_reference_id: "" }],
      ["number", { client_reference_id: 123 }],
      ["long", { client_reference_id: "u".repeat(201) }],
    ];
    const sessions = Object.fromEntries(
      cases.map(([name, extra]) => [
        `cs_test_${name}`,
        paidSession(`cs_test_${name}`, BOUGHT, extra),
      ]),
    );
    const stripe = fakeStripe(sessions);

    for (const [name] of cases) {
      const result = fulfilled(
        await fulfillCheckout({
          ...inputFor(db, stripe),
          sessionId: `cs_test_${name}`,
          newOrderNo: () => `ORD-GUEST-${name}`,
        }),
      );
      assert.equal(result.created, true, name);
      assert.equal(result.order.userId, null, name);
    }
    const rows = await db.select().from(orders);
    assert.equal(rows.length, cases.length);
    assert.ok(rows.every((row) => row.userId === null));
  }));

test("fulfillCheckout: 支払い済みの session から、注文と明細を作って DB の注文を返す", () =>
  withTestDb(async ({ db }) => {
    await seedProducts(db);
    const stripe = fakeStripe({
      cs_test_paid: paidSession("cs_test_paid", BOUGHT),
    });

    const result = fulfilled(
      await fulfillCheckout({
        ...inputFor(db, stripe),
        sessionId: "cs_test_paid",
        newOrderNo: () => "ORD-FIRST00001",
      }),
    );

    assert.equal(result.created, true);
    assert.equal(result.order.orderNo, "ORD-FIRST00001");
    assert.equal(result.order.sessionId, "cs_test_paid");
    assert.equal(result.order.status, "paid");
    assert.equal(result.order.total, totalOf(BOUGHT));
    assert.deepEqual(result.order.paidAt, NOW);
    assert.deepEqual(
      result.order.items.map(({ id, name, price, quantity }) => ({
        id,
        name,
        price,
        quantity,
      })),
      [
        { id: "1", ...catalogLine("1"), quantity: 2 },
        { id: "5", ...catalogLine("5"), quantity: 1 },
      ],
      "明細は商品 id の順（買った順ではない）",
    );

    // 返した注文は DB にあるものそのもの（orders が 1 行、order_items が 2 行）
    const [row, ...others] = await db.select().from(orders);
    assert.deepEqual(others, []);
    assert.equal(row.orderNo, "ORD-FIRST00001");
    assert.equal(row.stripeSessionId, "cs_test_paid");
    assert.equal(row.userId, null, "ゲストの購入");
    assert.equal(row.status, "paid");
    assert.equal(row.total, totalOf(BOUGHT));
    assert.deepEqual(row.paidAt, NOW);
    const itemRows = await db.select().from(orderItems);
    assert.deepEqual(
      itemRows
        .map(({ orderId, productId, name, unitPrice, quantity }) => ({
          orderId,
          productId,
          name,
          unitPrice,
          quantity,
        }))
        .sort((a, b) => a.productId.localeCompare(b.productId)),
      [
        {
          orderId: row.id,
          productId: "1",
          name: catalogLine("1").name,
          unitPrice: catalogLine("1").price,
          quantity: 2,
        },
        {
          orderId: row.id,
          productId: "5",
          name: catalogLine("5").name,
          unitPrice: catalogLine("5").price,
          quantity: 1,
        },
      ],
    );
    assert.deepEqual(stripe.retrieved, ["cs_test_paid"]);
  }));

test("fulfillCheckout: 同じ session を 2 回確定しても注文は 1 件で、2 回目は Stripe を呼ばずに同じ注文を返す", () =>
  withTestDb(async ({ db }) => {
    await seedProducts(db);
    const stripe = fakeStripe({
      cs_test_paid: paidSession("cs_test_paid", BOUGHT),
    });
    const input = { ...inputFor(db, stripe), sessionId: "cs_test_paid" };

    const first = fulfilled(await fulfillCheckout(input));
    const second = fulfilled(await fulfillCheckout(input));

    assert.equal(first.created, true);
    assert.equal(second.created, false, "2 回目は作っていない");
    assert.deepEqual(second.order, first.order, "同じ注文番号・同じ明細");
    assert.deepEqual(await counts(db), ONE_ORDER);
    assert.deepEqual(
      stripe.retrieved,
      ["cs_test_paid"],
      "確定済みなら Stripe に問い合わせない",
    );
  }));

test("fulfillCheckout: 同時に何度呼んでも注文は 1 件・明細は 1 組で、全員が同じ注文を受け取る", () =>
  withTestDb(async ({ db }) => {
    await seedProducts(db);
    // 5 つとも「DB にまだ注文が無い」と見てから、そろって書き込みに進む（偽の Stripe が全員の到着を待つ）
    const stripe = fakeStripe(
      { cs_test_paid: paidSession("cs_test_paid", BOUGHT) },
      { waitFor: 5 },
    );
    const input = { ...inputFor(db, stripe), sessionId: "cs_test_paid" };

    const results = (
      await Promise.all(Array.from({ length: 5 }, () => fulfillCheckout(input)))
    ).map(fulfilled);

    assert.equal(
      results.filter((r) => r.created).length,
      1,
      "作ったのはちょうど 1 つの呼び出し",
    );
    for (const r of results) assert.deepEqual(r.order, results[0].order);
    assert.deepEqual(await counts(db), ONE_ORDER);
  }));

test("fulfillCheckout: Webhook（イベント id つき）と成功ページ（つかない）が同時に来ても、注文は 1 件・処理済みのイベントは重ならない", () =>
  withTestDb(async ({ db }) => {
    await seedProducts(db);
    const stripe = fakeStripe(
      { cs_test_paid: paidSession("cs_test_paid", BOUGHT) },
      { waitFor: 4 },
    );
    const input = { ...inputFor(db, stripe), sessionId: "cs_test_paid" };

    const results = (
      await Promise.all([
        fulfillCheckout({ ...input, eventId: "evt_test_1" }),
        fulfillCheckout(input),
        fulfillCheckout({ ...input, eventId: "evt_test_1" }),
        fulfillCheckout({ ...input, eventId: "evt_test_2" }),
      ])
    ).map(fulfilled);

    assert.equal(results.filter((r) => r.created).length, 1);
    for (const r of results) assert.deepEqual(r.order, results[0].order);
    assert.deepEqual(await counts(db), { ...ONE_ORDER, stripeEvents: 2 });
    assert.equal(await hasProcessedEvent(db, "evt_test_1"), true);
    assert.equal(await hasProcessedEvent(db, "evt_test_2"), true);
    assert.equal(await hasProcessedEvent(db, "evt_test_3"), false);
  }));

test("fulfillCheckout: 確定済みの注文にイベント id つきで来たら、注文は増やさず、そのイベントを処理済みにする", () =>
  withTestDb(async ({ db }) => {
    await seedProducts(db);
    const stripe = fakeStripe({
      cs_test_paid: paidSession("cs_test_paid", BOUGHT),
    });
    const input = { ...inputFor(db, stripe), sessionId: "cs_test_paid" };

    const early = fulfilled(await fulfillCheckout(input)); // 成功ページが先
    assert.equal(await hasProcessedEvent(db, "evt_test_late"), false);
    const late = fulfilled(
      await fulfillCheckout({ ...input, eventId: "evt_test_late" }), // Webhook があとから
    );

    assert.equal(late.created, false);
    assert.deepEqual(late.order, early.order);
    assert.equal(await hasProcessedEvent(db, "evt_test_late"), true);
    assert.deepEqual(await counts(db), { ...ONE_ORDER, stripeEvents: 1 });
    assert.deepEqual(stripe.retrieved, ["cs_test_paid"]);
  }));

/* ---------- 注文を作らない ---------- */

test("fulfillCheckout: 未払い・存在しない session・Stripe の失敗・形の不正・読めない metadata からは注文を作らない", () =>
  withTestDb(async ({ db }) => {
    await seedProducts(db);
    const stripe = fakeStripe({
      // 未払いでも metadata は付いている。これを見て注文を作ってはいけない
      cs_test_unpaid: paidSession("cs_test_unpaid", BOUGHT, {
        payment_status: "unpaid",
      }),
      cs_test_nometa: {
        id: "cs_test_nometa",
        payment_status: "paid",
        metadata: {},
      },
      cs_test_unknown: {
        id: "cs_test_unknown",
        payment_status: "paid",
        metadata: { order_items_0: "999:1" },
      },
    });
    const input = { ...inputFor(db, stripe), eventId: "evt_test_none" };

    assert.deepEqual(
      await fulfillCheckout({ ...input, sessionId: "cs_test_unpaid" }),
      { status: "unpaid" },
    );
    assert.deepEqual(
      await fulfillCheckout({ ...input, sessionId: "cs_test_missing" }),
      { status: "unpaid" },
      "Stripe に無い session（404）は未払いと同じ扱い",
    );

    const failed = await fulfillCheckout({
      ...input,
      sessionId: "cs_test_boom",
    });
    assert.ok(failed.status === "stripe-error");
    assert.equal((failed.cause as { statusCode?: number }).statusCode, 500);

    for (const sessionId of ["cs_test_nometa", "cs_test_unknown"]) {
      const result = await fulfillCheckout({ ...input, sessionId });
      assert.ok(result.status === "unreadable-order", sessionId);
      assert.ok(result.error.length > 0);
    }

    const calledBefore = stripe.retrieved.length;
    for (const sessionId of ["", "bad", "pi_123", `cs_${"a".repeat(300)}`]) {
      assert.deepEqual(await fulfillCheckout({ ...input, sessionId }), {
        status: "invalid-session-id",
      });
    }
    assert.equal(
      stripe.retrieved.length,
      calledBefore,
      "形が不正な session_id で Stripe を呼んだ",
    );

    // どの場合も、注文も明細も処理済みのイベントも残らない
    assert.deepEqual(await counts(db), NOTHING);
  }));

test("fulfillCheckout: 未払いだった session が、あとで支払い済みになれば、そのとき注文になる", () =>
  withTestDb(async ({ db }) => {
    await seedProducts(db);
    const stripe = fakeStripe({
      cs_test_later: paidSession("cs_test_later", BOUGHT, {
        payment_status: "unpaid",
      }),
    });
    const input = { ...inputFor(db, stripe), sessionId: "cs_test_later" };

    assert.deepEqual(await fulfillCheckout(input), { status: "unpaid" });
    assert.deepEqual(await counts(db), NOTHING);

    stripe.sessions.cs_test_later = paidSession("cs_test_later", BOUGHT);
    const paid = fulfilled(await fulfillCheckout(input));
    assert.equal(paid.created, true);
    assert.deepEqual(await counts(db), ONE_ORDER);
  }));

/* ---------- 途中で失敗したとき ---------- */

test("fulfillCheckout: 明細を入れられなければ注文もイベントの記録も取り消し、直したあとの呼び直しで確定できる", () =>
  withTestDb(async ({ db }) => {
    // products を seed していない = order_items の外部キー（商品）を満たせない
    const stripe = fakeStripe({
      cs_test_paid: paidSession("cs_test_paid", BOUGHT),
    });
    const input = {
      ...inputFor(db, stripe),
      sessionId: "cs_test_paid",
      eventId: "evt_test_retry",
    };

    await assertPgError(() => fulfillCheckout(input), {
      code: PG_FOREIGN_KEY_VIOLATION,
      constraint: "order_items_product_id_products_id_fk",
    });
    assert.deepEqual(
      await counts(db),
      NOTHING,
      "orders だけが残った・イベントだけが処理済みになった、がない",
    );
    assert.equal(await hasProcessedEvent(db, "evt_test_retry"), false);

    await seedProducts(db);
    const retried = fulfilled(await fulfillCheckout(input));
    assert.equal(retried.created, true);
    assert.deepEqual(await counts(db), { ...ONE_ORDER, stripeEvents: 1 });
  }));

test("fulfillCheckout: 注文番号が重なったら、別の注文として握りつぶさず失敗し、何も残さない", () =>
  withTestDb(async ({ db }) => {
    await seedProducts(db);
    const stripe = fakeStripe({
      cs_test_a: paidSession("cs_test_a", BOUGHT),
      cs_test_b: paidSession("cs_test_b", [{ id: "3", quantity: 1 }]),
    });
    const input = {
      ...inputFor(db, stripe),
      newOrderNo: () => "ORD-SAMENUMBER",
    };

    fulfilled(await fulfillCheckout({ ...input, sessionId: "cs_test_a" }));
    await assertPgError(
      () =>
        fulfillCheckout({
          ...input,
          sessionId: "cs_test_b",
          eventId: "evt_test_b",
        }),
      {
        code: PG_UNIQUE_VIOLATION,
        constraint: "orders_order_no_unique",
      },
    );
    assert.deepEqual(await counts(db), ONE_ORDER);
  }));

test("fulfillCheckout: 注文には購入した時点の名前と単価を写し、あとで商品の価格が変わっても注文は変わらない", () =>
  withTestDb(async ({ db }) => {
    await seedProducts(db);
    const bought = [{ id: "1", quantity: 2 }];
    const stripe = fakeStripe({
      cs_test_paid: paidSession("cs_test_paid", bought),
    });
    const input = { ...inputFor(db, stripe), sessionId: "cs_test_paid" };
    const first = fulfilled(await fulfillCheckout(input));

    // カタログが値上げされ、products 表の価格も追従した
    const raise = 5000;
    await seedProducts(db, [
      { id: "1", price: catalogLine("1").price + raise },
    ]);
    const raised = (id: string) => {
      const product = getProductById(id);
      return product && { ...product, price: product.price + raise };
    };

    const again = fulfilled(
      await fulfillCheckout({ ...input, lookup: raised }),
    );
    assert.equal(again.created, false);
    assert.equal(again.order.items[0].price, catalogLine("1").price);
    assert.equal(again.order.total, first.order.total);
    assert.equal(again.order.total, totalOf(bought));
  }));

/* ---------- 請求額・通貨の照合（決済を作ってから確定するまでにカタログが変わった場合） ---------- */

test("findPaymentMismatch: 通貨が円で請求額が自前の合計と同じなら null。食い違えばその項目の名前。請求額が数でない（無い）ときも食い違い", () => {
  const total = totalOf(BOUGHT);
  assert.equal(
    findPaymentMismatch(
      { amount_total: total, currency: CHECKOUT_CURRENCY },
      total,
    ),
    null,
  );
  for (const amount_total of [
    total + 1,
    total - 1,
    0,
    undefined,
    null,
    String(total),
    Number.NaN,
  ]) {
    assert.equal(
      findPaymentMismatch({ amount_total, currency: "jpy" }, total),
      "amount_total",
      String(amount_total),
    );
  }
  for (const currency of ["usd", "JPY", "", undefined, null, 392]) {
    assert.equal(
      findPaymentMismatch({ amount_total: total, currency }, total),
      "currency",
      String(currency),
    );
  }
  assert.equal(findPaymentMismatch(null, total), "currency");
  assert.equal(findPaymentMismatch("cs_test_a", total), "currency");
});

test("decideFulfillment: 支払い済みでも請求額・通貨が合計と合わなければ mismatch（注文にしない）。metadata が読めないものは従来どおり unreadable", () => {
  const total = totalOf(BOUGHT);
  assert.deepEqual(
    decideFulfillment(
      paidSession("cs_test_a", BOUGHT, { amount_total: total + 100 }),
    ),
    { kind: "mismatch", field: "amount_total" },
  );
  assert.deepEqual(
    decideFulfillment(paidSession("cs_test_a", BOUGHT, { currency: "usd" })),
    { kind: "mismatch", field: "currency" },
  );
  assert.ok(
    decideFulfillment(paidSession("cs_test_a", BOUGHT)).kind === "paid",
  );
  // 未払いは請求額が合っていなくても未払い。metadata が読めないものは、請求額を見る前に unreadable
  assert.deepEqual(
    decideFulfillment(
      paidSession("cs_test_a", BOUGHT, {
        payment_status: "unpaid",
        amount_total: 1,
      }),
    ),
    { kind: "unpaid" },
  );
  assert.equal(
    decideFulfillment({
      id: "cs_test_a",
      payment_status: "paid",
      metadata: {},
      amount_total: 1,
      currency: "usd",
    }).kind,
    "unreadable",
  );
});

/** 値上げのあとのカタログ（全商品が amount 円高い） */
function raisedBy(amount: number): ProductLookup {
  return (id) => {
    const product = getProductById(id);
    return product && { ...product, price: product.price + amount };
  };
}

test("fulfillCheckout: 決済を作ったあとにカタログの価格が変わって請求額と合計が違えば、注文を作らず payment-mismatch。値を含まない記録を 1 件だけ残し、Webhook のイベントは処理済みにせず、直った再送で確定する", () =>
  withTestDb(async ({ db }) => {
    await seedProducts(db);
    // session の請求額は、決済を作った時点（今のカタログ）の合計。確定するときのカタログは 100 円値上がりしている
    const stripe = fakeStripe({
      cs_test_drift: paidSession("cs_test_drift", BOUGHT),
    });
    const input = {
      ...inputFor(db, stripe),
      sessionId: "cs_test_drift",
      eventId: "evt_test_drift",
    };

    const capture = captureConsole();
    let result: FulfillResult;
    try {
      result = await fulfillCheckout({ ...input, lookup: raisedBy(100) });
    } finally {
      capture.restore();
    }
    assert.deepEqual(result, {
      status: "payment-mismatch",
      field: "amount_total",
    });
    assert.deepEqual(await counts(db), NOTHING);
    assert.deepEqual(capture.events(), [
      {
        level: "error",
        event: "fulfillment.payment-mismatch",
        eventId: "evt_test_drift",
        sessionId: "cs_test_drift",
        field: "amount_total",
      },
    ]);
    // 値（金額・品目）は書かない
    const text = capture.text();
    for (const value of [
      totalOf(BOUGHT),
      totalOf(BOUGHT) + 100 * 3,
      ...BOUGHT.map(({ id }) => catalogLine(id).name),
    ]) {
      assert.ok(!text.includes(String(value)), `ログに値が出ている: ${value}`);
    }

    // 価格が請求額と合うカタログに戻れば（Stripe の再送・もう一度確認）確定する
    const retried = fulfilled(await fulfillCheckout(input));
    assert.equal(retried.created, true);
    assert.equal(retried.order.total, totalOf(BOUGHT));
    assert.deepEqual(await counts(db), { ...ONE_ORDER, stripeEvents: 1 });
  }));

test("fulfillCheckout: 通貨が円でない決済も payment-mismatch で、注文を作らない", () =>
  withTestDb(async ({ db }) => {
    await seedProducts(db);
    const stripe = fakeStripe({
      cs_test_usd: paidSession("cs_test_usd", BOUGHT, { currency: "usd" }),
    });
    const capture = captureConsole();
    let result: FulfillResult;
    try {
      result = await fulfillCheckout({
        ...inputFor(db, stripe),
        sessionId: "cs_test_usd",
      });
    } finally {
      capture.restore();
    }
    assert.deepEqual(result, { status: "payment-mismatch", field: "currency" });
    assert.deepEqual(await counts(db), NOTHING);
    assert.equal(capture.events()[0]?.field, "currency");
  }));

test("fulfillCheckout: Webhook（eventId あり）が届けた決済を Stripe が知らない（404）・未払いのときは警告を残す。成功ページの確認（eventId なし）は残さない。どちらも結果は unpaid のまま", () =>
  withTestDb(async ({ db }) => {
    await seedProducts(db);
    const stripe = fakeStripe({
      cs_test_unpaid: paidSession("cs_test_unpaid", BOUGHT, {
        payment_status: "unpaid",
      }),
    });
    const input = inputFor(db, stripe);

    const capture = captureConsole();
    try {
      for (const sessionId of ["cs_test_missing", "cs_test_unpaid"]) {
        assert.deepEqual(
          await fulfillCheckout({ ...input, sessionId, eventId: "evt_test_w" }),
          { status: "unpaid" },
        );
      }
      assert.equal(capture.lines.length, 2);
      // 成功ページの確認（eventId なし）は、利用者が好きな id を送れるので記録しない
      for (const sessionId of ["cs_test_missing", "cs_test_unpaid"]) {
        assert.deepEqual(await fulfillCheckout({ ...input, sessionId }), {
          status: "unpaid",
        });
      }
    } finally {
      capture.restore();
    }
    const [notFound, unpaid, ...rest] = capture.events();
    assert.equal(rest.length, 0, "成功ページの経路は記録しない");
    assert.equal(notFound?.level, "warn");
    assert.equal(notFound?.event, "fulfillment.session-not-found");
    assert.equal(notFound?.eventId, "evt_test_w");
    assert.equal(notFound?.sessionId, "cs_test_missing");
    assert.match(String(notFound?.hint), /STRIPE_SECRET_KEY/);
    assert.deepEqual(unpaid, {
      level: "warn",
      event: "fulfillment.session-unpaid",
      eventId: "evt_test_w",
      sessionId: "cs_test_unpaid",
    });
    assert.deepEqual(await counts(db), NOTHING);
  }));
