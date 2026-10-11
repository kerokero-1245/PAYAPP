# MAISON — Luxury EC (PAYAPP)

ラグジュアリーブランドをイメージした、ダークテーマのECサイト（ポートフォリオ用個人開発）。
商品閲覧からカート、Stripe 決済、注文履歴までの購入体験を、拡張しやすい構成で実装しています。

## スクリーンショット

<img src="docs/screenshots/top.png" width="720" alt="MAISON のトップページ">

<img src="docs/screenshots/product.png" width="720" alt="MAISON の商品詳細ページ">

## 概要

- 黒基調 × シャンパンゴールドの世界観（トークンと部品の CSS を `app/styles/` に、React の共通部品を `components/ui/` に集約）
- 商品一覧 / 詳細 / カート / 決済 / 注文履歴 / 会員（メールアドレス + パスワードの認証）まで一通りの EC フロー
- Stripe Checkout（テストモード）による実決済フロー

## 技術スタック

- **Next.js 16**（App Router / Turbopack / SSR・SSG）
- **React 19**
- **TypeScript**（`strict`。アプリ・テスト・検査スクリプトまで全部 `.ts` / `.tsx`。JS で残すのはツールの設定 `eslint.config.mjs` `postcss.config.mjs` と、検査の見本 `tests/fixtures/flat-css/` だけ）
- **Tailwind CSS v4**（`@theme` でデザイントークンを定義）
- **Zustand**（状態管理・`persist` で localStorage 永続化）
- **Stripe**（Checkout Session による決済。支払いの確認は Webhook と成功ページのどちらからでも、同じ関数で注文をサーバの DB に確定します）
- **GraphQL**（graphql-yoga を Route Handler に載せた `/api/graphql`。型は GraphQL Code Generator で SDL から生成）
- **Playwright**（E2E テスト。本番ビルドした `next start` に、ブラウザで画面を操作して通す。下の「E2E テスト」）
- **PostgreSQL + Drizzle ORM**（表とマイグレーションを TypeScript と SQL で管理。本番は Neon、ローカルとテストは PGlite。注文を保存します。下の「データベース」）
- **Better Auth**（メールアドレス + パスワードの認証。利用者・セッション・口座は DB に置き、cookie は HttpOnly。下の「認証」）
- 画像は `next/image`、フォントは `next/font`（Playfair Display / Inter）

## 主な機能

### 実装済み

- **トップ（ランディング）** — ヒーロースライダー / 新着 / カテゴリショーケース / ブランドプレッジ
- **商品一覧** — カテゴリ絞り込み・キーワード検索（名前 / 説明の部分一致）・件数表示・空状態
- **商品詳細** — 画像ギャラリー（サムネ切替）・数量指定でカート追加・関連商品
- **カート** — 追加 / 削除 / 数量増減（1 商品 1〜99 点）・小計 / 合計・localStorage 永続化（価格と商品名は常にカタログから引き直し）
- **決済** — Stripe Checkout へ遷移（GraphQL の `createCheckoutSession` で Checkout Session を作成。価格はサーバ側のカタログから決定）
- **GraphQL API** `/api/graphql` — 商品・カテゴリの取得、カートの見積もり、決済セッションの作成、決済の照会、ログイン中の利用者（`viewer`）（下の「GraphQL API」）
- **決済結果** — 成功 `/success`（Stripe で支払い済みを確認できたときだけ、サーバの DB に注文を確定して注文番号を出し、購入した分をカートから取り除く）/ キャンセル `/cancel`
- **注文の確定** — Stripe の Webhook `POST /api/stripe/webhook`（`checkout.session.completed` と `checkout.session.async_payment_succeeded`）と成功ページの確認が、同じ `fulfillCheckout` を呼んで注文を DB に 1 件だけ確定します。ブラウザを閉じても注文が残り、どちらが先に・同時に来ても二重になりません（下の「決済の流れ」）
- **注文履歴** `/orders` — このブラウザに以前記録された注文を新しい順に表示（DB に確定した注文を読む形は次の段。下の「決済の流れ」の注意書き）
- **会員** `/signup` `/login` `/account` — メールアドレスとパスワードで新規登録 / ログイン / ログアウト（Better Auth。メール確認とパスワードの再設定は付けていません。ログインしなくても購入できます。下の「認証」）
- **案内ページ** — ブランドストーリー `/about`・配送について `/shipping`・お問い合わせ `/contact`（入力の検証だけを行い、送信も保存もしないデモ）・特定商取引法に基づく表記 `/legal`・プライバシーポリシー `/privacy`・よくある質問 `/faq`
- 共通ヘッダー（カート点数バッジ・検索・アカウント）/ フッター / レスポンシブ対応

### 今後の拡張候補

- バックエンド連携（商品 API・注文履歴をサーバの DB から読む）
- 在庫管理
- お気に入り / レビュー / クーポン

## セットアップ

> **Node.js 22 を使ってください**（22.23.3 で lint・型の検査・ビルド・テストを確認）。graphql 17 と、テスト・検査スクリプト（どちらも TypeScript）を型消去でそのまま実行するために **22.18 以上** が必要です（`package.json` の `engines`）。

```bash
# 依存インストール
npm install

# 開発サーバー（注文と認証が DB を使うので、初回の前に下の「データベース」の db:migrate と db:seed を打つ）
npm run dev            # http://localhost:3000

# 本番ビルド & 起動
npm run build
npm run start

# テスト（決済まわりの純粋な関数・注文の確定・Webhook・GraphQL API・認証（登録・ログイン・セッション・cookie・試行回数の制限・送信元の検査）・お問い合わせの検証・平坦な CSS の検査・DB のスキーマとマイグレーション。Stripe にも外部の DB にも通信しません）
npm test               # node --test tests/*.test.ts（Node 22 / 24 で確認）

# 型の検査（next typegen が Next のルートの型 PageProps・LayoutProps などを作ってから tsc を回す。CI でも実行）
npx next typegen
npx tsc --noEmit

# GraphQL の型を SDL から作り直す（lib/graphql/sdl.ts を変えたら実行してコミット）
npm run codegen

# 平坦な CSS の検査（下の「デザインの書き方」）
npm run check:css

# E2E テスト（Playwright。初回だけブラウザを入れる。詳しくは下の「E2E テスト」）
npx playwright install chromium
npm run test:e2e       # next build してから playwright test

# データベース（下の「データベース」。DATABASE_URL が無ければローカルの PGlite）
npm run db:generate    # lib/db/schema.ts を変えたら、マイグレーションの SQL を drizzle/ に出してコミット
npm run db:migrate     # マイグレーションを当てる
npm run db:seed        # カタログの商品を products に入れる（何度打っても同じ）
```

## 環境変数

`.env.example` を `.env.local` にコピーして設定してください。

| 変数                    | 必須 / 任意                               | 用途                                                                                                                                                                                                                                                                                                                                                           |
| ----------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `STRIPE_SECRET_KEY`     | **必須**（決済を使う場合）                | Checkout Session の作成（`/api/graphql`・`/checkout`）と決済確認（`/api/checkout/session`）。テストモードのキー `sk_test_...` を使ってください                                                                                                                                                                                                                 |
| `NEXT_PUBLIC_BASE_URL`  | 任意（**本番では設定してください**）      | 決済後の戻り先 URL と、OGP 画像を絶対 URL にする基準。未設定・不正な値のときは、戻り先はリクエスト URL の origin、OGP は Next.js の既定（ローカルでは `http://localhost:<port>`、Vercel では本番 URL）になります                                                                                                                                               |
| `STRIPE_WEBHOOK_SECRET` | 本番では **必須**（Webhook を受ける場合） | `POST /api/stripe/webhook` が、Stripe から届いたことを検証する署名の秘密（`whsec_...`）。未設定のあいだ Webhook は 503 を返して何もしません（注文は成功ページの確認でも確定します）。登録の手順は下の「公開（Vercel）」                                                                                                                                        |
| `DATABASE_URL`          | **本番では必須**。開発は任意              | 実行時の接続（プール経由）。Neon の接続文字列。未設定なら、開発・テストではローカルの PGlite（`.pglite/`）に繋ぎます。**本番（`NODE_ENV=production`）で未設定だと例外**です。下の「データベース」                                                                                                                                                              |
| `DATABASE_URL_UNPOOLED` | 任意                                      | マイグレーション用の直結（プールを通さない）。未設定なら `DATABASE_URL` を使います                                                                                                                                                                                                                                                                             |
| `PGLITE_DATA_DIR`       | 任意                                      | PGlite の保存先のディレクトリ（既定は `.pglite`）。`DATABASE_URL` が無いときだけ効きます。本番ビルド（`next start`・E2E）で PGlite を使うという明示にもなります                                                                                                                                                                                                |
| `BETTER_AUTH_SECRET`    | 本番では **必須**。開発は任意             | 認証（Better Auth）のセッションの署名と暗号化の鍵。**本番（`NODE_ENV=production`。Vercel の Production と Preview を含む）では、32 文字以上のランダムな値が必須**で、無い・短い・開発用の固定の値だと認証 API は 500 で失敗します（黙って弱い鍵では動かしません）。作り方: `openssl rand -base64 32`。開発では未設定で構いません（開発用の固定の値を使います） |
| `BETTER_AUTH_URL`       | 任意（**本番では設定してください**）      | 認証の基準の URL（オリジンだけ。パスは付けません）。ログイン・登録の送信元（Origin）の検査が信用するオリジン。**Production にだけ**本番の URL を置き、Preview には置きません（置くとプレビューの URL からのログインが 403 で断られます）。未設定なら、リクエストの URL のオリジンを使います                                                                    |

```
STRIPE_SECRET_KEY=sk_test_xxxx
# STRIPE_WEBHOOK_SECRET=whsec_xxxx
# NEXT_PUBLIC_BASE_URL=https://your-domain.example
# DATABASE_URL=postgres://user:password@ep-xxxx-pooler.region.aws.neon.tech/neondb?sslmode=require
# BETTER_AUTH_SECRET=（openssl rand -base64 32 で作った 32 文字以上の値）
# BETTER_AUTH_URL=https://your-domain.example
```

## 公開（Vercel）

Vercel の GitHub 連携でデプロイします。`vercel.json` は置いていません（Next.js は Vercel が自動で認識し、画像の許可ドメインは `next.config.ts` にあるため、追加の設定が要りません）。

1. Vercel にログインし、**Add New… → Project** でこの GitHub リポジトリを **Import** します（Framework Preset は Next.js のまま、Build Command・Output Directory も既定のまま）。
2. **Environment Variables** に次を設定します（名前は上の「環境変数」の表と同じです）。

   | 変数                    | 設定する環境        | 値                                                                                                           |
   | ----------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------ |
   | `STRIPE_SECRET_KEY`     | Production・Preview | Stripe のテストモードのキー `sk_test_...`                                                                    |
   | `NEXT_PUBLIC_BASE_URL`  | Production だけ     | 本番の URL（例: `https://<プロジェクト名>.vercel.app`）                                                      |
   | `DATABASE_URL`          | Production・Preview | Neon の接続文字列（プール経由）。**必須**（無いと注文を扱う API が失敗します）                               |
   | `STRIPE_WEBHOOK_SECRET` | Production だけ     | Stripe の Webhook の署名シークレット `whsec_...`（下の「Webhook を登録する」で手に入ります）                 |
   | `BETTER_AUTH_SECRET`    | Production・Preview | 認証の鍵。32 文字以上のランダムな値（`openssl rand -base64 32`）。**Production と Preview で別の値**にします |
   | `BETTER_AUTH_URL`       | Production だけ     | 本番の URL（例: `https://<プロジェクト名>.vercel.app`。パスは付けません）                                    |
   - `NEXT_PUBLIC_BASE_URL` を Preview にも入れると、プレビューで決済したときの戻り先が本番になります。Preview では未設定にしておけば、戻り先はそのプレビューの URL になります。
   - `NEXT_PUBLIC_` で始まる値はビルド時に埋め込まれるので、変えたら再デプロイしてください。
   - `DATABASE_URL` は **本番では必須**です（`NODE_ENV=production` は Vercel の Production と Preview の両方）。無いと、決済の確認 API・Webhook・GraphQL の `orderBySession` が DB に繋げず失敗し、成功ページは「決済の確認が取れていません」になります。置き場所は「データベース」の環境変数の表です。
   - `STRIPE_WEBHOOK_SECRET` は Production だけに置きます。Webhook は本番の URL にしか登録しないので、Preview では置かず（置いても何も届きません）、成功ページの確認で注文を確定します。
   - `BETTER_AUTH_SECRET` は **Production と Preview の両方に必須**です（`NODE_ENV=production` は両方）。無い・32 文字未満だと、認証 API（`/api/auth/*`）が 500 になり、ログイン・登録ができません（ゲストの購入には影響しません）。
   - `BETTER_AUTH_URL` は **Production だけ**に置きます。Preview に置くと（Vercel の既定の「全環境」で作ると）、プレビューの URL からのログインが「信用できない送信元」として 403 で断られます。置かなければ、そのプレビュー自身の URL を信用します。

3. **Settings → Build and Deployment → Node.js Version** を **22.x** にします（ローカルと CI に合わせる）。
4. データベースを用意します。Neon の本番ブランチを作り、接続文字列を `DATABASE_URL`（プール経由）に置きます。**デプロイの前に**、手元から本番の DB へマイグレーションと seed を当てます（`products` に商品が無いと、注文の明細が外部キーで失敗し、決済の確認が通りません。認証の表 `user` `session` `account` `verification` と `orders.user_id` の外部キーも、このマイグレーションで作られます。**認証を入れたデプロイの前に必ず当ててください**。無いと、登録とログインが 500 になります）。接続文字列は `.env.local` に書くか、そのコマンドだけに環境変数で渡します。

   ```bash
   DATABASE_URL_UNPOOLED='<Neon の直結の接続文字列>' npm run db:migrate
   DATABASE_URL='<Neon のプール経由の接続文字列>' npm run db:seed
   ```

5. **Deploy** を押します。以後は `main` への push で本番に、プルリクエストではプレビューに自動でデプロイされます。

### Webhook を登録する（本番・テストモード）

Webhook は、ブラウザを閉じたり回線が切れたりして成功ページに戻れなかった決済も、注文として残すためのものです（成功ページの確認だけでも注文は確定します）。デプロイして本番の URL が決まってから 1 回だけ登録します。

1. Stripe ダッシュボードを **テストモード** にして、**開発者 → Webhook → エンドポイントを追加**（「+ エンドポイントを追加」）を開きます。
2. **エンドポイント URL** に `https://<本番のドメイン>/api/stripe/webhook`、**イベント** に `checkout.session.completed` と `checkout.session.async_payment_succeeded` の 2 つだけを選んで作成します。
3. 作成したエンドポイントの **署名シークレット**（`whsec_...`）を表示して、Vercel の **Production** の環境変数 `STRIPE_WEBHOOK_SECRET` に置き、**再デプロイ**します（環境変数は再デプロイで反映されます）。
4. テストカード（`4242 4242 4242 4242`）で 1 回購入します。ダッシュボードのエンドポイントの配信が `200` になり、Neon の `orders` に 1 件入っていれば完了です。署名のヘッダーが無い・合わない送信は `400`、`STRIPE_WEBHOOK_SECRET` が未設定なら `503` で、どちらも DB を変えません。

ローカルで Webhook を試すには Stripe CLI の `stripe listen --forward-to localhost:3000/api/stripe/webhook` が要ります（このリポジトリには入れていません）。CLI が無くても、成功ページの確認で注文は確定します。

`main` への push とプルリクエストでは、GitHub Actions（`.github/workflows/ci.yml`）が lint・型の検査・平坦な CSS の検査・GraphQL の生成物の鮮度・テスト・本番ビルドを Node 22 で実行します。ビルドは Stripe のキーが無くても通るので（キーはリクエスト時にだけ読みます）、CI には環境変数を設定していません。別の job `e2e` が、ブラウザ（Playwright の Chromium）で画面を操作する E2E も回します（Stripe には通信せず、secrets も使いません）。

## 決済の流れ

1. カートの「購入手続きへ」で、商品の **id と数量だけ** を GraphQL の `createCheckoutSession`（`POST /api/graphql`）に送ります。`POST /checkout` も同じ本体（`lib/checkout-session.ts`）を使う REST の入口として残しています。どちらも `Content-Type: application/json` 以外の本文は 415 で受け付けません。
2. サーバは価格と商品名を `lib/catalog.ts`（クライアントのストアと共有するカタログ）から引いて Checkout Session を作り、購入する id と数量を Session の metadata に持たせます。ログイン中なら、セッションから引いた利用者の id を `client_reference_id` にも付けます（注文の持ち主になる。下の「認証」）。
   - 知らない id、1〜99 の整数でない数量（同じ id は合算してから判定）、大きすぎる本文（GraphQL は 4KB、`/checkout` は 16KB を超えるもの）は Stripe に送る前に弾きます（GraphQL では `errors` の UserError / HTTP 413、`/checkout` では 400 / 413）。カートに表示する理由は UserError の文言（`CHECKOUT_ERRORS`）と 413 の文言に限り、GraphQL 層の型エラーや隠された例外のときは既定の文言（「決済処理に失敗しました…」）を出します。ブラウザで価格を書き換えても請求額は変わりません。
   - 戻り先 URL は `NEXT_PUBLIC_BASE_URL`、無ければリクエスト URL の origin から作ります（`Origin` ヘッダーは使いません）。
3. Stripe の決済ページから `/success?session_id={CHECKOUT_SESSION_ID}` に戻ります。ほぼ同時に、Stripe が `POST /api/stripe/webhook` を呼びます。
4. **注文の確定は、Webhook と成功ページのどちらから呼ばれても同じ関数 `fulfillCheckout`（`lib/fulfillment.ts`）です。**
   - **Webhook**（`checkout.session.completed` と `checkout.session.async_payment_succeeded` の 2 種だけ）: 加工していない本文と `Stripe-Signature`、`STRIPE_WEBHOOK_SECRET` で署名を検証します（通らなければ 400、秘密が未設定なら 503。どちらも DB と Stripe に触れません）。本文の中身は信じず、Checkout Session の id だけ取り出して Stripe から取り直します。処理したイベントの id は `stripe_events` に記録し、同じイベントは 2 回処理しません。
   - **成功ページ** `/success` は `GET /api/checkout/session?session_id=...` で確認します。確認ルートも `fulfillCheckout` を呼び、結果を 3 つに分けます。
     - **支払い済み**（`payment_status` が `paid`）: 注文が DB にあります（Webhook が先に確定していれば Stripe に問い合わせずその注文を返し、無ければ Stripe から取り直して確定します）。確認ルートは metadata の id と数量をカタログに当てて作った注文（品目・単価・数量・合計）に **注文番号**（`ORD-` と 10 文字）を付けて返し、成功ページはその番号を出して、購入した品目と数量だけをカートから取り除きます（決済後にカートへ足した品は残ります。カートが空でも注文番号は出ます）。取り除くのは同じ決済では 1 回だけです（成功ページを再読み込みしても買った分が余計に消えません。ブラウザに残すのは「取り除き済みの決済の id」だけで、注文は記録しません）。
     - **未払い**（未払いの Session・`session_id` が無い / 形が不正）: 「決済を確認できませんでした」と表示し、何も記録しません。
     - **確認できなかった**（通信失敗・サーバエラー・10 秒の時間切れ・DB に確定できなかった・カートの更新時の例外）: 「決済の確認が取れていません。二重に購入しないでください」と「もう一度確認する」を表示し、何も記録しません。サーバ側の Stripe への要求も 4 秒で打ち切り、再試行は 1 回までです。
   - **同じ決済で注文は 1 件だけ**です。`orders.stripe_session_id` の一意制約と `INSERT … ON CONFLICT DO NOTHING` が、同時に来た 2 つ目を空振りにします。注文・明細・処理済みのイベントは 1 つのトランザクションで書くので、途中で失敗しても半端な注文は残らず、Stripe の再送や「もう一度確認する」でやり直せます。未払いの Session は注文にしません（あとから入金される支払い方法は、入金の `async_payment_succeeded` で確定します）。

価格の決定・Session からの注文作成・確認結果の判定・戻り先 URL の決め方は `lib/checkout.ts` `lib/cart.ts` `lib/site.ts` の純粋な関数に分けてあり、`tests/` で検証しています。注文を DB に確定する `fulfillCheckout`（`lib/fulfillment.ts`）、Webhook の本体 `handleStripeWebhook`（`lib/stripe-webhook.ts`）、決済確認の route の本体 `verifyCheckoutSession`（`lib/checkout-session.ts`）は、DB と Stripe を引数で受ける形にしてあり、`tests/fulfillment.test.ts` `tests/webhook.test.ts` `tests/checkout-verify.test.ts` が PGlite（メモリ上の Postgres）と偽の Stripe で確かめています（同じイベントを 2 回・同時に送っても、Webhook と成功ページが同時に来ても注文は 1 件、署名が違えば 400 で DB は変わらない、未払いは注文にしない、など。Webhook の署名は Stripe のライブラリで本物を作ります）。外から来る値（localStorage・リクエスト本文・Stripe の metadata・環境変数）を受ける関数は引数を `unknown` で受けて中で絞ります（テストはわざと不正な値を渡します）。お問い合わせの検証（`lib/contact.ts`。文字数は見た目の 1 文字で数える）は `tests/contact.test.ts`、平坦な CSS の検査（`scripts/check-flat-css.ts`）が違反を見落とさないことは `tests/flat-css.test.ts` で検証しています。

> **注文履歴 `/orders` は、まだ以前このブラウザに記録された履歴を読みます。** 注文は支払いを確認したときにサーバの DB に確定されますが、`/orders` は DB の注文をまだ読まないので、新しい注文は一覧に出ません（ブラウザには記録しなくなりました）。注文番号は成功ページと、`orderBySession`（GraphQL）の応答で見られます。`/orders` をログイン中の自分の注文だけをサーバから読む形にするのは、次の段です（認証と、注文の持ち主 `orders.user_id` は入りました）。

## GraphQL API

エンドポイントは `/api/graphql`（`POST` は `Content-Type: application/json`。`GET` でもクエリを送れます。開発中はブラウザで開くと GraphiQL が使えます）。スキーマは `lib/graphql/sdl.ts`、resolver は `lib/graphql/schema.ts` です。

商品をカテゴリとキーワードで絞り込む:

```graphql
query {
  products(category: "watches", q: "automatic") {
    id
    name
    price
    images
  }
}
```

カート（localStorage の id と数量）をサーバのカタログ価格で見積もる:

```graphql
query Quote($items: [CartItemInput!]!) {
  cartQuote(items: $items) {
    quote {
      total
      totalQuantity
      items {
        product {
          name
          price
        }
        quantity
        subtotal
      }
    }
    errors {
      code
      message
    }
  }
}
# variables: { "items": [{ "id": "1", "quantity": 2 }, { "id": "5", "quantity": 1 }] }
```

Stripe Checkout Session を作る（カートの「購入手続きへ」が使っているもの）:

```graphql
mutation Create($items: [CartItemInput!]!) {
  createCheckoutSession(items: $items) {
    url
    errors {
      code
      message
    }
  }
}
```

ログイン中の利用者（ログインしていなければ `viewer` は `null`。cookie でログインしているブラウザから送ったときだけ入ります。ログイン・登録は GraphQL ではなく `/api/auth/*` です）:

```graphql
query {
  viewer {
    id
    email
    name
  }
}
```

```bash
curl -s http://localhost:3000/api/graphql \
  -H 'Content-Type: application/json' \
  -d '{"query":"{ categories { slug label } }"}'
```

### 型の生成（codegen）

`npm run codegen` が `lib/graphql/sdl.ts` の SDL から、スキーマの型と resolver の型（`Resolvers`）を `lib/graphql/__generated__/types.ts` に出します（設定は `codegen.ts`）。生成物はコミットし、CI は `npm run codegen` のあとに差分が無いことを確かめます。SDL を変えたら `npm run codegen` を実行して、生成物も一緒にコミットしてください。

### 設計の要点

- **カートはブラウザ、注文は DB**: サーバはカートを保存しません（Vercel のサーバレスでは関数のメモリに状態を置けないため）。カートはブラウザの localStorage にあり、API は送られた id と数量から毎回計算します。注文は支払いを確認したときに DB に確定し、`orderBySession` はその DB の注文を返します（resolver 自身は状態を持たず、DB と Stripe は context で受けます）。
- **価格はサーバが決める**: `CartItemInput` は `id` と `quantity` だけで、price を受け付けません。合計も Stripe に渡す金額も `lib/catalog.ts` から引きます（`/checkout` と同じ関数を共有）。
- **ログイン中の利用者は context の `getViewer`**: `viewer`（ログインしていなければ `null`。エラーにしない）と `createCheckoutSession`（持ち主の id を `client_reference_id` に付ける）が必要としたときだけ、1 リクエストにつき 1 回だけ cookie からセッションを引きます。セッションの cookie が無い要求（ゲスト）は DB に触れません。引けなかったとき（DB に繋がらないなど）は、ゲスト扱いにせず失敗にします（ログイン中の人の購入が持ち主なしになるのを避けるため）。ログイン・ログアウト・登録は GraphQL ではなく `/api/auth/*`（下の「認証」）。
- **決済の確認は REST のまま**: 成功ページは `GET /api/checkout/session` の HTTP ステータスで「支払い済み / 未払い / 確認できなかった」を分けて二重購入を防いでいるので、GraphQL には置き換えていません。GraphQL の `orderBySession` は、同じ `fulfillCheckout` を呼んで DB の注文（`orderNo` つき。小計は購入した時点の単価 × 数量）を返す読み取り用の入口です。確定済みなら Stripe を呼びません。
- **入口の保護**:
  - 本文は 4KB まで（超えたら 413）。POST は `Content-Type: application/json` だけ（それ以外は 415）。
  - Stripe を呼ぶフィールド（`createCheckoutSession`・`orderBySession`）は 1 リクエスト合計 1 つまで。エイリアス・フラグメント・`@include` 経由も数えるので、1 リクエストで Stripe に多重に要求させられません。Mutation も 1 つまで。
  - 選択するフィールドの総数は 1 リクエスト 200 まで（エイリアス・同名フィールドの重複・フラグメントの展開も数える）。解析・検証結果のキャッシュは 100 件まで。
  - Stripe の例外文は返さない（yoga の maskedErrors）。CORS ヘッダーは付けない（他オリジンを反射しない）。応答はすべて `Cache-Control: no-store`。GraphiQL は本番（`NODE_ENV=production`）では出さない。
- テスト（`tests/graphql.test.ts`）は handler を `new Request()` で直接呼び、偽の Stripe を差し込みます。サーバは起動せず、Stripe にも通信しません（Node 22 の型消去で `.ts` をそのまま読み込みます）。

## 認証

メールアドレスとパスワードで新規登録・ログインします（[Better Auth](https://www.better-auth.com/) 1.7.6。利用者・セッション・口座は DB に置きます）。**メール確認とパスワードの再設定は付けていません**（メールを送る仕組みを持たないため。忘れた場合は別のメールアドレスで新規登録します。画面にも書いてあります）。ログインしなくても購入できます（ゲストの注文は持ち主なし）。

- **画面**: 新規登録 `/signup`・ログイン `/login`・アカウント `/account`（ログアウトもここ）。`/account` は未ログインだと `/login?next=%2Faccount` へ転送し、ログインしたら元のページへ戻します。ヘッダーのアカウントのリンクと表示名は、サーバのセッション（`GET /api/auth/get-session`）から出します（ヘッダーは全ページにあるので、ページを読み込むたびに 1 回呼びます。アプリの中の遷移では呼ばず、タブに戻ったとき・ログイン／ログアウトしたときに取り直します。セッションの cookie が無ければ DB には触れず `null` を返します）。ブラウザの localStorage にはログイン状態を持ちません。
- **API**: 登録・ログイン・ログアウトは GraphQL の Mutation ではなく、Better Auth の `/api/auth/*`（`app/api/auth/[...all]/route.ts`）が受けます（cookie の発行と削除・試行回数の制限・送信元（Origin）の検査をまとめて持っているため）。GraphQL は `viewer`（ログイン中の利用者の `id` `email` `name`。未ログインは `null`）を読むだけです。
- **セッション**: DB の `session` 表に置き、cookie には署名つきの識別子だけを持たせます（`better-auth.session_token`。HttpOnly・SameSite=Lax・Path=/、https の URL では Secure）。有効期間は 7 日で、最後の更新から 1 日以上たって使うと延びます（使い続ける限り切れません）。ログインのたびに新しい識別子を作ります。
- **パスワード**: 8〜128 文字。Node の scrypt でハッシュにして `account.password` に入れます（平文は DB のどの表にも残りません。テストが全部の表を探して確かめています）。ログインの失敗は「メールアドレスかパスワードが違います」の 1 文で、メールアドレスの有無を言い分けません。
- **ログイン後の行き先（`?next=`）**: URL に書ける値（誰でも作れる）なので、そのまま移動先にしません。自サイトの中のパスだけを通す純粋な関数 `safeNextPath`（`lib/auth/next-path.ts`）を通し、`//evil.example`・`/\evil.example`・`https://…`・`javascript:` などは `/account` に落とします（短い文字列の総当たりのテストつき）。
- **購入と持ち主**: ログイン中に購入手続きへ進むと、サーバがセッションから引いた利用者の `id` を Checkout Session の `client_reference_id` に付けます（リクエストの本文の値は使いません）。注文を確定する `fulfillCheckout` が、それを `orders.user_id` に入れます（Webhook と成功ページのどちらから確定しても同じです。付いていない決済・実在しない利用者はゲストの注文として確定し、支払い済みの注文を失いません）。注文を持ち主ごとに読むのは次の段です。
- **ファイル**: `lib/auth/config.ts`（設定。DB は引数で受ける）・`server.ts`（サーバ専用。`getAuth` と、ページが使う `getViewer`）・`viewer.ts`（セッション → 利用者）・`next-path.ts`・`messages.ts`（失敗の文）・`constants.ts`（パスワードの長さ・セッションの期限）・`client.ts`（ブラウザ用）。認証の表は `lib/db/schema.ts`（Better Auth の CLI の出力が正本。`tests/auth.test.ts` が Better Auth の要求との食い違いを検出します）。

### 既定値の採否

Better Auth 1.7.6 のコード（`node_modules`）で確かめた既定値と、そのまま採ったか、変えたかの一覧です。Better Auth を上げるときは、この表と `tests/auth.test.ts` を読み直してください。

| 項目                        | 値                                                                                                                                                                                                                                                            | 採否                                           |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| cookie                      | `better-auth.session_token`（https では `__Secure-` 付き）。HttpOnly・SameSite=Lax・Path=/・Max-Age 7 日・Secure は https のとき。Domain は付けない                                                                                                           | 採用                                           |
| セッションの期限            | 7 日。最後の更新から 1 日以上たって `/api/auth/get-session` を通ったときだけ、7 日先へ延ばして cookie も更新する。絶対の期限は無い                                                                                                                            | 採用（`lib/auth/constants.ts` で明示して固定） |
| 期限を延ばす場所            | サーバコンポーネントと GraphQL からの確認では延ばさず（`disableRefresh`）、`/api/auth/get-session` だけが延ばす（DB の期限と cookie の期限を食い違わせないため）                                                                                              | 変更                                           |
| 試行回数の制限              | 本番（`NODE_ENV=production`）だけ有効。同じ IP から、ログイン・登録は 10 秒に 3 回、そのほかは 10 秒に 100 回。超えると 429（正しいパスワードでも通さない）。IP は `x-forwarded-for` が値 1 つのときだけ信用する。保存先はメモリ（Vercel では関数の実体ごと） | 採用（限界あり。下）                           |
| 送信元（Origin）の検査      | `BETTER_AUTH_URL`（無ければリクエスト自身）のオリジンだけを信用する。cookie 付きの POST は Origin を照合し、他のサイトからのフォーム送信（`Sec-Fetch-Site: cross-site`）は拒否する                                                                            | 採用                                           |
| `BETTER_AUTH_URL`           | オリジンだけを受け付ける（パスが付くと Better Auth はそれを基準にして動かなくなる）。Preview には置かない                                                                                                                                                     | 変更（検査を足した）                           |
| パスワード                  | 8〜128 文字・scrypt（N=16384・r=16・p=1）                                                                                                                                                                                                                     | 採用                                           |
| メール確認・再設定          | なし。登録のあとはそのままログインする                                                                                                                                                                                                                        | 付けない                                       |
| 登録の書き込み              | user・account・session を 1 つのトランザクションで作る（既定は別々。途中で失敗してもログインできない利用者を残さない）                                                                                                                                        | 変更                                           |
| `BETTER_AUTH_SECRET`        | 本番では必須・32 文字以上。無い・短い・開発用の固定の値は例外（既定は警告だけ）                                                                                                                                                                               | 変更                                           |
| 利用状況の送信（telemetry） | なし（既定でも無効。明示して切る）                                                                                                                                                                                                                            | 採用                                           |

既知の限界（段 3 の後の敵対レビューで判断します）: 試行回数の制限はメモリなので、分散した試行は関数の実体ごとに通ります。セッションに絶対の期限が無く、メールアドレスの持ち主を確かめず、登録済みのメールアドレスが分かります（メール確認を使わないため）。scrypt のコストは固定です。表示名とメールアドレスの長さに上限がありません。`NODE_ENV=test` か環境変数 `TEST` があると Better Auth の Origin の検査が切れます（本番に置かないでください）。

### ローカルで動かす

```bash
npm run db:migrate   # 認証の表（user・session・account・verification）も作る
npm run dev          # /signup で登録 → /account
```

開発では `BETTER_AUTH_SECRET` も `BETTER_AUTH_URL` も未設定で動きます（開発用の固定の秘密と、リクエストの URL を使います）。本番ビルドを手元で動かす（`next start`）ときは、32 文字以上の `BETTER_AUTH_SECRET` が要ります。PGlite のファイルを開けるのは 1 プロセスだけなので、dev サーバが動いている間は `db:migrate` を打たないでください。

## E2E テスト（Playwright）

買い物の導線（一覧・詳細・カート・購入手続き・決済結果・会員・お問い合わせ・404）を、ブラウザで実際に操作して確かめます。本番ビルドした `next start`（ポート 3210）に対して回し、画面の幅は 390 と 1280 の 2 つ（`mobile-390` / `desktop-1280`）です。ロケータはクラス名ではなく役割（role）とアクセシブルネームで取ります。画面の見た目の差は E2E の仕事にせず、前後のスクリーンショットで見ます。

```bash
npx playwright install chromium          # 初回だけ。Playwright の Chromium をダウンロードする
npm run test:e2e                         # next build してから playwright test
npx playwright test                      # ビルド済みなら、これだけ（webServer が db:migrate → db:seed → next start -p 3210 を順に打つ）
npx playwright test e2e/cart.spec.ts --project=desktop-1280   # 1 本・1 つの幅だけ
npx playwright show-report               # 直近の HTML レポート
```

- **先に `npm run build` が要ります**（`npx playwright test` だけを打つとき）。`test.only` の消し忘れは CI で落ちます
- **ブラウザ**: ローカルは Playwright の Chromium が既定です。システムの Google Chrome で回すときは `PW_CHANNEL=chrome npx playwright test`
- **Stripe には通信しません**。Stripe に向かう通信（カートの `createCheckoutSession` と、`/success` の決済確認）は、テストごとに既定で閉じてあり、各テストが `page.route` でモックします。モックし忘れた通信が出るとテストが失敗します。サーバの `STRIPE_SECRET_KEY` も空にして起動するので、`.env.local` にキーがあっても使われません
- **DB**: サーバを立てる前に、E2E 専用の PGlite（`.pglite-e2e/`。`PGLITE_DATA_DIR` で指定し、`DATABASE_URL` は空にして `.env.local` の Neon に繋がらないようにします）へマイグレーションと seed を当てます。決済の確認はモックするので、決済の画面の操作はサーバの DB まで届きません。注文の確定そのもの（冪等・Webhook との競合）は、単体テストが PGlite で確かめます。**認証は別で、本物の Better Auth がこの DB に利用者とセッションを書きます**（`e2e/auth.spec.ts`: 新規登録 → ログアウト → ログイン・`/account` の転送・誤ったパスワード・外部の `next`・cookie の属性）。メールアドレスは実行ごとに一意にします（DB は実行をまたいで残るため）
- **認証の設定**: サーバに固定のダミーの `BETTER_AUTH_SECRET` と `BETTER_AUTH_URL`（サーバ自身の URL）を渡し、`.env.local` の値に左右されないようにします。本番ビルドは試行回数の制限が有効で、接続元の IP が分からない要求を全員で 1 つの枠に入れるため、幅ごとに `x-forwarded-for` を変えて枠を分けます（`playwright.config.ts`・`e2e/constants.ts`）
- **実際の Stripe に通信する 1 本**（`@stripe`）だけは、`STRIPE_SECRET_KEY`（テストモードのキー）と `E2E_STRIPE=1` の**両方**があるときだけ動き、無ければ skip になります。サーバが Checkout Session を作り、`https://checkout.stripe.com/…` へ遷移するところまでで、Stripe の画面には何もしません。CI にはキーを置かないので skip です

  ```bash
  E2E_STRIPE=1 STRIPE_SECRET_KEY=sk_test_xxxx npx playwright test --grep @stripe
  ```

- 商品の画像（picsum）は 1×1 の PNG に差し替え、外には出ません
- テストの出力に `Error: Internal: NoFallbackError` と出ることがあります。存在しない商品（`/product/999`）が 404 になるときに Next 16.0.8 が内部で出すログで、404 が返っていれば異常ではありません
- 失敗したテストの調査用に、HTML レポート（`playwright-report/`）・スクリーンショット・retry 時の trace が `test-results/` に出ます（git には入れません）

`e2e/` の構成は下の「ディレクトリ構成」のとおりです。localStorage の形（カート・注文履歴）は `e2e/fixtures/storage.ts` の 1 か所だけが知っていて（ログイン状態は localStorage に持たないので、seed しません）、期待値（件数・商品名・金額）はカタログから組みます。

## データベース

注文と、認証の利用者・セッションをサーバに置きます。**決済の確認 API（`/api/checkout/session`）・Stripe の Webhook・GraphQL の `orderBySession` が、`orders` / `order_items` / `stripe_events` を読み書きします**（どれも `fulfillCheckout` を通ります）。商品ページ・一覧・カートは DB を読みません。注文履歴 `/orders` はまだブラウザの localStorage を読みます（DB の注文を読む形は次の段）。表・制約・マイグレーション・seed・テスト用の DB・CI の検査を入れてあります。

- **Drizzle ORM**: 表と制約は `lib/db/schema.ts` が正本です。`npm run db:generate`（`drizzle-kit generate`）が SQL のマイグレーションを `drizzle/` に出すので、**生成物もコミット**します。`drizzle-kit push` は使いません（履歴が残らないため）。
- **本番は Neon、ローカルとテストは PGlite**: Neon は Postgres で、`@neondatabase/serverless` の Pool（WebSocket 越し）で繋ぐのでトランザクションが使えます。PGlite は Postgres を WASM で同じプロセスの中に立てるもので、docker も Neon のアカウントもネットも要りません。どちらに繋ぐかを決めるのは `lib/db/connect.ts` の `resolveDbTarget` の 1 か所だけで、`DATABASE_URL` があれば Neon、無ければ PGlite（既定は `.pglite/` に保存。`PGLITE_DATA_DIR` で変えられます）です。**本番（`NODE_ENV=production`）で `DATABASE_URL` が無いときは例外にします**（PGlite のファイルに黙って切り替えると、Vercel では書き込めず、書けたとしても消える DB に注文を置くことになるため）。本番ビルドをローカルで動かすとき（`next start`・E2E）は、`PGLITE_DATA_DIR` で PGlite を使うと明示します。
- 商品の正本は `lib/catalog.ts` のままです。`products` 表は `npm run db:seed` がカタログから作る写しで、注文の明細の外部キーと在庫のためにあります（商品ページは DB を読まないので、ビルドに DB は要りません）。

### ローカルで動かす（Neon なし）

```bash
npm run db:migrate   # .pglite/ に PGlite のデータベースを作り、マイグレーションを当てる（初回は初期化で数秒かかります）
npm run db:seed      # カタログの商品を products に入れる（2 回目からは 0 件。在庫は上書きしません）
```

PGlite のファイルを開けるのは同時に 1 プロセスだけです。ほかのプロセス（dev サーバなど）が開いている間は `db:migrate` / `db:seed` を打たないでください。

決済の確認が注文を DB に書くので、`npm run dev` の前に `npm run db:migrate` と `npm run db:seed` を打っておきます。`products` に商品が無いと、注文の明細が外部キー（`order_items.product_id`）で失敗し、成功ページは「決済の確認が取れていません」になります（半端な注文は残らないので、seed を打ってから「もう一度確認する」で確定できます）。

### Neon に繋ぐ

Neon の開発用ブランチの接続文字列を、`.env.local` の `DATABASE_URL`（プール経由）と `DATABASE_URL_UNPOOLED`（直結）に置き、同じ `npm run db:migrate` → `npm run db:seed` を打ちます（`drizzle-kit` と seed は `.env.local` を自分で読みます）。Neon のドライバは WebSocket のプロキシ越しに Neon へ繋ぐものなので、素の Postgres（docker の postgres など）には繋がりません。

### 表と制約

| 表              | 主な列                                                                                                                                            | 制約                                                                                                                                                                                                                                 |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `products`      | `id`（カタログの id）・`price`（税込の円）・`stock`（null = 在庫を管理しない）・`updated_at`                                                      | 主キー `id` / `price >= 0` / `stock >= 0`                                                                                                                                                                                            |
| `orders`        | `id`（uuid）・`order_no`（画面に出す番号）・`user_id`（null = ゲスト）・`stripe_session_id`・`status`・`total`・`paid_at`・`created_at`           | 主キー `id` / `order_no` と `stripe_session_id` は一意 / `total >= 0` / `status` は `paid`・`pending`・`failed` のどれか / `user_id` → `user`（利用者を消しても注文は残り、`user_id` だけ null になる）                              |
| `order_items`   | `order_id`・`product_id`・`name` と `unit_price`（購入した時点の写し）・`quantity`                                                                | 主キー (`order_id`, `product_id`) / `quantity` は `lib/cart.ts` の `MIN_QUANTITY`〜`MAX_QUANTITY`（1〜99）/ `unit_price >= 0` / `order_id` → `orders`（注文を消すと明細も消える）/ `product_id` → `products`（売れた商品は消せない） |
| `stripe_events` | `id`（`evt_...`）・`processed_at`                                                                                                                 | 主キー `id`（同じ Webhook イベントを 2 回処理しないための一意制約）                                                                                                                                                                  |
| `user`          | `id`・`name`・`email`・`email_verified`・`image`・`created_at`・`updated_at`                                                                      | 主キー `id` / `email` は一意（Better Auth が小文字にして保存する）                                                                                                                                                                   |
| `session`       | `id`・`token`・`expires_at`・`user_id`・`ip_address`・`user_agent`・`created_at`・`updated_at`                                                    | 主キー `id` / `token` は一意 / `user_id` → `user`（利用者を消すとセッションも消える）                                                                                                                                                |
| `account`       | `id`・`account_id`・`provider_id`・`user_id`・`password`（scrypt のハッシュ）・外部サービスのトークン（今は使わない）・`created_at`・`updated_at` | 主キー `id` / `user_id` → `user`（利用者を消すと口座も消える）。メール + パスワードは `provider_id = 'credential'` の行                                                                                                              |
| `verification`  | `id`・`identifier`・`value`・`expires_at`・`created_at`・`updated_at`                                                                             | 主キー `id`。メール確認・再設定の一時的な値の表（今は使わない。Better Auth が要求する）                                                                                                                                              |

認証の 4 つの表は Better Auth の CLI（`npx auth@1.7.6 generate --adapter drizzle --dialect postgresql`）の出力を取り込んだもので、列の名前（`emailVerified` など）は Better Auth のフィールド名のままです。変えたのは時刻の列だけ（生成物は `timestamp`、このリポジトリは `timestamptz`）。`role` 列は管理画面の段まで持ちません。認証の表を書くのは Better Auth（`lib/auth/`）だけです。

### 注文の確定（`fulfillCheckout`）

- **注文を書くのは `lib/fulfillment.ts` の `fulfillCheckout` だけ**です（Webhook・決済確認 API・GraphQL はこれを呼ぶだけで、`orders` を直接書きません）。DB と Stripe は引数で受けます。
- 流れ: ① `stripe_session_id` で DB を探し、あればそれを返す（Stripe を呼ばない）→ ② Stripe から Checkout Session を取り直し、`payment_status` が `paid` でなければ何もしない → ③ 1 つのトランザクションで `orders`（`ON CONFLICT (stripe_session_id) DO NOTHING`）・`order_items`・処理済みの Webhook イベントを書き、DB の注文を読み戻して返す。
- 注文の中身は既存の `orderFromSession`（metadata の id と数量 + カタログ）です。名前と単価は購入した時点の値を `order_items` に写すので、あとでカタログが変わっても注文は変わりません。画像とカテゴリは表示のためにカタログから引きます。明細は商品 id の順で返します（DB は並びを持たないため）。
- 注文番号 `order_no` は `ORD-` と 10 文字の乱数（50 ビット）です。万一重なれば一意制約が INSERT を失敗させ、確定は失敗して再送や再確認でやり直せます（別の注文として握りつぶしません）。持ち主 `user_id` は、ログイン中に買った決済の `client_reference_id`（`user.id`）が実在する利用者のときだけ入ります（無い・実在しない・不正な値はゲスト = null。支払い済みの注文を失わないため）。

### 環境変数（データベースと Webhook）

| 変数                    | 用途                       | Production                              | Preview                                                                   | Development（.env.local）                | CI                                                 |
| ----------------------- | -------------------------- | --------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------- | -------------------------------------------------- |
| `DATABASE_URL`          | 実行時の接続（プール経由） | Neon の本番ブランチ                     | Neon のプレビューブランチ（既存アカウント連携の方式で自動）か開発ブランチ | Neon の開発ブランチ                      | テストは PGlite なので不要。移行ジョブだけ Secrets |
| `DATABASE_URL_UNPOOLED` | マイグレーション用の直結   | 同上                                    | 同上                                                                      | 同上                                     | 移行ジョブの Secrets                               |
| `STRIPE_WEBHOOK_SECRET` | Webhook の署名検証         | 本番 URL に登録したエンドポイントの秘密 | 置かない（プレビューは成功ページの経路で確定する）                        | `stripe listen` の秘密（CLI を入れたら） | テストはダミー（E2E は空）                         |

- `DATABASE_URL` と `DATABASE_URL_UNPOOLED` がどちらも未設定なら、開発・テストではローカルの PGlite です（本番では例外）。Vercel の Neon 連携が実際に入れる変数名は、連携したあとの Vercel の画面で確かめて、違えばこの表を直してください。
- CI の列の「移行ジョブ」は、本番の DB へ自動で当てるジョブです（まだありません。Neon を用意したら足します）。今の CI は Secrets を使わず、`services: postgres` の Postgres に当てて確かめるだけです。

### マイグレーションの運用

- 変更は「足す → 使う → 消す」の 3 段に分けます。1 つの PR で列を消して、同時にその列を使うのをやめる変更はしません（Vercel のデプロイとマイグレーションの順番は保証されないため）。
- CI（`.github/workflows/ci.yml`）は Secrets を使わずに 3 つを確かめます。(1) `npm test` が PGlite に全マイグレーションを当てて、制約と seed を検査する。(2) `db-migrations-fresh` ジョブが `drizzle-kit generate` を打って `drizzle/` に差分が出ない（スキーマを変えて generate を忘れていない）ことを確かめる。(3) `db-migrate-postgres` ジョブが、`services: postgres`（17 と 18）の本物の Postgres に `drizzle-kit migrate` を 2 回当てる。
- 本番の DB への適用は、`main` で CI が通ったあとに走るジョブとして足す予定です。Vercel のビルドコマンドには入れません（プレビューのビルドが本番の DB に当たる事故を避けるため）。それまでは `DATABASE_URL_UNPOOLED` を指定して手元で `npm run db:migrate` と `npm run db:seed` を打ちます（手順は「公開（Vercel）」）。

## ディレクトリ構成

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
  api/auth/[...all]/route.ts     認証（Better Auth の /api/auth/*。登録・ログイン・ログアウト・セッションの取得。設定は lib/auth/config.ts）
  success / cancel      決済結果
  not-found.tsx         404 ページ
  orders                注文履歴
  login / signup / account   ログイン・新規登録・アカウント（サーバでセッションを確かめ、フォームだけクライアント。/account は未ログインを /login?next= へ転送）
  about / shipping / contact / legal / privacy / faq   案内ページ（サーバコンポーネント。お問い合わせのフォームだけクライアント）
  globals.css           CSS の入口（Tailwind と app/styles/ を読み込むだけ）
  styles/tokens.css     デザイントークン（@theme と :root の変数）
  styles/base.css       body・フォーカス・スキップリンクなどのベース
  styles/components/    部品の CSS（1 部品 1 ファイル、すべて @layer components）
  styles/motion.css     アニメーションと動きを減らす設定
components/              Header / Footer / ProductCard / CartItem / HeroSlider / SideMenu / CategoryTile / PledgeGrid
components/ui/          共通部品（Button / Section / PageHeader / SectionHeading / Card / EmptyState / StatusMessage / FormField / Price / QuantityStepper など。`as` を受ける部品の props の型は polymorphic.ts）
store/                  productStore / cartStore / orderStore（Zustand。orderStore は /orders が読むだけで、もう書かない。ログイン状態はサーバのセッションで、ストアに持たない）
lib/catalog.ts          商品カタログ（クライアントとサーバで共有）
lib/checkout.ts         価格の決定・Session からの注文作成・確認結果の判定（純粋な関数）
lib/checkout-session.ts Checkout Session 作成と決済確認の本体（Route Handler と GraphQL で共有。Stripe は最小の型 StripeLike で、DB は getDb で受ける）
lib/fulfillment.ts      注文の確定 fulfillCheckout（冪等。Webhook・決済確認・GraphQL が呼ぶ）と、注文番号・行の組み立て（純粋な関数）
lib/stripe-webhook.ts   Webhook の本体 handleStripeWebhook（署名の検証・イベントの読み取り・冪等）
lib/graphql/            GraphQL の SDL・resolver・handler・ブラウザ用クライアント・生成した型
lib/cart.ts             カートをカタログに合わせる・購入分を取り除く（同じ決済では 1 回だけ。純粋な関数）
lib/site.ts             サイト設定・戻り先 URL / metadataBase の決め方（純粋な関数）
lib/stripe.ts           Stripe クライアント（サーバ専用）
lib/format.ts           金額・日付の整形ユーティリティ
lib/contact.ts          お問い合わせの検証（純粋な関数）
lib/policies.ts         配送・保証・返品・テストモードの注記の文面（商品詳細・案内ページ・約束の帯・ヘッダーで共有）
lib/links.ts            カテゴリへのリンク（ヘッダー・フッター・サイドメニュー・トップのタイルで共有）
lib/types.ts            共有するドメインの型（Product・CartLine・Order・Viewer など。型だけで、実行時の値は置かない）
lib/auth/               認証（Better Auth）: config（設定。DB は引数）・server（サーバ専用の getAuth / getViewer）・viewer（セッション → 利用者）・next-path（safeNextPath）・messages（失敗の文）・constants（パスワードの長さ・セッションの期限）・client（ブラウザ用）
lib/db/                 DB のスキーマ（schema.ts）・Neon / PGlite の接続（connect.ts）・アプリの入口（client.ts）・seed・テスト用の DB（test-helpers.ts）
drizzle/                DB のマイグレーション（drizzle-kit generate が出す SQL と履歴。コミットする）
drizzle.config.ts       drizzle-kit の設定
scripts/check-flat-css.ts  平坦な CSS の検査（npm run check:css）
scripts/seed-products.ts   カタログの商品を products 表に入れる（npm run db:seed）
tests/                  node --test のテスト（決済・決済確認・注文の確定・Webhook・カート・GraphQL・認証・ログイン後の行き先・サイト設定・お問い合わせ・平坦な CSS の検査・DB。TypeScript のまま Node 22.18 以上が型を剥がして実行する。support/ = 偽の Stripe・Webhook の署名・本物の Better Auth を PGlite で動かす道具）
e2e/                    Playwright の E2E（*.spec.ts は 1 ファイル 1 導線。fixtures/ = localStorage の形・Stripe のモック・外部画像、support/ = カタログから期待値を作る・画面を開く・ロケータ、constants.ts = URL とビューポート）
playwright.config.ts    E2E の設定（next start -p 3210・幅 390 / 1280・retries は CI だけ 1・reporter は list + html）
DESIGN.md               設計の決まりごと（共通化の線引き・トークンと部品の置き場・hover・aria-current・文面の置き場）
```

## デザインの書き方

- **見た目は共通部品に寄せる**: ページの `className` には配置と大きさのユーティリティ（`flex` `grid` `gap-*` `mt-*` `max-w-*` など）だけを書き、色・文字・枠・角丸・影・動きは `components/ui/` の部品か `app/styles/components/` の部品クラス（`.btn` `.card` `.heading` `.lead` …）で表す。ページ間で h1 の大きさ・上下余白・見出し下の線・カードの余白がそろうのはこのため
- **平坦な CSS**: 1 クラス 1 役割の足し算（`.btn` + `.btn-outline` + `.btn-sm`）。子孫・子・兄弟の結合子、セレクタの入れ子、`:deep()`、`@apply`、`!important`、ID セレクタは使わない。ページ側も Tailwind の `!` 接尾辞・`group-hover:`・`space-y-*`・`divide-*`・任意値 `[…]` は使わない。状態は要素自身の `data-*` / `aria-current` で表す（例: 商品カードの画像の拡大は画像の `data-active`）。部品 CSS の `:hover` は `@media (hover: hover)` の中に書く（タッチ端末でタップ後に hover の色が残らないように）。これらの書き方は `npm run check:css`（CI でも実行）が検査する。検査の対象と見つけられない書き方（クラス名を変数で組み立てる書き方、ページに書いた色・文字の見た目のユーティリティそのもの）は `scripts/check-flat-css.ts` の冒頭に書いてあり、検査が違反を見落とさないことは `tests/flat-css.test.ts`（`tests/fixtures/flat-css/` の見本）で確かめている
- **層**: 部品クラスはすべて `@layer components`（ページのユーティリティが部品より勝つ）。body・スキップリンク・アニメーション・動きを減らす設定は層の外に置き、`!important` を使わずに効かせている（`app/styles/motion.css` の冒頭のコメント）

## 補足

- 認証は Better Auth（メールアドレス + パスワード）です。メール確認とパスワードの再設定は付けていません（メールを送る仕組みが無いため）。上の「認証」の既知の限界を承知のうえで公開しているポートフォリオです。
- 商品カタログはモックデータです（`lib/catalog.ts`）。
- 注文は Stripe の Webhook と成功ページの確認で、サーバの DB に確定します。注文履歴のページ（`/orders`）は、DB の注文を読む形にする前の段階で、以前このブラウザに記録された履歴（localStorage）を読むだけです。
- 完成度そのものより、設計・実装方針や UI/UX の考え方をご覧いただくことを目的としています。

## ライセンス

[MIT License](LICENSE) で公開しています。
