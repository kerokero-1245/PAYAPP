import { describe, it, expect } from "vitest";
import { Quantity } from "./quantity";

describe("Quantity", () => {
  it("1 以上の整数を厳格生成できる", () => {
    expect(Quantity.of(1).value).toBe(1);
    expect(Quantity.of(5).value).toBe(5);
  });

  it("厳格生成は 1 未満・非整数を拒否する", () => {
    expect(() => Quantity.of(0)).toThrow();
    expect(() => Quantity.of(-2)).toThrow();
    expect(() => Quantity.of(1.5)).toThrow();
  });

  it("clamp は不正入力を 1 以上の整数に丸める", () => {
    expect(Quantity.clamp(0).value).toBe(1);
    expect(Quantity.clamp(-3).value).toBe(1);
    expect(Quantity.clamp(NaN).value).toBe(1);
    expect(Quantity.clamp("abc").value).toBe(1);
    expect(Quantity.clamp(undefined).value).toBe(1);
    expect(Quantity.clamp(2.9).value).toBe(2);
    expect(Quantity.clamp("4").value).toBe(4);
  });

  it("increment で数量を +1 した新しい値を返す", () => {
    const q = Quantity.of(2);
    expect(q.increment().value).toBe(3);
    expect(q.value).toBe(2);
  });
});
