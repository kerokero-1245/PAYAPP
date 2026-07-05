# ADR-0002: テストランナーに Vitest を採用

- ステータス: 承認
- 日付: 2026-07-05

## 背景

TDD を実践するにはテストランナーが必要。候補は Jest と Vitest。
本プロジェクトは Next.js 16 / TypeScript / ESM 構成。

## 決定

**Vitest** を採用する。

理由:

- ESM / TypeScript をネイティブに扱え、設定が最小
- 実行が高速でウォッチモードの体験が良く、TDD のリズムに合う
- `@vitest/coverage-v8` でカバレッジを標準取得できる
- Vite 系の `resolve.alias` で `@/*` パスエイリアスをそのまま解決できる

## 設定

- 設定: [`vitest.config.ts`](../../vitest.config.ts)
- ドメインは純粋ロジックのため `environment: "node"`（高速）
- 対象: `domain/**/*.test.ts`, `lib/**/*.test.{ts,js}`
- コンポーネントテストを追加する際は `jsdom` + `@testing-library/react` を足し、
  該当ファイル先頭に `// @vitest-environment jsdom` を付与する

## 結果

- `npm test` / `npm run test:watch` / `npm run test:coverage` を提供
- CI で `test:coverage` を実行し、ドメイン層のカバレッジを可視化