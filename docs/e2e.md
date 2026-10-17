# E2E テスト（Playwright）

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
- **DB**: サーバを立てる前に、E2E 専用の PGlite（`.pglite-e2e/`。`PGLITE_DATA_DIR` で指定し、`DATABASE_URL` は空にして `.env.local` の Neon に繋がらないようにします）へマイグレーションと seed を当てます。seed は、商品（`npm run db:seed`）と、注文履歴が見せる利用者と注文（`e2e/seed.ts`。本物の Better Auth で登録した利用者に注文が 2 件、ゲストの注文が 1 件。毎回、自分の利用者と注文だけを消して作り直します）です。買う操作（Stripe の決済）は E2E では行えないので、買った注文を DB に入れるのは seed です。決済の確認はモックするので、決済の画面の操作はサーバの DB まで届きません。注文の確定そのもの（冪等・Webhook との競合）と、持ち主ごとの絞り込み・ページ送りは、単体テストが PGlite で確かめます。**認証は別で、本物の Better Auth がこの DB に利用者とセッションを書きます**（`e2e/auth.spec.ts`: 新規登録 → ログアウト → ログイン・`/account` の転送・誤ったパスワード・外部の `next`・cookie の属性）。**注文履歴は、この DB の注文をサーバから読む**ので `e2e/orders.spec.ts` が確かめます（未ログインの転送・新規登録直後の空の表示・注文を持つ利用者の履歴が新しい順で、ゲストの注文は出ない・成功ページ（実サーバの確認）の注文番号と同じ・別の context でも同じ）。メールアドレスは実行ごとに一意にします（DB は実行をまたいで残るため）
- **DB が使えないサーバ**: 同じビルドを別のポート（3211）でも立て、PGlite の保存先を作れないパス（`package.json/pglite-unavailable`）を渡します。DB に触れる要求は必ず失敗するので、セッションの cookie を持つ人の `/orders` `/account` `/login` `/signup` が「ただいま表示できません」（`app/error.tsx`）になること、cookie を持たない人のホーム・商品・カート・ログインは動くことを `e2e/db-unavailable.spec.ts` が確かめます。
- **認証の設定**: サーバに固定のダミーの `BETTER_AUTH_SECRET` と `BETTER_AUTH_URL`（サーバ自身の URL）を渡し、`.env.local` の値に左右されないようにします。本番ビルドは試行回数の制限が有効で、接続元の IP が分からない要求を全員で 1 つの枠に入れるため、幅ごとに `x-forwarded-for` を変えて枠を分けます（`playwright.config.ts`・`e2e/constants.ts`）
- **実際の Stripe に通信する 1 本**（`@stripe`）だけは、`STRIPE_SECRET_KEY`（テストモードのキー）と `E2E_STRIPE=1` の**両方**があるときだけ動き、無ければ skip になります。サーバが Checkout Session を作り、`https://checkout.stripe.com/…` へ遷移するところまでで、Stripe の画面には何もしません。CI にはキーを置かないので skip です

  ```bash
  E2E_STRIPE=1 STRIPE_SECRET_KEY=sk_test_xxxx npx playwright test --grep @stripe
  ```

- 商品の画像（picsum）は 1×1 の PNG に差し替え、外には出ません
- テストの出力に `Error: Internal: NoFallbackError` と出ることがあります。存在しない商品（`/product/999`）が 404 になるときに Next 16.0.8 が内部で出すログで、404 が返っていれば異常ではありません
- 失敗したテストの調査用に、HTML レポート（`playwright-report/`）・スクリーンショット・retry 時の trace が `test-results/` に出ます（git には入れません）

`e2e/` の構成は[ディレクトリ構成](structure.md#ディレクトリ構成)のとおりです。localStorage の形（カート）は `e2e/fixtures/storage.ts` の 1 か所だけが知っていて（注文とログイン状態は localStorage に持たないので、seed しません）、期待値（件数・商品名・金額）はカタログから組みます。
