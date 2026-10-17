# 公開（Vercel）

Vercel の GitHub 連携でデプロイします。`vercel.json` は置いていません（Next.js は Vercel が自動で認識し、画像の許可ドメインは `next.config.ts` にあるため、追加の設定が要りません）。プランは Hobby（無料）で、決済は Stripe のテストモードだけを使います。

上から順に進めます（DB を先に用意し、環境変数と Webhook を置いてから、`main` への push で今のコードをデプロイします）。

1. **Neon** でプロジェクトを作ります（最初からあるブランチ `main` を本番のブランチにします）。ダッシュボードの **Connect** で接続文字列を 2 つ控えます。**Connection pooling をオン**にしたもの（ホスト名に `-pooler` が付く。プール経由 = `DATABASE_URL`）と、**オフ**にしたもの（`-pooler` が無い。直結 = `DATABASE_URL_UNPOOLED`）です。
2. **認証を入れたコードをデプロイする前に**、手元から本番の DB へマイグレーションと seed を当てます（`products` に商品が無いと、注文の明細が外部キーで失敗し、決済の確認が通りません。認証の表 `user` `session` `account` `verification` と `orders.user_id` の外部キーも、このマイグレーションで作られます。無いと、登録とログインが 500 になります。注文履歴の絞り込みを支える索引 `orders_user_id_idx` も、このマイグレーションで作られます。無くても動きますが、注文が増えると履歴が遅くなります）。このリポジトリで、Node 24（`.nvmrc`）で打ちます（[セットアップ](setup.md#セットアップ)）。接続文字列は `.env.local` に書かず、そのコマンドだけに環境変数で渡します（`.env.local` に書くと、`npm run dev` も本番の DB を読み書きします）。

   ```bash
   DATABASE_URL_UNPOOLED='<Neon の直結の接続文字列>' npm run db:migrate
   DATABASE_URL='<Neon のプール経由の接続文字列>' npm run db:seed
   ```

   `db:migrate` が `migrations applied successfully!`、`db:seed` が `Neon（DATABASE_URL）の products を … 件追加・更新しました` と出れば当たっています（`PGlite` と出たら、接続文字列が渡っていません）。`drizzle/` の `0000`〜`0002` が順に当たり、もう一度打っても、まだ当たっていないものだけが当たります。

3. Vercel にログインし、**Add New… → Project** でこの GitHub リポジトリを **Import** します（Framework Preset は Next.js のまま、Build Command・Output Directory も既定のまま）。Import すると、その時点の `main` が 1 回デプロイされ、本番の URL（`https://<プロジェクト名>.vercel.app`。プロジェクトの **Domains** に出ます）が決まります。
4. **Settings → Environment Variables** に次を設定します（名前は[環境変数](setup.md#環境変数)の表と同じです）。

   | 変数                    | 設定する環境        | 値                                                                                                                                                       |
   | ----------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | `STRIPE_SECRET_KEY`     | Production・Preview | Stripe のテストモードのキー `sk_test_...`（Stripe ダッシュボードのテストモードの API キー https://dashboard.stripe.com/test/apikeys のシークレットキー） |
   | `NEXT_PUBLIC_BASE_URL`  | Production だけ     | 本番の URL（例: `https://<プロジェクト名>.vercel.app`）                                                                                                  |
   | `DATABASE_URL`          | Production          | Neon の本番ブランチの接続文字列（プール経由）。**必須**（無いと注文を扱う API が失敗します）                                                             |
   | `DATABASE_URL`          | Preview             | **本番の接続文字列は入れません。** Preview 用の DB（Neon のプレビューまたは開発ブランチ）の接続文字列か、置かない（DB なし）                             |
   | `STRIPE_WEBHOOK_SECRET` | Production だけ     | Stripe の Webhook の署名シークレット `whsec_...`（[Webhook を登録する](#webhook-を登録する本番テストモード)で手に入ります）                              |
   | `BETTER_AUTH_SECRET`    | Production・Preview | 認証の鍵。32 文字以上のランダムな値（`openssl rand -base64 32`）。**Production と Preview で別の値**にします                                             |
   | `BETTER_AUTH_URL`       | Production だけ     | 本番の URL（例: `https://<プロジェクト名>.vercel.app`。パスは付けません）                                                                                |
   - `NEXT_PUBLIC_BASE_URL` を Preview にも入れると、プレビューで決済したときの戻り先が本番になります。Preview では未設定にしておけば、戻り先はそのプレビューの URL になります。
   - `NEXT_PUBLIC_` で始まる値はビルド時に埋め込まれるので、変えたら再デプロイしてください。
   - `DATABASE_URL` は **Production では必須**です（`NODE_ENV=production` は Vercel の Production と Preview の両方）。無いと、決済の確認 API・Webhook・GraphQL の `orderBySession` が DB に繋げず失敗し、成功ページは「決済の確認が取れていません」になります。置き場所は「データベース」の環境変数の表です。
   - **Preview には本番の `DATABASE_URL` を入れません。** 入れると、プレビューのビルド（どのブランチでも）が本番の利用者・注文を直接読み書きします。Preview 用の DB（Neon のプレビューブランチか開発ブランチ。マイグレーションと seed は別に当てます）を置くか、置かずに DB なしにします。DB なしの Preview でも、商品の閲覧・カート・決済ページへの移動は動きます（`NODE_ENV=production` は Preview も同じなので、DB が無ければ DB に触れる処理は例外で失敗します: 決済の確認（成功ページは「決済の確認が取れていません」）・登録・ログイン・注文履歴）。
   - `STRIPE_WEBHOOK_SECRET` は Production だけに置きます。**Webhook は本番の URL にだけ登録します**（プレビューの URL やローカルは登録しません）。Preview では置かず、成功ページの確認で注文を確定します。Stripe はアカウント（とモード）で起きたイベントを、登録済みのエンドポイントすべてに送るので、Preview やローカルで払ったテスト決済のイベントも本番の Webhook に届き、本番は同じ `STRIPE_SECRET_KEY` で取り直せたその決済を、本番の DB にゲストの注文（持ち主の利用者が本番に居ないため）として確定します。避けたいときは、Preview とローカルには本番と別の Stripe アカウント（またはサンドボックス）のテストキーを使います。
   - `BETTER_AUTH_SECRET` は **Production と Preview の両方に必須**です（`NODE_ENV=production` は両方）。無い・32 文字未満だと、認証 API（`/api/auth/*`）が 500 になり、ログイン・登録ができません。セッションの cookie を持つ人（それまでにログインしたことのある人）は、/login・/signup・/account・/orders も「ただいま表示できません」になり、購入手続き（GraphQL の `createCheckoutSession`・`POST /checkout`）も失敗します。cookie を持たない人の閲覧と購入は動きます。
   - `BETTER_AUTH_URL` は **Production だけ**に置きます。Preview に置くと（Vercel の既定の「全環境」で作ると）、プレビューの URL からのログインが「信用できない送信元」として 403 で断られます。置かなければ、そのプレビュー自身の URL を信用します。
   - 変数を作るときの既定は全環境（Production・Preview・Development）です。表の「設定する環境」に無い環境のチェックは外します。表に無い変数（`DATABASE_URL_UNPOOLED`・`PGLITE_DATA_DIR`）は Vercel に置きません。

5. **Settings → Build and Deployment → Node.js Version** を **24.x** にします（ローカルと CI に合わせる）。
6. Stripe（テストモード）の Webhook を本番の URL に登録し、署名シークレットを Production の `STRIPE_WEBHOOK_SECRET` に置きます（[Webhook を登録する](#webhook-を登録する本番テストモード)の 1〜3）。
7. デプロイします。`main` への push で本番に、プルリクエストではプレビューに自動でデプロイされます。環境変数は、変えたあとのデプロイから効きます（push をしないときは **Deployments** の最新の本番で **Redeploy**）。
8. デプロイのあとに確かめます（`<本番>` は本番のドメイン）。
   - `curl -s -o /dev/null -w '%{http_code}\n' 'https://<本番>/api/graphql?query=%7B__typename%7D'` が `405`（本番では GraphQL の `GET` を断ります）。
   - `curl -sI 'https://<本番>/login'` の応答ヘッダーに `X-Frame-Options: DENY` があります。
   - `/signup` の表示名の欄に 51 文字を貼っても 50 文字で止まります（サーバも 51 文字以上を 400 で断ります。[認証](auth.md#認証)の入力の長さの上限）。
   - ログインの試行回数の制限が、送る側の `x-real-ip` で逃げられません。`x-real-ip` を毎回変えて誤ったパスワードのログインを 4 回続けると、4 回目が `429` です（Vercel が `x-real-ip` を接続元の IP に付け直しているため）。DB のある環境（本番か、DB を置いた Preview）で確かめます。DB なしの Preview では認証が 500 になり、確かめられません。

     ```bash
     for i in 1 2 3 4; do curl -s -o /dev/null -w '%{http_code}\n' -X POST 'https://<本番>/api/auth/sign-in/email' -H 'Content-Type: application/json' -H 'Origin: https://<本番>' -H "x-real-ip: 203.0.113.$i" -d '{"email":"nobody@example.com","password":"wrong-password-0000"}'; done
     ```

   - 新規登録 → テストカード `4242 4242 4242 4242` で購入 → 成功ページの注文番号（`ORD-…`）が `/orders` にも出ます。Webhook の確かめ方は[Webhook を登録する](#webhook-を登録する本番テストモード)の 4 です。

### Webhook を登録する（本番・テストモード）

Webhook は、ブラウザを閉じたり回線が切れたりして成功ページに戻れなかった決済も、注文として残すためのものです（成功ページの確認だけでも注文は確定します）。Vercel にプロジェクトを作って本番の URL が決まったら（上の 3）、1 回だけ登録します（本番の URL だけ。プレビューの URL やローカルは登録しません）。

1. Stripe ダッシュボードを **テストモード** にして、**開発者 → Webhook → エンドポイントを追加**（「+ エンドポイントを追加」）を開きます。
2. **エンドポイント URL** に `https://<本番のドメイン>/api/stripe/webhook`、**イベント** に `checkout.session.completed` と `checkout.session.async_payment_succeeded` の 2 つだけを選んで作成します。
3. 作成したエンドポイントの **署名シークレット**（`whsec_...`）を表示して、Vercel の **Production** の環境変数 `STRIPE_WEBHOOK_SECRET` に置きます。次のデプロイ（`main` への push か **Redeploy**）から効きます。
4. 今のコードがデプロイされたあとに、テストカード（`4242 4242 4242 4242`）で 1 回購入します。ダッシュボードのエンドポイントの配信が `200` になり、Neon の `orders` に 1 件入っていれば完了です。署名のヘッダーが無い・合わない送信は `400`、`STRIPE_WEBHOOK_SECRET` が未設定なら `503` で、どちらも DB を変えません。

ローカルで Webhook を試すには Stripe CLI の `stripe listen --forward-to localhost:3000/api/stripe/webhook` が要ります（このリポジトリには入れていません）。CLI が無くても、成功ページの確認で注文は確定します。

`main` への push とプルリクエストでは、GitHub Actions（`.github/workflows/ci.yml`）が lint・型の検査・平坦な CSS の検査・GraphQL の生成物の鮮度・テスト・本番ビルドを Node 24（`.nvmrc` の版）で実行します。ビルドは Stripe のキーが無くても通るので（キーはリクエスト時にだけ読みます）、CI には環境変数を設定していません。別の job `e2e` が、ブラウザ（Playwright の Chromium）で画面を操作する E2E も回します（Stripe には通信せず、secrets も使いません）。
