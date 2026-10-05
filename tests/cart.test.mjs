// カートをカタログに合わせる関数のテスト。実行: npm test
//
// なぜあるか: 以前はカートの価格・商品名を localStorage に保存した値のまま表示しており、
// 書き換えるとその価格で表示・記録された。数量にも上限が無かった。
import { test } from "node:test";
import assert from "node:assert/strict";

import { getProductById } from "../lib/catalog.mjs";
import {
  MAX_QUANTITY,
  clampQuantity,
  reconcileCart,
  removePurchasedFromCart,
} from "../lib/cart.mjs";

test("価格・商品名は保存した値ではなくカタログから引く", () => {
  const cart = reconcileCart([{ id: "1", name: "偽物", price: 1, image: "x", category: "y", quantity: 2 }]);
  assert.deepEqual(cart, [{
    id: "1",
    name: "Éclat Automatic 41",
    price: 248000,
    image: getProductById("1").images[0],
    category: "watches",
    quantity: 2,
  }]);
});

test("カタログに無い id の行は外す", () => {
  const cart = reconcileCart([{ id: "999", quantity: 1, price: 1 }, { id: 5, quantity: 1 }, null, { id: "5", quantity: 1 }]);
  assert.deepEqual(cart.map((i) => i.id), ["5"]);
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
  const cart = reconcileCart([{ id: "1", quantity: 60 }, { id: "5", quantity: 1 }, { id: "1", quantity: 60 }]);
  assert.deepEqual(cart.map((i) => [i.id, i.quantity]), [["1", 99], ["5", 1]]);
});

test("決済した品目と数量だけを取り除き、決済後に足した品は残す", () => {
  const cart = reconcileCart([{ id: "1", quantity: 3 }, { id: "5", quantity: 1 }, { id: "7", quantity: 1 }]);
  const after = removePurchasedFromCart(cart, [{ id: "1", quantity: 2 }, { id: "5", quantity: 1 }]);
  assert.deepEqual(after.map((i) => [i.id, i.quantity]), [["1", 1], ["7", 1]]);
  assert.deepEqual(removePurchasedFromCart(cart, []).map((i) => i.quantity), [3, 1, 1]);
  assert.deepEqual(removePurchasedFromCart([], [{ id: "1", quantity: 1 }]), []);
});
