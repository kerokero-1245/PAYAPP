# ディレクトリ構成

```
app/
  page.tsx              トップ（ランディング）
  product/page.tsx      商品一覧（検索・絞り込み）
  product/[id]/page.tsx 商品詳細
  cart/page.tsx         カート
  checkout/route.ts     Stripe Checkout Session 作成 API（REST）
  api/graphql/route.ts  GraphQL API（graphql-yoga）
  api/checkout/session/route.ts  決済確認 API（fulfillCheckout で DB に注文を確定して返す。本体は lib/checkout-session.ts の verifyCheckoutSession）
  api/stripe/webhook/route.ts    Stripe の Webhook（署名を検証し、fulfillCheckout で注文を確定する。本体は lib/stripe-webhook.ts の handleStripeWebhook）
  api/auth/[...all]/route.ts     認証（Better Auth の /api/auth/*。入口は lib/auth/handler.ts。設定は lib/auth/config.ts。公開している口は「認証」）
  success / cancel      決済結果
  error.tsx             想定外のエラー（DB が使えないときなど）の画面「ただいま表示できません」
  not-found.tsx         404 ページ
  orders                注文履歴（サーバでセッションを確かめ、ログイン中の利用者の注文を DB から読む。未ログインは /login?next= へ転送）
  login / signup / account   ログイン・新規登録・アカウント（サーバでセッションを確かめ、フォームだけクライアント。/account は未ログインを /login?next= へ転送）
  about / shipping / contact / legal / privacy / faq   案内ページ（サーバコンポーネント。お問い合わせのフォームだけクライアント）
  globals.css           CSS の入口（Tailwind と app/styles/ を読み込むだけ）
  styles/tokens.css     デザイントークン（@theme と :root の変数）
  styles/base.css       body・フォーカス・スキップリンクなどのベース
  styles/components/    部品の CSS（1 部品 1 ファイル、すべて @layer components）
  styles/motion.css     アニメーションと動きを減らす設定
components/              Header / Footer / ProductCard / CartItem / HeroSlider / SideMenu / CategoryTile / PledgeGrid
components/ui/          共通部品（Button / Section / PageHeader / SectionHeading / Card / EmptyState / StatusMessage / FormField / Price / QuantityStepper など。`as` を受ける部品の props の型は polymorphic.ts）
store/                  productStore / cartStore（Zustand。注文はサーバの DB、ログイン状態はサーバのセッションで、ストアに持たない）
lib/catalog.ts          商品カタログ（クライアントとサーバで共有）
lib/checkout.ts         価格の決定・Session からの注文作成・確認結果の判定（純粋な関数）
lib/checkout-session.ts Checkout Session 作成と決済確認の本体（Route Handler と GraphQL で共有。Stripe は最小の型 StripeLike で、DB は getDb で受ける）
lib/fulfillment.ts      注文の確定 fulfillCheckout（冪等。Webhook・決済確認・GraphQL が呼ぶ）と、注文番号・行の組み立て（純粋な関数）
lib/stripe-webhook.ts   Webhook の本体 handleStripeWebhook（署名の検証・イベントの読み取り・冪等）と、route の配線 createWebhookDeps
lib/log.ts              構造化ログ（1 行 1 JSON）と、例外から名前・コードだけを取り出す describeError（例外を console に渡さない）
lib/order-history.ts    注文履歴の読み取り（利用者ごとの注文。GraphQL の myOrders・order と /orders が呼ぶ。持ち主の絞り込みはここの where だけ）
lib/graphql/            GraphQL の SDL・resolver・handler・認可（authorize.ts の requireViewer）・ブラウザ用クライアント・生成した型
lib/cart.ts             カートをカタログに合わせる・購入分を取り除く（同じ決済では 1 回だけ。純粋な関数）
lib/site.ts             サイト設定・戻り先 URL / metadataBase の決め方（純粋な関数）
lib/stripe.ts           Stripe クライアント（サーバ専用）
lib/format.ts           金額・日付の整形ユーティリティ
lib/contact.ts          お問い合わせの検証（純粋な関数）
lib/policies.ts         配送・保証・返品・テストモードの注記の文面（商品詳細・案内ページ・約束の帯・ヘッダーで共有）
lib/links.ts            カテゴリへのリンク（ヘッダー・フッター・サイドメニュー・トップのタイルで共有）
lib/types.ts            共有するドメインの型（Product・CartLine・Viewer など。型だけで、実行時の値は置かない）
lib/auth/               認証（Better Auth）: config（設定。DB は引数）・handler（/api/auth/* の入口。本文の上限）・server（サーバ専用の getAuth / getViewer）・viewer（セッション → 利用者）・limits（表示名・メール・画像・User-Agent の長さ）・log（Better Auth のログの出し先）・next-path（safeNextPath）・messages（失敗の文）・constants（パスワードの長さ・セッションの期限・入力の上限）・client（ブラウザ用）
lib/db/                 DB のスキーマ（schema.ts）・Neon / PGlite の接続（connect.ts）・アプリの入口（client.ts）・seed・テスト用の DB（test-helpers.ts）
drizzle/                DB のマイグレーション（drizzle-kit generate が出す SQL と履歴。コミットする）
drizzle.config.ts       drizzle-kit の設定
scripts/check-flat-css.ts  平坦な CSS の検査（npm run check:css）
scripts/seed-products.ts   カタログの商品を products 表に入れる（npm run db:seed）
tests/                  node --test のテスト（決済・決済確認・POST /checkout の本体・注文の確定（請求額の照合を含む）・Webhook（配線を含む）・カート・GraphQL（入口の上限・本番の GET と introspection）・認証（入力の長さ・本文の上限・ログに値が出ないこと・公開している口・試行回数の制限）・構造化ログ・next.config のヘッダー・ログイン後の行き先・サイト設定・注文履歴・日付と金額の整形・お問い合わせ・平坦な CSS の検査・DB。TypeScript のまま Node 24（`.nvmrc`）が型を剥がして実行する。support/ = 偽の Stripe・Webhook の署名・本物の Better Auth を PGlite で動かす道具・持ち主と時刻を指定して注文を入れる道具・console に出た内容を集める道具）
e2e/                    Playwright の E2E（*.spec.ts は 1 ファイル 1 導線。db-unavailable.spec.ts は DB の使えないサーバ（ポート 3211）に対して回す。fixtures/ = localStorage の形・Stripe のモック・外部画像、support/ = カタログから期待値を作る・画面を開く・ロケータ・注文履歴の seed の中身、seed.ts = 注文履歴の利用者と注文を E2E 専用の DB に入れる、constants.ts = URL とビューポート）
playwright.config.ts    E2E の設定（next start -p 3210・幅 390 / 1280・retries は CI だけ 1・reporter は list + html）
DESIGN.md               設計の決まりごと（作り方の規則との差分・E2E・トークンと部品の置き場・hover・aria-current・文面・DB・注文・GraphQL・認証）
```
