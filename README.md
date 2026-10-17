# MAISON NOIR — Luxury EC

ラグジュアリーブランドをイメージした、ダークテーマのECサイトで、商品閲覧からカート、Stripe 決済、注文履歴までの購入体験を、拡張しやすい構成で実装しています（ポートフォリオ用個人開発）。

## デモ

公開準備中です（Vercel で公開予定）。公開したら、ここに URL とテストカードの案内を足します。

## スクリーンショット

<img src="docs/screenshots/top.png" width="720" alt="MAISON NOIR のトップページ">

<img src="docs/screenshots/product.png" width="720" alt="MAISON NOIR の商品詳細ページ">

## 技術的な見どころ

### 1. Webhook と成功ページが同じ確定処理を通り、注文は 1 件だけ

Stripe の Webhook・成功ページの決済確認・GraphQL の `orderBySession` は、どれも同じ `fulfillCheckout` を呼びます。`orders.stripe_session_id` の一意制約と `INSERT … ON CONFLICT DO NOTHING`、1 つのトランザクションで、どちらが先に・同時に来ても注文は 1 件です。テストは PGlite の上で同時の呼び出しを再現し、Webhook の署名は Stripe のライブラリで本物を作って検証します。

- `lib/fulfillment.ts` — `fulfillCheckout`（`ON CONFLICT DO NOTHING` + 1 つのトランザクション）
- `lib/db/schema.ts` — `orders.stripe_session_id` の一意制約
- `lib/stripe-webhook.ts`・`lib/checkout-session.ts`・`lib/graphql/schema.ts` — 3 つの入口が同じ関数を呼ぶ
- `tests/fulfillment.test.ts`・`tests/checkout-verify.test.ts` — 同時に呼んでも、Webhook と成功ページが同時でも注文は 1 件
- `tests/webhook.test.ts`・`tests/support/webhook.ts` — 本物の署名と `constructEvent` で検証

### 2. 価格と商品名はサーバが決める

カートから送るのは商品の id と数量だけで、GraphQL の `CartItemInput` には price がありません。Stripe に渡す金額と商品名はサーバのカタログから引くので、ブラウザで価格を書き換えても請求額は変わりません。確定のときも、Stripe の請求額と通貨がカタログから作った合計と合わなければ注文にしません。

- `lib/graphql/sdl.ts` — `CartItemInput` は `id` と `quantity` だけ
- `lib/checkout.ts` — `buildLineItems`（金額と商品名を `lib/catalog.ts` から引く）・`findPaymentMismatch`（請求額と通貨の照合）
- `tests/checkout.test.ts` — 送られた price と name を無視することを確かめる

### 3. push と PR ごとに回す CI の幅

整形（Prettier）・lint（警告 0）・型・平坦な CSS の検査・GraphQL の生成物の鮮度・単体テスト・本番ビルドに加えて、Playwright の E2E、マイグレーションの差分の検査、本物の Postgres 17 / 18 へのマイグレーションの適用を、別々の job で回します。

- `.github/workflows/ci.yml` — job `ci`・`e2e`・`db-migrations-fresh`・`db-migrate-postgres`
- `package.json` — `lint` は `eslint --max-warnings 0`

## 概要

- 黒基調 × シャンパンゴールドの世界観（トークンと部品の CSS を `app/styles/` に、React の共通部品を `components/ui/` に集約）
- 商品一覧 / 詳細 / カート / 決済 / 注文履歴 / 会員（メールアドレス + パスワードの認証）まで一通りの EC フロー
- Stripe Checkout（テストモード）による実決済フロー。注文は Stripe の Webhook と成功ページの確認で、サーバの DB に確定します。注文履歴のページ（`/orders`）は、ログイン中の利用者の注文だけをその DB から読みます（ログインせずに買った注文は出ません。以前のバージョンがブラウザに記録した履歴は引き継ぎません）
- 商品カタログはモックデータです（`lib/catalog.ts`）
- 認証は Better Auth（メールアドレス + パスワード）です。メール確認とパスワードの再設定は付けていません（メールを送る仕組みが無いため）。[認証](docs/auth.md#既定値の採否)の既知の限界を承知のうえで公開しているポートフォリオです
- 完成度そのものより、設計・実装方針や UI/UX の考え方をご覧いただくことを目的としています

## 技術スタック

- **Next.js 16**（App Router / Turbopack / SSR・SSG）・**React 19**
- **TypeScript**（`strict`。アプリ・テスト・検査スクリプトまで全部 `.ts` / `.tsx`）
- **Tailwind CSS v4**（`@theme` でデザイントークンを定義）
- **Zustand**（状態管理・`persist` で localStorage 永続化）
- **Stripe**（Checkout Session による決済。[決済の流れ](docs/checkout.md)）
- **GraphQL**（graphql-yoga を Route Handler に載せた `/api/graphql`。型は GraphQL Code Generator で SDL から生成。[GraphQL API](docs/graphql.md)）
- **PostgreSQL + Drizzle ORM**（本番は Neon、ローカルとテストは PGlite。[データベース](docs/database.md)）
- **Better Auth**（メールアドレス + パスワードの認証。cookie は HttpOnly。[認証](docs/auth.md)）
- **Playwright**（本番ビルドした `next start` に、ブラウザで画面を操作して通す E2E。[E2E テスト](docs/e2e.md)）
- 画像は `next/image`、フォントは `next/font`（Playfair Display / Inter）

## 主な機能

- **トップ（ランディング）** — ヒーロースライダー / 新着 / カテゴリショーケース / ブランドプレッジ
- **商品一覧・詳細** — カテゴリ絞り込み・キーワード検索・画像ギャラリー・数量指定でカート追加・関連商品
- **カート** — 追加 / 削除 / 数量増減（1 商品 1〜99 点）・localStorage 永続化（価格と商品名は常にカタログから引き直し）
- **決済と注文** — Stripe Checkout へ遷移し、支払いを確認できたら注文番号を出す。注文履歴 `/orders` はログイン中の自分の注文だけ
- **会員** `/signup` `/login` `/account` — 新規登録 / ログイン / ログアウト（ログインしなくても購入できます）
- **案内ページ** — ブランドストーリー・配送について・お問い合わせ（入力の検証だけのデモ）・特定商取引法に基づく表記・プライバシーポリシー・よくある質問
- 今後の拡張候補: バックエンド連携（商品 API）・在庫管理・お気に入り / レビュー / クーポン

## 動かす

Node.js 24（`.nvmrc`）を使います。外部の DB が無くても、ローカルの PGlite（`.pglite/`）で動きます。

```bash
npm install
npm run db:migrate   # マイグレーションを当てる
npm run db:seed      # カタログの商品を products に入れる
npm run dev          # http://localhost:3000
npm test             # 単体テスト（Stripe にも外部の DB にも通信しない）
```

決済を試すには `.env.local` に Stripe のテストモードのキーが要ります。環境変数・型の検査・E2E は、詳しくは [docs/setup.md](docs/setup.md) を見てください。

## ドキュメント

- [docs/setup.md](docs/setup.md) — セットアップのコマンドと環境変数
- [docs/deploy.md](docs/deploy.md) — Vercel・Neon・Stripe の Webhook で公開する手順
- [docs/checkout.md](docs/checkout.md) — 決済の流れと注文の確定
- [docs/graphql.md](docs/graphql.md) — GraphQL API のクエリ例・型の生成・設計の要点
- [docs/auth.md](docs/auth.md) — 認証（公開している口・既定値の採否・既知の限界）
- [docs/e2e.md](docs/e2e.md) — Playwright の E2E テスト
- [docs/database.md](docs/database.md) — 表と制約・注文の確定と読み取り・マイグレーションの運用
- [docs/structure.md](docs/structure.md) — ディレクトリ構成
- [docs/css.md](docs/css.md) — デザインの書き方（共通部品・平坦な CSS・層）

作り方の規則と、この repo で違うこと: [DESIGN.md](DESIGN.md#この-repo-での適用)

## ライセンス

[MIT License](LICENSE) で公開しています。
