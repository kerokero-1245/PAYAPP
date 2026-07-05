import { describe, it, expect } from "vitest";
import { Order, OrderClock } from "./order";
import { Cart } from "../cart/cart";
import { Product } from "../catalog/product";

const watch = Product.create({
  id: "1",
  name: "Éclat Automatic 41",
  price: 248000,
  category: "watches",
});

/** 決定的なテスト用クロック（時刻・ID を固定注入） */
const fixedClock: OrderClock = {
  now: () => new Date("2026-07-05T12:00:00.000Z"),
  nextId: () => "ORD-TEST-1",
};

describe("Order", () => {
  it("カートを確定して注文を生成する（時刻・ID は注入）", () => {
    const cart = Cart.empty().addItem(watch).addItem(watch);
    const order = Order.place(cart, fixedClock);

    expect(order.id).toBe("ORD-TEST-1");
    expect(order.date).toBe("2026-07-05T12:00:00.000Z");
    expect(order.total.amount).toBe(496000);
    expect(order.items).toHaveLength(1);
    expect(order.items[0].quantity.value).toBe(2);
  });

  it("空カートからは注文できない", () => {
    expect(() => Order.place(Cart.empty(), fixedClock)).toThrow();
  });

  it("確定後にカートが変わっても注文は不変（スナップショット）", () => {
    let cart = Cart.empty().addItem(watch);
    const order = Order.place(cart, fixedClock);
    cart = cart.addItem(watch); // 確定後にカートを変更
    expect(order.total.amount).toBe(248000);
    expect(order.items[0].quantity.value).toBe(1);
  });

  it("toJSON は履歴永続化の形（id/date/items/total）で出力する", () => {
    const cart = Cart.empty().addItem(watch);
    const json = Order.place(cart, fixedClock).toJSON();
    expect(json).toEqual({
      id: "ORD-TEST-1",
      date: "2026-07-05T12:00:00.000Z",
      total: 248000,
      items: [
        {
          id: "1",
          name: "Éclat Automatic 41",
          price: 248000,
          image: null,
          category: "watches",
          quantity: 1,
        },
      ],
    });
  });
});
