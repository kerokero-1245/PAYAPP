import { describe, it, expect } from "vitest";
import { Money } from "./money";

describe("Money", () => {
  it("円建ての金額を生成できる", () => {
    expect(Money.yen(248000).amount).toBe(248000);
    expect(Money.zero().amount).toBe(0);
  });

  it("不正な金額を拒否する", () => {
    expect(() => Money.yen(-1)).toThrow();
    expect(() => Money.yen(1.5)).toThrow();
    expect(() => Money.yen(NaN)).toThrow();
    expect(() => Money.yen(Infinity)).toThrow();
  });

  it("加算・乗算で新しい Money を返す", () => {
    const a = Money.yen(1000);
    const b = Money.yen(500);
    expect(a.add(b).amount).toBe(1500);
    expect(a.multiply(3).amount).toBe(3000);
    // 元の値は不変
    expect(a.amount).toBe(1000);
  });

  it("乗算の係数は非負整数のみ許可する", () => {
    expect(() => Money.yen(100).multiply(-1)).toThrow();
    expect(() => Money.yen(100).multiply(1.5)).toThrow();
    expect(Money.yen(100).multiply(0).amount).toBe(0);
  });

  it("値の等価判定ができる", () => {
    expect(Money.yen(100).equals(Money.yen(100))).toBe(true);
    expect(Money.yen(100).equals(Money.yen(200))).toBe(false);
  });

  it("日本円表記に整形する", () => {
    expect(Money.yen(248000).format()).toBe("¥248,000");
    expect(Money.zero().format()).toBe("¥0");
  });
});
