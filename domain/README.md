# domain — ドメイン層

PAYAPP のビジネスルールの単一の真実。**副作用を持たない純粋な TypeScript** で書き、
React / Next.js / Zustand / Stripe / localStorage には依存しない。

詳しい設計は [`docs/architecture.md`](../docs/architecture.md) を参照。

## コンテキスト

| ディレクトリ | 役割 | 主なモデル |
| --- | --- | --- |
| `shared/` | 共通の値オブジェクト | `Money`, `Quantity` |
| `catalog/` | 商品カタログと分類 | `Product`, `Category` |
| `cart/` | カートの明細・数量・合計 | `Cart`（集約）, `CartItem` |
| `ordering/` | 注文の確定 | `Order`（集約）, `OrderClock` |

## 原則

- **不変（immutable）**: 操作は新しい値を返す（例: `cart.addItem(p)` は新しい `Cart`）
- **不変条件は生成時に検証**: 不正な `Money` / `Product` はそもそも作れない
- **副作用は注入**: 時刻・ID 採番は `OrderClock` などのポート経由（テストで決定的に）
- **永続化契約**: `toJSON()/fromJSON()` が既存ストアの localStorage 形と一致

## テスト

各モジュールに `*.test.ts` を同梱。新しいルールはまずテストから書く（TDD）。

```bash
npm test
```
