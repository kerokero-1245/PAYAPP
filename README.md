# MAISON — Luxury EC (PAYAPP)

ラグジュアリーブランドをイメージした、ダークテーマのECサイト（ポートフォリオ用個人開発）。
商品閲覧からカート、Stripe 決済、注文履歴までの購入体験を、拡張しやすい構成で実装しています。

## 概要
- 黒基調 × シャンパンゴールドの世界観（デザインシステムを `globals.css` に集約）
- 商品一覧 / 詳細 / カート / 決済 / 注文履歴 / 会員（モック認証）まで一通りの EC フロー
- Stripe Checkout（テストモード）による実決済フロー

## 技術スタック
- **Next.js 16**（App Router / Turbopack / SSR・SSG）
- **React 19**
- **Tailwind CSS v4**（`@theme` でデザイントークンを定義）
- **Zustand**（状態管理・`persist` で localStorage 永続化）
- **Stripe**（Checkout Session による決済）
- 画像は `next/image`、フォントは `next/font`（Playfair Display / Inter）

## 主な機能
### 実装済み
- **トップ（ランディング）** — ヒーロースライダー / 新着 / カテゴリショーケース / ブランドプレッジ
- **商品一覧** — カテゴリ絞り込み・キーワード検索（名前 / 説明の部分一致）・件数表示・空状態
- **商品詳細** — 画像ギャラリー（サムネ切替）・数量指定でカート追加・関連商品
- **カート** — 追加 / 削除 / 数量増減・小計 / 合計・localStorage 永続化
- **決済** — Stripe Checkout へ遷移（`/checkout` API で Checkout Session を作成）
- **決済結果** — 成功 `/success`（注文を履歴へ記録しカートを空に）/ キャンセル `/cancel`
- **注文履歴** `/orders` — 過去の注文を新しい順に表示
- **会員** `/login` `/account` — ログイン / ログアウト（※ ポートフォリオ用のモック認証）
- 共通ヘッダー（カート点数バッジ・検索・アカウント）/ フッター / レスポンシブ対応

### 今後の拡張候補
- バックエンド連携（商品 API・実認証 / NextAuth・注文の永続化）
- Stripe Webhook による注文確定・在庫管理
- お気に入り / レビュー / クーポン

## セットアップ

> **Node.js 18.18 以上が必要です**（Next.js 16 の要件）。

```bash
# 依存インストール
npm install

# 開発サーバー
npm run dev            # http://localhost:3000

# 本番ビルド & 起動
npm run build
npm run start
```

## 環境変数
`.env.local` に以下を設定してください。

```
STRIPE_SECRET_KEY=sk_test_xxxx
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_xxxx
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

## ディレクトリ構成
```
app/
  page.tsx              トップ（ランディング）
  product/page.js       商品一覧（検索・絞り込み）
  product/[id]/page.js  商品詳細
  cart/page.js          カート
  checkout/route.js     Stripe Checkout Session 作成 API
  success / cancel      決済結果
  orders / login / account
components/              Header / Footer / ProductCard / CartItem / HeroSlider / SideMenu
store/                  productStore / cartStore / authStore / orderStore（Zustand）
lib/format.js           金額・日付の整形ユーティリティ
```

## 補足
- 認証は現状バックエンドを持たないデモ実装です（パスワード検証なし・localStorage 保持）。
- 商品カタログはモックデータです（`store/productStore.js`）。
- 完成度そのものより、設計・実装方針や UI/UX の考え方をご覧いただくことを目的としています。