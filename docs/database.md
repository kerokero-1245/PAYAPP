# データベース

注文と、認証の利用者・セッションをサーバに置きます。**決済の確認 API（`/api/checkout/session`）・Stripe の Webhook・GraphQL の `orderBySession` が、`orders` / `order_items` / `stripe_events` を読み書きします**（どれも `fulfillCheckout` を通ります）。商品ページ・一覧・カートは DB を読みません。注文履歴 `/orders` と GraphQL の `myOrders`・`order` は、ログイン中の利用者の注文だけを読みます（`lib/order-history.ts`。書くのは `fulfillCheckout` だけです）。表・制約・マイグレーション・seed・テスト用の DB・CI の検査を入れてあります。

- **Drizzle ORM**: 表と制約は `lib/db/schema.ts` が正本です。`npm run db:generate`（`drizzle-kit generate`）が SQL のマイグレーションを `drizzle/` に出すので、**生成物もコミット**します。`drizzle-kit push` は使いません（履歴が残らないため）。
- **本番は Neon、ローカルとテストは PGlite**: Neon は Postgres で、`@neondatabase/serverless` の Pool（WebSocket 越し）で繋ぐのでトランザクションが使えます。PGlite は Postgres を WASM で同じプロセスの中に立てるもので、docker も Neon のアカウントもネットも要りません。どちらに繋ぐかを決めるのは `lib/db/connect.ts` の `resolveDbTarget` の 1 か所だけで、`DATABASE_URL` があれば Neon、無ければ PGlite（既定は `.pglite/` に保存。`PGLITE_DATA_DIR` で変えられます）です。**本番（`NODE_ENV=production`）で `DATABASE_URL` が無いときは例外にします**（PGlite のファイルに黙って切り替えると、Vercel では書き込めず、書けたとしても消える DB に注文を置くことになるため）。本番ビルドをローカルで動かすとき（`next start`・E2E）は、`PGLITE_DATA_DIR` で PGlite を使うと明示します（Vercel（`VERCEL=1`）では `PGLITE_DATA_DIR` を無視し、`DATABASE_URL` が無ければ例外にします）。
- 商品の正本は `lib/catalog.ts` のままです。`products` 表は `npm run db:seed` がカタログから作る写しで、注文の明細の外部キーと在庫のためにあります（商品ページは DB を読まないので、ビルドに DB は要りません）。

## ローカルで動かす（Neon なし）

```bash
npm run db:migrate   # .pglite/ に PGlite のデータベースを作り、マイグレーションを当てる（初回は初期化で数秒かかります）
npm run db:seed      # カタログの商品を products に入れる（2 回目からは 0 件。在庫は上書きしません）
```

PGlite のファイルを開けるのは同時に 1 プロセスだけです。ほかのプロセス（dev サーバなど）が開いている間は `db:migrate` / `db:seed` を打たないでください。

決済の確認が注文を DB に書くので、`npm run dev` の前に `npm run db:migrate` と `npm run db:seed` を打っておきます。`products` に商品が無いと、注文の明細が外部キー（`order_items.product_id`）で失敗し、成功ページは「決済の確認が取れていません」になります（半端な注文は残らないので、seed を打ってから「もう一度確認する」で確定できます）。

## Neon に繋ぐ

Neon の開発用ブランチの接続文字列を、`.env.local` の `DATABASE_URL`（プール経由）と `DATABASE_URL_UNPOOLED`（直結）に置き、同じ `npm run db:migrate` → `npm run db:seed` を打ちます（`drizzle-kit` と seed は `.env.local` を自分で読みます）。Neon のドライバは WebSocket のプロキシ越しに Neon へ繋ぐものなので、素の Postgres（docker の postgres など）には繋がりません。

## 表と制約

| 表              | 主な列                                                                                                                                            | 制約                                                                                                                                                                                                                                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `products`      | `id`（カタログの id）・`price`（税込の円）・`stock`（null = 在庫を管理しない）・`updated_at`                                                      | 主キー `id` / `price >= 0` / `stock >= 0`                                                                                                                                                                                                                                                                |
| `orders`        | `id`（uuid）・`order_no`（画面に出す番号）・`user_id`（null = ゲスト）・`stripe_session_id`・`status`・`total`・`paid_at`・`created_at`           | 主キー `id` / `order_no` と `stripe_session_id` は一意 / `total >= 0` / `status` は `paid`・`pending`・`failed` のどれか / `user_id` → `user`（利用者を消しても注文は残り、`user_id` だけ null になる）/ `user_id` に索引 `orders_user_id_idx`（注文履歴の絞り込みと、利用者を消すときの付け替えのため） |
| `order_items`   | `order_id`・`product_id`・`name` と `unit_price`（購入した時点の写し）・`quantity`                                                                | 主キー (`order_id`, `product_id`) / `quantity` は `lib/cart.ts` の `MIN_QUANTITY`〜`MAX_QUANTITY`（1〜99）/ `unit_price >= 0` / `order_id` → `orders`（注文を消すと明細も消える）/ `product_id` → `products`（売れた商品は消せない）                                                                     |
| `stripe_events` | `id`（`evt_...`）・`processed_at`                                                                                                                 | 主キー `id`（同じ Webhook イベントを 2 回処理しないための一意制約）                                                                                                                                                                                                                                      |
| `user`          | `id`・`name`・`email`・`email_verified`・`image`・`created_at`・`updated_at`                                                                      | 主キー `id` / `email` は一意（Better Auth が小文字にして保存する）                                                                                                                                                                                                                                       |
| `session`       | `id`・`token`・`expires_at`・`user_id`・`ip_address`・`user_agent`・`created_at`・`updated_at`                                                    | 主キー `id` / `token` は一意 / `user_id` → `user`（利用者を消すとセッションも消える）                                                                                                                                                                                                                    |
| `account`       | `id`・`account_id`・`provider_id`・`user_id`・`password`（scrypt のハッシュ）・外部サービスのトークン（今は使わない）・`created_at`・`updated_at` | 主キー `id` / `user_id` → `user`（利用者を消すと口座も消える）。メール + パスワードは `provider_id = 'credential'` の行                                                                                                                                                                                  |
| `verification`  | `id`・`identifier`・`value`・`expires_at`・`created_at`・`updated_at`                                                                             | 主キー `id`。メール確認・再設定の一時的な値の表（今は使わない。Better Auth が要求する）                                                                                                                                                                                                                  |

認証の 4 つの表は Better Auth の CLI（`npx auth@1.7.6 generate --adapter drizzle --dialect postgresql`）の出力を取り込んだもので、列の名前（`emailVerified` など）は Better Auth のフィールド名のままです。変えたのは時刻の列だけ（生成物は `timestamp`、このリポジトリは `timestamptz`）。`role` 列は管理画面の段まで持ちません。認証の表を書くのは Better Auth（`lib/auth/`）だけです。

## 注文の確定（`fulfillCheckout`）

- **注文を書くのは `lib/fulfillment.ts` の `fulfillCheckout` だけ**です（Webhook・決済確認 API・GraphQL はこれを呼ぶだけで、`orders` を直接書きません）。DB と Stripe は引数で受けます。
- 流れ: ① `stripe_session_id` で DB を探し、あればそれを返す（Stripe を呼ばない）→ ② Stripe から Checkout Session を取り直し、`payment_status` が `paid` でなければ何もしない。`paid` でも、`amount_total`・通貨（`jpy`）が metadata とカタログから作った合計と合わなければ、注文を作らない（構造化ログ `fulfillment.payment-mismatch`。Webhook は 422）→ ③ 1 つのトランザクションで `orders`（`ON CONFLICT (stripe_session_id) DO NOTHING`）・`order_items`・処理済みの Webhook イベントを書き、DB の注文を読み戻して返す。
- 注文の中身は既存の `orderFromSession`（metadata の id と数量 + カタログ）です。名前と単価は購入した時点の値を `order_items` に写すので、あとでカタログが変わっても注文は変わりません。画像とカテゴリは表示のためにカタログから引きます。明細は商品 id の順で返します（DB は並びを持たないため）。
- 注文番号 `order_no` は `ORD-` と 10 文字の乱数（50 ビット）です。万一重なれば一意制約が INSERT を失敗させ、確定は失敗して再送や再確認でやり直せます（別の注文として握りつぶしません）。持ち主 `user_id` は、ログイン中に買った決済の `client_reference_id`（`user.id`）が実在する利用者のときだけ入ります（無い・実在しない・不正な値はゲスト = null。支払い済みの注文を失わないため）。

## 注文履歴の読み取り（`lib/order-history.ts`）

- 注文を **読む** のは `listOrdersByUser`（利用者の注文を新しい順に 1 ページ）・`findOrderOfUser`（番号で 1 件）・`listAllOrdersByUser`（`/orders` 用に、ページをたどって上限 500 件まで集める）です。GraphQL の `myOrders`・`order` とページ `/orders` は、どれもこれを呼びます。DB は引数で受けます（テストは PGlite を差し込みます）。
- **持ち主の絞り込み（`orders.user_id = 利用者の id`）は、このファイルの where にだけ書きます。** ゲストの注文（`user_id` が null）と他の人の注文は、番号を知っていても返しません（`findOrderOfUser` は存在しない番号と同じ `undefined`）。
- 並びは `created_at` の降順で、同じなら `id` の降順です。ページ送りの `after` は前のページの最後の注文番号で、その注文の `created_at` と `id` を DB の中で引いて「それより古い」を選びます（持ち主の注文に限るので、他の人の注文の番号を渡しても何も返りません）。
- 明細の読み込みと `StoredOrder` への変換は、決済の確認と共通の `readStoredOrders`（`lib/fulfillment.ts`）です。明細の並びは商品 id の順（購入順の列は持ちません）。
- 日付は日本時間で整えます（`lib/format.ts` の `formatDate`。サーバが UTC で動いても、日本時間の早朝の注文が前の日にならないように）。

## 環境変数（データベースと Webhook）

| 変数                    | 用途                       | Production                                                                | Preview                                                                                                  | Development（.env.local）                | CI                                                 |
| ----------------------- | -------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------- | -------------------------------------------------- |
| `DATABASE_URL`          | 実行時の接続（プール経由） | Neon の本番ブランチ                                                       | Preview 用の DB（Neon のプレビューブランチか開発ブランチ）。**本番の値は入れない**。置かなければ DB なし | Neon の開発ブランチ                      | テストは PGlite なので不要。移行ジョブだけ Secrets |
| `DATABASE_URL_UNPOOLED` | マイグレーション用の直結   | 本番ブランチの直結。Vercel には置かない（手元の `db:migrate` だけが使う） | Vercel には置かない                                                                                      | 同上                                     | 移行ジョブの Secrets                               |
| `STRIPE_WEBHOOK_SECRET` | Webhook の署名検証         | 本番 URL に登録したエンドポイントの秘密                                   | 置かない（プレビューは成功ページの経路で確定する）                                                       | `stripe listen` の秘密（CLI を入れたら） | テストはダミー（E2E は空）                         |

- `DATABASE_URL` と `DATABASE_URL_UNPOOLED` がどちらも未設定なら、開発・テストではローカルの PGlite です（本番では例外）。Vercel の Neon 連携が実際に入れる変数名は、連携したあとの Vercel の画面で確かめて、違えばこの表を直してください。
- CI の列の「移行ジョブ」は、本番の DB へ自動で当てるジョブです（まだありません。Neon を用意したら足します）。今の CI は Secrets を使わず、`services: postgres` の Postgres に当てて確かめるだけです。

## マイグレーションの運用

- 変更は「足す → 使う → 消す」の 3 段に分けます。1 つの PR で列を消して、同時にその列を使うのをやめる変更はしません（Vercel のデプロイとマイグレーションの順番は保証されないため）。
- CI（`.github/workflows/ci.yml`）は Secrets を使わずに 3 つを確かめます。(1) `npm test` が PGlite に全マイグレーションを当てて、制約と seed を検査する。(2) `db-migrations-fresh` ジョブが `drizzle-kit generate` を打って `drizzle/` に差分が出ない（スキーマを変えて generate を忘れていない）ことを確かめる。(3) `db-migrate-postgres` ジョブが、`services: postgres`（17 と 18）の本物の Postgres に `drizzle-kit migrate` を 2 回当てる。
- 本番の DB への適用は、`main` で CI が通ったあとに走るジョブとして足す予定です。Vercel のビルドコマンドには入れません（プレビューのビルドが本番の DB に当たる事故を避けるため）。それまでは `DATABASE_URL_UNPOOLED` を指定して手元で `npm run db:migrate` と `npm run db:seed` を打ちます（手順は「公開（Vercel）」）。
