/**
 * Quantity — 数量を表す値オブジェクト
 *
 * カート行の数量は 1 以上の整数でなければならない、というドメインルールを
 * 一箇所に集約する。UI 由来の不正値（0・NaN・負数・小数）に対する
 * 丸め方（clamp）も明示的に定義する。
 */
export class Quantity {
  private constructor(private readonly _value: number) {}

  /** 厳格生成。1 以上の整数でなければ例外。 */
  static of(value: number): Quantity {
    if (!Number.isInteger(value) || value < 1) {
      throw new Error(`Quantity.of: 数量は 1 以上の整数である必要があります: ${value}`);
    }
    return new Quantity(value);
  }

  /**
   * 寛容生成。UI からの不正入力（0 / NaN / 負数 / 小数 / 文字列）を
   * 1 以上の整数に丸める。既存カートの `Math.max(1, Number(q) || 1)` を
   * ドメインの正式ルールとして表現したもの。
   */
  static clamp(value: unknown): Quantity {
    const n = Math.floor(Number(value));
    if (!Number.isFinite(n) || n < 1) {
      return new Quantity(1);
    }
    return new Quantity(n);
  }

  get value(): number {
    return this._value;
  }

  /** 1 加算した新しい Quantity */
  increment(): Quantity {
    return new Quantity(this._value + 1);
  }

  equals(other: Quantity): boolean {
    return this._value === other._value;
  }
}
