import { describe, it, expect } from "vitest";
import { Cart } from "./cart";
import { Product } from "../catalog/product";

const watch = Product.create({
  id: "1",
  name: "Éclat Automatic 41",
  price: 248000,
  category: "watches",
  images: ["watch.jpg"],
});

const wallet = Product.create({
  id: "4",
  name: "Bifold Wallet",
  price: 42000,
  category: "leather",
});

describe("Cart", () => {
  it("空カートを生成できる", () => {
    const cart = Cart.empty();
    expect(cart.isEmpty).toBe(true);
    expect(cart.totalItems()).toBe(0);
    expect(cart.totalPrice().amount).toBe(0);
  });

  it("商品を追加すると数量 1 の明細ができ、代表画像を保持する", () => {
    const cart = Cart.empty().addItem(watch);
    expect(cart.items).toHaveLength(1);
    expect(cart.items[0].quantity.value).toBe(1);
    expect(cart.items[0].image).toBe("watch.jpg");
    expect(cart.items[0].category).toBe("watches");
  });

  it("同じ商品を再追加すると数量が増える（行は増えない）", () => {
    const cart = Cart.empty().addItem(watch).addItem(watch).addItem(watch);
    expect(cart.items).toHaveLength(1);
    expect(cart.items[0].quantity.value).toBe(3);
    expect(cart.totalItems()).toBe(3);
  });

  it("複数商品の合計金額・点数を算出する", () => {
    const cart = Cart.empty().addItem(watch).addItem(wallet).addItem(wallet);
    // 248000 + 42000*2 = 332000
    expect(cart.totalPrice().amount).toBe(332000);
    expect(cart.totalItems()).toBe(3);
  });

  it("明細を削除できる", () => {
    const cart = Cart.empty().addItem(watch).addItem(wallet).removeItem("1");
    expect(cart.items).toHaveLength(1);
    expect(cart.items[0].productId).toBe("4");
  });

  it("数量更新は 1 未満・不正値を 1 に丸める", () => {
    const cart = Cart.empty().addItem(watch);
    expect(cart.updateQuantity("1", 5).items[0].quantity.value).toBe(5);
    expect(cart.updateQuantity("1", 0).items[0].quantity.value).toBe(1);
    expect(cart.updateQuantity("1", -2).items[0].quantity.value).toBe(1);
    expect(cart.updateQuantity("1", NaN).items[0].quantity.value).toBe(1);
  });

  it("存在しない商品の数量更新は何も変えない", () => {
    const cart = Cart.empty().addItem(watch);
    const after = cart.updateQuantity("999", 3);
    expect(after.items[0].quantity.value).toBe(1);
  });

  it("操作は不変で、元のカートを変更しない", () => {
    const original = Cart.empty().addItem(watch);
    original.addItem(wallet);
    expect(original.items).toHaveLength(1);
  });

  it("toJSON / fromJSON でラウンドトリップできる", () => {
    const cart = Cart.empty().addItem(watch).addItem(wallet).addItem(wallet);
    const json = cart.toJSON();
    expect(json.items[0]).toEqual({
      id: "1",
      name: "Éclat Automatic 41",
      price: 248000,
      image: "watch.jpg",
      category: "watches",
      quantity: 1,
    });
    const restored = Cart.fromJSON(json);
    expect(restored.totalPrice().amount).toBe(cart.totalPrice().amount);
    expect(restored.totalItems()).toBe(cart.totalItems());
  });

  it("clear で空になる", () => {
    const cart = Cart.empty().addItem(watch).clear();
    expect(cart.isEmpty).toBe(true);
  });
});
