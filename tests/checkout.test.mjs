// 決済まわりの純粋な関数のテスト（Stripe は呼ばない）。実行: npm test
//
// なぜあるか: 以前の /checkout はクライアントが送った price と name をそのまま
// Stripe に渡しており、ブラウザから価格を書き換えて決済できた。/success は開いただけで
// 注文を記録し、その品目と金額はブラウザのカートから作っていた。ここでは
// 「価格はカタログから引く」「注文は支払った session から作る」
// 「支払い済み / 未払い / 確認できなかった を取り違えない」を固定する。
import { test } from "node:test";
import assert from "node:assert/strict";

import { PRODUCTS, getProductById } from "../lib/catalog.mjs";
import {
  CHECKOUT_ERRORS,
  MAX_LINE_ITEMS,
  MAX_QUANTITY,
  appendOrder,
  buildLineItems,
  decideVerifyOutcome,
  decodeOrderMetadata,
  encodeOrderMetadata,
  findOrderBySession,
  isSessionPaid,
  isStripeNotFound,
  isValidOrder,
  isValidSessionId,
  normalizeOrderItems,
  orderFromSession,
} from "../lib/checkout.mjs";

const watch = getProductById("1");
const perfume = getProductById("5");
const allErrors = Object.values(CHECKOUT_ERRORS);

test("前提: カタログに検証用の商品がある", () => {
  assert.ok(PRODUCTS.length > 0);
  assert.equal(watch.name, "Éclat Automatic 41");
  assert.equal(watch.price, 248000);
  assert.equal(perfume.price, 26800);
});

/* ---------- 価格の決定（/checkout） ---------- */

test("価格と名前はカタログから引く（送られた price / name は無視する）", () => {
  const r = buildLineItems([
    { id: "1", quantity: 2, price: 1, name: "書き換えた名前" },
    { id: "5", quantity: 1, price: 0 },
  ]);
  assert.equal(r.ok, true);
  assert.deepEqual(r.lineItems, [
    { price_data: { currency: "jpy", product_data: { name: "Éclat Automatic 41" }, unit_amount: 248000 }, quantity: 2 },
    { price_data: { currency: "jpy", product_data: { name: "Ambre Noir — Eau de Parfum" }, unit_amount: 26800 }, quantity: 1 },
  ]);
  assert.deepEqual(r.items, [{ id: "1", quantity: 2 }, { id: "5", quantity: 1 }]);
});

test("price を送らなくてもカタログの価格になる", () => {
  const r = buildLineItems([{ id: "7", quantity: 1 }]);
  assert.equal(r.ok, true);
  assert.equal(r.lineItems[0].price_data.unit_amount, getProductById("7").price);
});

test("知らない id・長すぎる id・文字列でない id は弾く", () => {
  for (const id of ["999", "", "0", "__proto__", "constructor", "x".repeat(200000), 1, null, undefined, {}, ["1"]]) {
    const r = buildLineItems([{ id, quantity: 1 }]);
    assert.equal(r.ok, false, `id=${String(id).slice(0, 20)} が通ってしまった`);
  }
  assert.equal(buildLineItems([{ id: "1", quantity: 1 }, { id: "999", quantity: 1 }]).ok, false);
});

test("数量は 1〜99 の整数だけ（100・1e21・0・小数・文字列は弾く）", () => {
  for (const quantity of [0, -1, 1.5, NaN, Infinity, "2", null, undefined, 100, 1e21, 2 ** 53]) {
    const r = buildLineItems([{ id: "1", quantity }]);
    assert.equal(r.ok, false, `quantity=${String(quantity)} が通ってしまった`);
  }
  assert.equal(buildLineItems([{ id: "1", quantity: MAX_QUANTITY }]).ok, true);
});

test("同じ id の行は合算してから上限を当てる", () => {
  const ok = normalizeOrderItems([{ id: "1", quantity: 40 }, { id: "5", quantity: 1 }, { id: "1", quantity: 59 }]);
  assert.deepEqual(ok, { ok: true, items: [{ id: "1", quantity: 99 }, { id: "5", quantity: 1 }] });
  const over = normalizeOrderItems([{ id: "1", quantity: 50 }, { id: "1", quantity: 50 }]);
  assert.equal(over.ok, false);
  assert.equal(over.error, CHECKOUT_ERRORS.badQuantity);
});

test("空のカート・配列でない入力・行数の上限超えは弾く", () => {
  for (const items of [[], null, undefined, "x", { id: "1", quantity: 1 }, [null]]) {
    assert.equal(buildLineItems(items).ok, false);
  }
  const many = Array.from({ length: MAX_LINE_ITEMS + 1 }, () => ({ id: "1", quantity: 1 }));
  assert.equal(buildLineItems(many).ok, false);
});

test("エラー文に入力の値を入れない・200 字以下", () => {
  const evil = "<script>alert(1)</script>" + "x".repeat(300);
  for (const items of [[{ id: evil, quantity: 1 }], [{ id: "1", quantity: evil }], [], null]) {
    const r = buildLineItems(items);
    assert.equal(r.ok, false);
    assert.ok(allErrors.includes(r.error), r.error);
    assert.ok(!r.error.includes("<script>"));
    assert.ok(r.error.length <= 200);
  }
});

/* ---------- session から注文を作る（/api/checkout/session） ---------- */

const paidSession = (items, extra = {}) => ({
  id: "cs_test_abc",
  payment_status: "paid",
  metadata: encodeOrderMetadata(items),
  ...extra,
});

test("metadata は id と数量を往復できる（500 字を超えても分割して戻せる）", () => {
  const items = [{ id: "1", quantity: 2 }, { id: "10", quantity: 99 }];
  assert.deepEqual(decodeOrderMetadata(encodeOrderMetadata(items)), items);
  const long = Array.from({ length: 150 }, (_, i) => ({ id: String((i % 10) + 1), quantity: 1 }));
  const meta = encodeOrderMetadata(long);
  assert.ok(Object.keys(meta).length >= 2);
  for (const v of Object.values(meta)) assert.ok(v.length <= 500);
  assert.deepEqual(decodeOrderMetadata(meta), long);
  for (const bad of [null, {}, { order_items_0: "" }, { order_items_0: "1" }, { order_items_0: "1:x" }, { order_items_0: "1:2;5:1" }]) {
    assert.equal(decodeOrderMetadata(bad), null, JSON.stringify(bad));
  }
});

test("注文は session の id と数量をカタログに当てて作る（カートの値は使わない）", () => {
  const r = orderFromSession(paidSession([{ id: "1", quantity: 2 }, { id: "5", quantity: 1 }]));
  assert.equal(r.ok, true);
  assert.equal(r.order.sessionId, "cs_test_abc");
  assert.deepEqual(
    r.order.items.map(({ id, name, price, quantity }) => ({ id, name, price, quantity })),
    [
      { id: "1", name: "Éclat Automatic 41", price: 248000, quantity: 2 },
      { id: "5", name: "Ambre Noir — Eau de Parfum", price: 26800, quantity: 1 },
    ]
  );
  assert.equal(r.order.total, 248000 * 2 + 26800);
  assert.equal(r.order.items[0].image, watch.images[0]);
  assert.equal(isValidOrder(r.order), true);
});

test("書き換えたカート（価格 1・数量 99）を一緒に渡されても、session とカタログの値で作る", () => {
  const session = paidSession([{ id: "1", quantity: 1 }]);
  const tamperedCart = [
    { id: "1", name: "偽物", price: 1, quantity: 99 },
    { id: "5", name: "後から足した品", price: 1, quantity: 1 },
  ];
  const r = orderFromSession(session, getProductById, tamperedCart);
  assert.equal(r.ok, true);
  assert.deepEqual(
    r.order.items.map(({ id, name, price, quantity }) => ({ id, name, price, quantity })),
    [{ id: "1", name: "Éclat Automatic 41", price: 248000, quantity: 1 }]
  );
  assert.equal(r.order.total, 248000);
});

test("未払い・metadata が無い・カタログに無い id の session からは注文を作らない", () => {
  assert.equal(orderFromSession(paidSession([{ id: "1", quantity: 1 }], { payment_status: "unpaid" })).ok, false);
  assert.equal(orderFromSession({ id: "cs_test_x", payment_status: "paid", metadata: {} }).ok, false);
  assert.equal(orderFromSession({ id: "cs_test_x", payment_status: "paid", metadata: { order_items_0: "999:1" } }).ok, false);
  assert.equal(orderFromSession(null).ok, false);
});

test("確認ルートの注文の形を確かめる（合計の食い違い・空の品目は不正）", () => {
  const { order } = orderFromSession(paidSession([{ id: "1", quantity: 1 }]));
  assert.equal(isValidOrder(order), true);
  assert.equal(isValidOrder({ ...order, total: order.total - 1 }), false);
  assert.equal(isValidOrder({ ...order, items: [] }), false);
  assert.equal(isValidOrder({ ...order, items: [{ ...order.items[0], quantity: 100 }], total: order.items[0].price * 100 }), false);
  assert.equal(isValidOrder(null), false);
});

/* ---------- 確認結果の判定（成功ページ） ---------- */

test("支払い済み・未払い・確認できなかった を取り違えない", () => {
  const { order } = orderFromSession(paidSession([{ id: "1", quantity: 1 }]));
  const paid = decideVerifyOutcome({ kind: "response", status: 200, body: { paid: true, order } });
  assert.equal(paid.state, "paid");
  assert.deepEqual(paid.order, order);

  assert.equal(decideVerifyOutcome({ kind: "response", status: 200, body: { paid: false } }).state, "unpaid");
  assert.equal(decideVerifyOutcome({ kind: "response", status: 400, body: { paid: false } }).state, "unpaid");
  assert.equal(decideVerifyOutcome({ kind: "missing-session" }).state, "unpaid");

  const unverified = [
    { kind: "network-error" },
    { kind: "timeout" },
    { kind: "response", status: 502, body: { paid: false } },
    { kind: "response", status: 500, body: { paid: false } },
    { kind: "response", status: 503, body: null },
    { kind: "response", status: 200, body: null },
    { kind: "response", status: 200, body: { paid: true } },
    { kind: "response", status: 200, body: { paid: true, order: { ...order, total: 1 } } },
    { kind: "response", status: 200, body: { paid: "true", order } },
    null,
    undefined,
  ];
  for (const r of unverified) {
    assert.equal(decideVerifyOutcome(r).state, "unverified", JSON.stringify(r));
  }
});

test("session_id の形を確かめる（cs_ で始まり、英数字とアンダースコア、200 字以下）", () => {
  for (const id of ["cs_test_a1B2c3", "cs_live_a1B2c3", "cs_a1", "cs_test_" + "a".repeat(192)]) {
    assert.equal(isValidSessionId(id), true, id);
  }
  for (const id of [null, undefined, "", "cs_", "pi_test_123", "cs_test_abc/../x", "cs_test-abc", "{CHECKOUT_SESSION_ID}", "cs_" + "a".repeat(198), 123]) {
    assert.equal(isValidSessionId(id), false, `${String(id).slice(0, 30)} が通ってしまった`);
  }
});

test("payment_status が paid のときだけ支払い済み", () => {
  assert.equal(isSessionPaid({ payment_status: "paid" }), true);
  for (const s of [{ payment_status: "unpaid" }, { payment_status: "no_payment_required" }, { status: "complete" }, { payment_status: "PAID" }, {}, null, undefined]) {
    assert.equal(isSessionPaid(s), false, `${JSON.stringify(s)} が支払い済みになった`);
  }
});

test("Stripe の 404 だけを「存在しない session」とみなす", () => {
  assert.equal(isStripeNotFound({ statusCode: 404 }), true);
  for (const e of [{ statusCode: 500 }, { statusCode: 429 }, new Error("timeout"), null]) {
    assert.equal(isStripeNotFound(e), false);
  }
});

/* ---------- 注文の二重記録防止 ---------- */

test("同じ session_id の注文を見つける", () => {
  const orders = [{ id: "ORD-A", sessionId: "cs_test_a" }, { id: "ORD-B" }];
  assert.equal(findOrderBySession(orders, "cs_test_a")?.id, "ORD-A");
  assert.equal(findOrderBySession(orders, "cs_test_b"), undefined);
  assert.equal(findOrderBySession(orders, null), undefined);
  assert.equal(findOrderBySession(undefined, "cs_test_a"), undefined);
});

test("同じ session_id の注文は 2 回記録しない", () => {
  const now = new Date("2026-10-05T00:00:00Z");
  const { order } = orderFromSession(paidSession([{ id: "1", quantity: 1 }]));
  const once = appendOrder([], { id: "ORD-1", items: order.items, total: order.total, sessionId: "cs_test_abc" }, now);
  assert.equal(once.length, 1);
  assert.deepEqual(once[0], { id: "ORD-1", date: now.toISOString(), items: order.items, total: order.total, sessionId: "cs_test_abc" });
  const twice = appendOrder(once, { id: "ORD-2", items: order.items, total: order.total, sessionId: "cs_test_abc" }, now);
  assert.equal(twice, once, "同じ配列のまま返す");
  assert.equal(twice.length, 1);
  const other = appendOrder(once, { id: "ORD-3", items: [], total: 0, sessionId: "cs_test_other" }, now);
  assert.deepEqual(other.map((o) => o.id), ["ORD-3", "ORD-1"]);
});
