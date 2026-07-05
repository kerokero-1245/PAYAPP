import { describe, it, expect } from "vitest";
import { Product } from "./product";
import { Money } from "../shared/money";

const base = {
  id: "1",
  name: "Éclat Automatic 41",
  price: 248000,
  category: "watches",
  images: ["a.jpg", "b.jpg"],
};

describe("Product", () => {
  it("プレーンな価格数値を Money に変換して生成する", () => {
    const p = Product.create(base);
    expect(p.price).toBeInstanceOf(Money);
    expect(p.price.amount).toBe(248000);
    expect(p.category).toBe("watches");
  });

  it("Money を直接渡しても生成できる", () => {
    const p = Product.create({ ...base, price: Money.yen(1000) });
    expect(p.price.amount).toBe(1000);
  });

  it("id / name が空なら拒否する", () => {
    expect(() => Product.create({ ...base, id: "  " })).toThrow();
    expect(() => Product.create({ ...base, name: "" })).toThrow();
  });

  it("未知のカテゴリを拒否する", () => {
    expect(() => Product.create({ ...base, category: "unknown" })).toThrow();
  });

  it("代表画像は先頭画像、無ければ null", () => {
    expect(Product.create(base).primaryImage).toBe("a.jpg");
    expect(Product.create({ ...base, images: [] }).primaryImage).toBeNull();
  });
});
