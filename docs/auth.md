# 認証

メールアドレスとパスワードで新規登録・ログインします（[Better Auth](https://www.better-auth.com/) 1.7.6。利用者・セッション・口座は DB に置きます）。**メール確認とパスワードの再設定は付けていません**（メールを送る仕組みを持たないため。忘れた場合は別のメールアドレスで新規登録します。画面にも書いてあります）。ログインしなくても購入できます（ゲストの注文は持ち主なし）。

- **画面**: 新規登録 `/signup`・ログイン `/login`・アカウント `/account`（ログアウトもここ）。`/account` と `/orders` は未ログインだと `/login?next=%2Faccount`・`/login?next=%2Forders` へ転送し、ログインしたら元のページへ戻します。ヘッダーのアカウントのリンクと表示名は、サーバのセッション（`GET /api/auth/get-session`）から出します（ヘッダーは全ページにあるので、ページを読み込むたびに 1 回呼びます。アプリの中の遷移では呼ばず、タブに戻ったとき・ログイン／ログアウトしたときに取り直します。セッションの cookie が無ければ DB には触れず `null` を返します）。ブラウザの localStorage にはログイン状態を持ちません。
- **API**: 登録・ログイン・ログアウトは GraphQL の Mutation ではなく、Better Auth の `/api/auth/*`（`app/api/auth/[...all]/route.ts`）が受けます（cookie の発行と削除・試行回数の制限・送信元（Origin）の検査をまとめて持っているため）。GraphQL は `viewer`（ログイン中の利用者の `id` `email` `name`。未ログインは `null`）を読むだけです。本文を持つ要求は **16KB まで**（超えたら 413。本体は `lib/auth/handler.ts`）。公開している口の一覧は[公開している口](#公開している口apiauth)。
- **入力の長さの上限**: 表示名 50 文字・メールアドレス 254 文字・画像の URL 2048 文字（超えたら 400 `NAME_TOO_LONG` / `EMAIL_TOO_LONG` / `IMAGE_TOO_LONG`。登録と `update-user` の両方で、Better Auth の `databaseHooks` が DB に書く前に検査します）。`session.user_agent` に保存する User-Agent は 256 文字で切ります。値は `lib/auth/constants.ts` で、登録フォームの入力欄にも同じ値を付けています。
- **ログ**: Better Auth のログの出し先を差し替え（`lib/auth/log.ts`）、先頭 1 行と例外の名前・SQLSTATE だけを 1 行の JSON（`lib/log.ts`）で出します。DB の失敗でも、SQL の引数（パスワードのハッシュ・メールアドレス）はログに残りません。
- **セッション**: DB の `session` 表に置き、cookie には署名つきの識別子だけを持たせます（`better-auth.session_token`。HttpOnly・SameSite=Lax・Path=/、https の URL では Secure）。有効期間は 7 日で、最後の更新から 1 日以上たって使うと延びます（使い続ける限り切れません）。ログインのたびに新しい識別子を作ります。
- **パスワード**: 8〜128 文字。Node の scrypt でハッシュにして `account.password` に入れます（平文は DB のどの表にも残りません。テストが全部の表を探して確かめています）。ログインの失敗は「メールアドレスかパスワードが違います」の 1 文で、メールアドレスの有無を言い分けません。
- **ログイン後の行き先（`?next=`）**: URL に書ける値（誰でも作れる）なので、そのまま移動先にしません。自サイトの中のパスだけを通す純粋な関数 `safeNextPath`（`lib/auth/next-path.ts`）を通し、`//evil.example`・`/\evil.example`・`https://…`・`javascript:` などは `/account` に落とします（短い文字列の総当たりのテストつき）。
- **購入と持ち主**: ログイン中に購入手続きへ進むと、サーバがセッションから引いた利用者の `id` を Checkout Session の `client_reference_id` に付けます（リクエストの本文の値は使いません）。注文を確定する `fulfillCheckout` が、それを `orders.user_id` に入れます（Webhook と成功ページのどちらから確定しても同じです。付いていない決済・実在しない利用者はゲストの注文として確定し、支払い済みの注文を失いません）。持ち主ごとの注文は、注文履歴 `/orders` と GraphQL の `myOrders` が読みます（`lib/order-history.ts`）。
- **ファイル**: `lib/auth/config.ts`（設定。DB は引数で受ける）・`server.ts`（サーバ専用。`getAuth` と、ページが使う `getViewer`）・`viewer.ts`（セッション → 利用者）・`next-path.ts`・`messages.ts`（失敗の文）・`constants.ts`（パスワードの長さ・セッションの期限）・`client.ts`（ブラウザ用）。認証の表は `lib/db/schema.ts`（Better Auth の CLI の出力が正本。`tests/auth.test.ts` が Better Auth の要求との食い違いを検出します）。

### 公開している口（`/api/auth/*`）

`app/api/auth/[...all]/route.ts` は Better Auth の口をすべて同じ入口で受けます。確かめた結果（Better Auth 1.7.6、このリポジトリの設定）です。ここに無い口は、そもそも登録されていません。

| 口                                                                                                         | メソッド              | 状態                                                                                                          |
| ---------------------------------------------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------- |
| `sign-up/email` `sign-in/email` `sign-out` `get-session`                                                   | POST・POST・POST・GET | 画面が使う。`get-session` はヘッダーが読み込みのたびに呼ぶ（cookie が無ければ DB に触れず `null`）            |
| `update-user`                                                                                              | POST                  | ログイン中の本人だけ。表示名・画像を書き換える（長さの上限つき）。画面には出していない                        |
| `change-password` `verify-password`                                                                        | POST                  | ログイン中の本人だけ。画面には出していない                                                                    |
| `list-sessions` `revoke-session` `revoke-sessions` `revoke-other-sessions`                                 | GET・POST             | ログイン中の本人だけ。`list-sessions` は自分のセッションの token・IP・User-Agent を返す。画面には出していない |
| `list-accounts` `account-info` `update-session`                                                            | GET・GET・POST        | ログイン中の本人だけ。画面には出していない                                                                    |
| `sign-in/social` `callback/:id` `link-social` `unlink-account` `refresh-token` `get-access-token`          |                       | 外部サービスのログインを設定していないので失敗する（404・400・302）                                           |
| `verify-email` `send-verification-email` `request-password-reset` `reset-password` `reset-password/:token` |                       | メール確認・再設定を付けていないので失敗する（400・401）                                                      |
| `change-email` `delete-user` `delete-user/callback`                                                        |                       | 無効（400・404）                                                                                              |
| `ok` `error`                                                                                               | GET                   | 動作の確認と Better Auth のエラー画面                                                                         |

「画面には出していない」口を閉じるには `disabledPaths`（Better Auth の設定）がありますが、今は閉じていません。使わない口が増えないよう、Better Auth を上げるときは `tests/auth-endpoints.test.ts`（口の一覧を固定）が落ちるので、この表を読み直してください。

### 既定値の採否

Better Auth 1.7.6 のコード（`node_modules`）で確かめた既定値と、そのまま採ったか、変えたかの一覧です。Better Auth を上げるときは、この表と `tests/auth.test.ts` を読み直してください。

| 項目                        | 値                                                                                                                                                                                                                                                                                                                                          | 採否                                           |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| cookie                      | `better-auth.session_token`（https では `__Secure-` 付き）。HttpOnly・SameSite=Lax・Path=/・Max-Age 7 日・Secure は https のとき。Domain は付けない                                                                                                                                                                                         | 採用                                           |
| セッションの期限            | 7 日。最後の更新から 1 日以上たって `/api/auth/get-session` を通ったときだけ、7 日先へ延ばして cookie も更新する。絶対の期限は無い                                                                                                                                                                                                          | 採用（`lib/auth/constants.ts` で明示して固定） |
| 期限を延ばす場所            | サーバコンポーネントと GraphQL からの確認では延ばさず（`disableRefresh`）、`/api/auth/get-session` だけが延ばす（DB の期限と cookie の期限を食い違わせないため）                                                                                                                                                                            | 変更                                           |
| 試行回数の制限              | 本番（`NODE_ENV=production`）だけ有効。同じ IP から、ログイン・登録は 10 秒に 3 回、そのほかは 10 秒に 100 回。超えると 429（正しいパスワードでも通さない）。IP は `x-real-ip`（Vercel が前段で付ける）を先に、無ければ `x-forwarded-for`（値 1 つのときだけ）で決める（`IP_ADDRESS_HEADERS`）。保存先はメモリ（Vercel では関数の実体ごと） | 採用（限界あり。下）                           |
| 送信元（Origin）の検査      | `BETTER_AUTH_URL`（無ければリクエスト自身）のオリジンだけを信用する。cookie 付きの POST は Origin を照合し、他のサイトからのフォーム送信（`Sec-Fetch-Site: cross-site`）は拒否する                                                                                                                                                          | 採用                                           |
| `BETTER_AUTH_URL`           | オリジンだけを受け付ける（パスが付くと Better Auth はそれを基準にして動かなくなる）。Preview には置かない                                                                                                                                                                                                                                   | 変更（検査を足した）                           |
| パスワード                  | 8〜128 文字・scrypt（N=16384・r=16・p=1）                                                                                                                                                                                                                                                                                                   | 採用                                           |
| メール確認・再設定          | なし。登録のあとはそのままログインする                                                                                                                                                                                                                                                                                                      | 付けない                                       |
| 登録の書き込み              | user・account・session を 1 つのトランザクションで作る（既定は別々。途中で失敗してもログインできない利用者を残さない）                                                                                                                                                                                                                      | 変更                                           |
| `BETTER_AUTH_SECRET`        | 本番では必須・32 文字以上。無い・短い・開発用の固定の値は例外（既定は警告だけ）                                                                                                                                                                                                                                                             | 変更                                           |
| 利用状況の送信（telemetry） | なし（既定でも無効。明示して切る）                                                                                                                                                                                                                                                                                                          | 採用                                           |

既知の限界（段 3 の後の敵対レビューで判断します）: 試行回数の制限はメモリなので、分散した試行は関数の実体ごとに通ります。セッションに絶対の期限が無く、メールアドレスの持ち主を確かめず、登録済みのメールアドレスが分かります（メール確認を使わないため）。scrypt のコストは固定です。`NODE_ENV=test` か環境変数 `TEST` があると Better Auth の Origin の検査が切れます（本番に置かないでください）。

### ローカルで動かす

```bash
npm run db:migrate   # 認証の表（user・session・account・verification）も作る
npm run dev          # /signup で登録 → /account
```

開発では `BETTER_AUTH_SECRET` も `BETTER_AUTH_URL` も未設定で動きます（開発用の固定の秘密と、リクエストの URL を使います）。本番ビルドを手元で動かす（`next start`）ときは、32 文字以上の `BETTER_AUTH_SECRET` が要ります。PGlite のファイルを開けるのは 1 プロセスだけなので、dev サーバが動いている間は `db:migrate` を打たないでください。
