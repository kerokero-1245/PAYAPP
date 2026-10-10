// カートをカタログに合わせる関数のテスト。実行: npm test
//
// なぜあるか: 以前はカートの価格・商品名を localStorage に保存した値のまま表示しており、
// 書き換えるとその価格で表示・記録された。数量にも上限が無かった。
import { test } from "node:test";
import assert from "node:assert/strict";

import { getProductById } from "../lib/catalog.ts";
import {
  MAX_QUANTITY,
  MAX_SETTLED_SESSIONS,
  clampQuantity,
  reconcileCart,
  reconcileSettledSessions,
  removePurchasedFromCart,
  settlePurchase,
} from "../lib/cart.ts";

test("価格・商品名は保存した値ではなくカタログから引く", () => {
  const cart = reconcileCart([
    { id: "1", name: "偽物", price: 1, image: "x", category: "y", quantity: 2 },
  ]);
  assert.deepEqual(cart, [
    {
      id: "1",
      name: "Éclat Automatic 41",
      price: 248000,
      image: getProductById("1")!.images[0],
      category: "watches",
      quantity: 2,
    },
  ]);
});

test("カタログに無い id の行は外す", () => {
  const cart = reconcileCart([
    { id: "999", quantity: 1, price: 1 },
    { id: 5, quantity: 1 },
    null,
    { id: "5", quantity: 1 },
  ]);
  assert.deepEqual(
    cart.map((i) => i.id),
    ["5"],
  );
  assert.deepEqual(reconcileCart(null), []);
  assert.deepEqual(reconcileCart("x"), []);
});

test("数量は 1〜99 に丸め、同じ id は合算してから上限を当てる", () => {
  assert.equal(clampQuantity(0), 1);
  assert.equal(clampQuantity(-5), 1);
  assert.equal(clampQuantity(2.7), 2);
  assert.equal(clampQuantity("3"), 3);
  assert.equal(clampQuantity(NaN), 1);
  assert.equal(clampQuantity(1e21), MAX_QUANTITY);
  const cart = reconcileCart([
    { id: "1", quantity: 60 },
    { id: "5", quantity: 1 },
    { id: "1", quantity: 60 },
  ]);
  assert.deepEqual(
    cart.map((i) => [i.id, i.quantity]),
    [
      ["1", 99],
      ["5", 1],
    ],
  );
});

test("決済した品目と数量だけを取り除き、決済後に足した品は残す", () => {
  const cart = reconcileCart([
    { id: "1", quantity: 3 },
    { id: "5", quantity: 1 },
    { id: "7", quantity: 1 },
  ]);
  const after = removePurchasedFromCart(cart, [
    { id: "1", quantity: 2 },
    { id: "5", quantity: 1 },
  ]);
  assert.deepEqual(
    after.map((i) => [i.id, i.quantity]),
    [
      ["1", 1],
      ["7", 1],
    ],
  );
  assert.deepEqual(
    removePurchasedFromCart(cart, []).map((i) => i.quantity),
    [3, 1, 1],
  );
  assert.deepEqual(removePurchasedFromCart([], [{ id: "1", quantity: 1 }]), []);
});

test("同じ決済の購入分は 1 回しか取り除かない（成功ページを開き直しても、買った分が余計に消えない）", () => {
  const cart = {
    items: reconcileCart([
      { id: "1", quantity: 3 },
      { id: "5", quantity: 2 },
    ]),
    settledSessions: [],
  };
  const bought = [{ id: "1", quantity: 1 }];

  const once = settlePurchase(cart, "cs_test_a", bought);
  assert.deepEqual(
    once.items.map((i) => [i.id, i.quantity]),
    [
      ["1", 2],
      ["5", 2],
    ],
  );
  assert.deepEqual(once.settledSessions, ["cs_test_a"]);

  // 2 回目（再読み込み・開き直し）は何もしない: 同じ決済なので、カートは元のオブジェクトのまま
  assert.equal(settlePurchase(once, "cs_test_a", bought), once);

  // 別の決済の購入分は、別に取り除く
  const other = settlePurchase(once, "cs_test_b", bought);
  assert.deepEqual(
    other.items.map((i) => [i.id, i.quantity]),
    [
      ["1", 1],
      ["5", 2],
    ],
  );
  assert.deepEqual(other.settledSessions, ["cs_test_a", "cs_test_b"]);
});

test("取り除き済みの決済は新しい MAX_SETTLED_SESSIONS 件だけ覚え、localStorage から戻すときは文字列だけ拾う", () => {
  let cart = { items: reconcileCart([]), settledSessions: [] as string[] };
  for (let n = 0; n < MAX_SETTLED_SESSIONS + 5; n++) {
    cart = settlePurchase(cart, `cs_test_${n}`, []);
  }
  assert.equal(cart.settledSessions.length, MAX_SETTLED_SESSIONS);
  assert.equal(cart.settledSessions[0], "cs_test_5", "古いものから忘れる");
  assert.equal(
    cart.settledSessions.at(-1),
    `cs_test_${MAX_SETTLED_SESSIONS + 4}`,
  );

  assert.deepEqual(
    reconcileSettledSessions(["cs_test_a", 1, null, "", { id: "x" }, "cs_b"]),
    ["cs_test_a", "cs_b"],
  );
  for (const notArray of [undefined, null, "cs_test_a", 1, {}]) {
    assert.deepEqual(reconcileSettledSessions(notArray), []);
  }
  const tooMany = Array.from(
    { length: MAX_SETTLED_SESSIONS + 3 },
    (_, n) => `cs_${n}`,
  );
  assert.deepEqual(
    reconcileSettledSessions(tooMany),
    tooMany.slice(-MAX_SETTLED_SESSIONS),
  );
});
