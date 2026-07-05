/**
 * Money — 金額を表す値オブジェクト（日本円 / JPY）
 *
 * 円は最小単位が「円」で小数を持たないため、内部表現は整数の円。
 * 不変（immutable）で、演算は常に新しい Money を返す。
 * 生成時に不変条件（整数・非負・有限）を検証するため、
 * 「不正な金額」がドメイン内に存在しえないことを型で保証する。
 */
export class Money {
  private constructor(private readonly _amount: number) {}

  /** 円建ての金額を生成。整数・非負・有限でなければ例外。 */
  static yen(amount: number): Money {
    if (!Number.isFinite(amount)) {
      throw new Error(`Money.yen: 金額が有限の数値ではありません: ${amount}`);
    }
    if (!Number.isInteger(amount)) {
      throw new Error(`Money.yen: 円は整数で表現します: ${amount}`);
    }
    if (amount < 0) {
      throw new Error(`Money.yen: 金額は非負である必要があります: ${amount}`);
    }
    return new Money(amount);
  }

  /** ゼロ円 */
  static zero(): Money {
    return new Money(0);
  }

  /** 内部の円額（整数） */
  get amount(): number {
    return this._amount;
  }

  /** 加算 */
  add(other: Money): Money {
    return Money.yen(this._amount + other._amount);
  }

  /** 数量倍（factor は非負整数） */
  multiply(factor: number): Money {
    if (!Number.isInteger(factor) || factor < 0) {
      throw new Error(`Money.multiply: 係数は非負整数である必要があります: ${factor}`);
    }
    return Money.yen(this._amount * factor);
  }

  /** 値の等価判定 */
  equals(other: Money): boolean {
    return this._amount === other._amount;
  }

  /** 日本円表記に整形（例: 248000 -> "¥248,000"） */
  format(): string {
    return `¥${new Intl.NumberFormat("ja-JP").format(this._amount)}`;
  }
}
