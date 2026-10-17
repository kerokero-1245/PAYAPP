# セットアップ

> **Node.js 24 を使ってください**（版の正本は `.nvmrc` の 24.21.0。CI も同じ版で回します）。graphql 17 と、テスト・検査スクリプト（どちらも TypeScript）を型消去でそのまま実行するために **22.18 以上** が必要です。

```bash
# 依存インストール
npm install

# 開発サーバー（注文と認証が DB を使うので、初回の前に docs/database.md の「データベース」の db:migrate と db:seed を打つ）
npm run dev            # http://localhost:3000

# 本番ビルド & 起動
npm run build
npm run start

# テスト（決済まわりの純粋な関数・注文の確定・Webhook・GraphQL API・認証（登録・ログイン・セッション・cookie・試行回数の制限・送信元の検査）・お問い合わせの検証・平坦な CSS の検査・DB のスキーマとマイグレーション。Stripe にも外部の DB にも通信しません）
npm test               # node --test tests/*.test.ts（Node 24 で確認）

# 型の検査（next typegen が Next のルートの型 PageProps・LayoutProps などを作ってから tsc を回す。CI でも実行）
npx next typegen
npm run typecheck

# GraphQL の型を SDL から作り直す（lib/graphql/sdl.ts を変えたら実行してコミット）
npm run codegen

# 平坦な CSS の検査（docs/css.md の「デザインの書き方」）
npm run check:css

# E2E テスト（Playwright。初回だけブラウザを入れる。詳しくは docs/e2e.md の「E2E テスト」）
npx playwright install chromium
npm run test:e2e       # next build してから playwright test

# データベース（docs/database.md の「データベース」。DATABASE_URL が無ければローカルの PGlite）
npm run db:generate    # lib/db/schema.ts を変えたら、マイグレーションの SQL を drizzle/ に出してコミット
npm run db:migrate     # マイグレーションを当てる
npm run db:seed        # カタログの商品を products に入れる（何度打っても同じ）
```

# 環境変数

`.env.example` を `.env.local` にコピーして設定してください。

| 変数                    | 必須 / 任意                               | 用途                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `STRIPE_SECRET_KEY`     | **必須**（決済を使う場合）                | Checkout Session の作成（`/api/graphql`・`/checkout`）と決済確認（`/api/checkout/session`）。テストモードのキー `sk_test_...` を使ってください                                                                                                                                                                                                                                              |
| `NEXT_PUBLIC_BASE_URL`  | 任意（**本番では設定してください**）      | 決済後の戻り先 URL と、OGP 画像を絶対 URL にする基準。未設定・不正な値のときは、戻り先はリクエスト URL の origin、OGP は Next.js の既定（ローカルでは `http://localhost:<port>`、Vercel では本番 URL）になります                                                                                                                                                                            |
| `STRIPE_WEBHOOK_SECRET` | 本番では **必須**（Webhook を受ける場合） | `POST /api/stripe/webhook` が、Stripe から届いたことを検証する署名の秘密（`whsec_...`）。未設定のあいだ Webhook は 503 を返して何もしません（注文は成功ページの確認でも確定します）。登録の手順は[公開（Vercel）](deploy.md#公開vercel)                                                                                                                                                     |
| `DATABASE_URL`          | **本番では必須**。開発は任意              | 実行時の接続（プール経由）。Neon の接続文字列。未設定なら、開発・テストではローカルの PGlite（`.pglite/`）に繋ぎます。**本番（`NODE_ENV=production`）で未設定だと例外**です。[データベース](database.md#データベース)                                                                                                                                                                       |
| `DATABASE_URL_UNPOOLED` | 任意                                      | マイグレーション用の直結（プールを通さない）。未設定なら `DATABASE_URL` を使います                                                                                                                                                                                                                                                                                                          |
| `PGLITE_DATA_DIR`       | 任意                                      | PGlite の保存先のディレクトリ（既定は `.pglite`）。`DATABASE_URL` が無いときだけ効きます。本番ビルド（`next start`・E2E）で PGlite を使うという明示にもなります。**E2E とローカルの `next start` のための明示**で、Vercel（`VERCEL=1`）では無視します（置いても使われず、`DATABASE_URL` が無ければ例外です。関数の実体ごとに消える DB に注文を書かないため）。Vercel には置かないでください |
| `BETTER_AUTH_SECRET`    | 本番では **必須**。開発は任意             | 認証（Better Auth）のセッションの署名と暗号化の鍵。**本番（`NODE_ENV=production`。Vercel の Production と Preview を含む）では、32 文字以上のランダムな値が必須**で、無い・短い・開発用の固定の値だと認証 API は 500 で失敗します（黙って弱い鍵では動かしません）。作り方: `openssl rand -base64 32`。開発では未設定で構いません（開発用の固定の値を使います）                              |
| `BETTER_AUTH_URL`       | 任意（**本番では設定してください**）      | 認証の基準の URL（オリジンだけ。パスは付けません）。ログイン・登録の送信元（Origin）の検査が信用するオリジン。**Production にだけ**本番の URL を置き、Preview には置きません（置くとプレビューの URL からのログインが 403 で断られます）。未設定なら、リクエストの URL のオリジンを使います                                                                                                 |

```
STRIPE_SECRET_KEY=sk_test_xxxx
# STRIPE_WEBHOOK_SECRET=whsec_xxxx
# NEXT_PUBLIC_BASE_URL=https://your-domain.example
# DATABASE_URL=postgres://user:password@ep-xxxx-pooler.region.aws.neon.tech/neondb?sslmode=require
# BETTER_AUTH_SECRET=（openssl rand -base64 32 で作った 32 文字以上の値）
# BETTER_AUTH_URL=https://your-domain.example
```

コードはほかに `NODE_ENV`（`next build` / `next start` が付ける）・`VERCEL`（Vercel が `1` を付ける）・`CI`（GitHub Actions が付ける）を読みますが、どれも自分では設定しません。E2E だけが読む `E2E_STRIPE`・`PW_CHANNEL` は[E2E テスト（Playwright）](e2e.md#e2e-テストplaywright)にあります。
