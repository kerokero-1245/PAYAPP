# payapp（MAISON）の設計の決まりごと

このリポジトリでコードを足す・直すときの方針。見た目の書き方の細部は README の「デザインの書き方」を正本とし、ここには判断の基準と置き場だけを書く。

## この repo での適用

規則の全文は [作り方の規則](https://github.com/kerokero-1245/kerokero-1245/blob/main/DESIGN.md) にあります。ここには、このリポジトリで違うことだけを書きます。

### 例外（規則と違うこと）

- なし

### 固有の約束（このリポジトリだけの不変条件）

- **寄せ先**: 1 か所へ寄せるときの置き場は、トークン・部品クラス・部品・lib の定数や関数（[トークンと部品の置き場](#トークンと部品の置き場)）
- **JS で残すファイル**: ツールの設定（`eslint.config.mjs`・`postcss.config.mjs`）と、検査の見本 `tests/fixtures/flat-css/` だけ
- **型の検査**: `npx next typegen` で Next のルートの型を作ってから `npm run typecheck`
- **型の置き場**: 3 か所以上で使うドメインの型は `lib/types.ts`、1 ファイルだけで使う型はそのファイルに書く。`as` で要素を差し替える部品の props は `components/ui/polymorphic.ts` の `PolymorphicProps`。外から来る値（localStorage・リクエスト本文・Stripe の metadata・環境変数）を受ける関数は、引数を `unknown` で受けて中で絞る
- **Node 側の import**: `lib/`・`tests/`・`scripts/` は Node が型を剥がして直接読むので、相対パスに拡張子 `.ts` を付け、型だけの import は `import type` で書く（`@/` は使わない）。`app/`・`components/`・`store/` は Next が読むので `@/…` で拡張子なし。enum・namespace・コンストラクタの引数プロパティは使えない（`erasableSyntaxOnly`）
- **テスト**: Stripe は `getStripe` で差し込める形にして、テストでは偽の Stripe を渡す。画面の操作（導線）の E2E の書き方は [E2E（Playwright）](#e2eplaywright)
- **Route Handler は薄い配線だけにする**: `app/**/route.ts` は node --test から import できない（`@/` の別名と `server-only`）ので、中身を書くと配線の取り違え（持ち主を渡し忘れる・Webhook の秘密を別の変数から読む）がどのテストにも見えない。本体と、本物の依存の組み立てを lib に置き（`handleCheckoutRequest`・`createWebhookDeps`・`handleAuthRequest`・`verifyCheckoutSession`・`createGraphqlHandler`）、テストが同じ関数を呼ぶ
- **整形の対象外**: 生成物（`lib/graphql/__generated__`・`drizzle/`）・ロックファイル・`tests/fixtures/`・`docs/screenshots` は `.prettierignore` で対象外（整形すると生成物の鮮度の検査が落ちる）
- **平坦な CSS**: 1 クラス 1 役割の足し算で書き、結合子・入れ子・`!important` を使わない。詳しくは README の「デザインの書き方」。`npm run check:css` が検査し、`tests/flat-css.test.ts` が検査そのものを確かめる

### 記録の例

- 壊しにかかるレビューと修正の記録: [docs/review-evidence.md](docs/review-evidence.md)

## E2E（Playwright）

- **置き場**: `e2e/*.spec.ts`（1 ファイル 1 導線）、`e2e/fixtures/`（localStorage の形・Stripe のモック・外部画像・`test` の拡張）、`e2e/support/`（カタログから期待値を作る・画面を開く・ロケータ）、`e2e/constants.ts`（URL・ビューポート・session id）。`tests/` は `node --test` のグロブなので混ぜない。新規は TS で、`any` は使わない
- **ロケータ**: `getByRole` / `getByLabel` / 文言で取り、クラス名と DOM の構造には頼らない（部品クラスを改名しても落ちないのが正しい）。取れない部品には、見た目を変えずに `aria-label` を足す（例: ヘッダーのカート点数バッジ）
- **期待値**: 件数・商品名・金額はカタログ（`lib/catalog.ts`）から組み、テストに直書きしない。localStorage の形（cart）を知るのは `e2e/fixtures/storage.ts` だけで、seed は画面を開く前に `seedStorage` で入れる。注文はブラウザに持たないので seed しない（`readOrderKeys` で、注文を記録するキーが無いことを確かめる）
- **Stripe には通信しない**: Stripe に向かう通信（`createCheckoutSession`・決済確認）は既定で閉じてあり、テストが `page.route` でモックする。モックし忘れるとテストが落ちる。実通信は `@stripe` タグの 1 本だけで、`STRIPE_SECRET_KEY` と `E2E_STRIPE=1` の両方があるときだけ動く。CI には Stripe のキーを置かない
- **DB は専用の PGlite**: サーバ（`next start`）を立てる前に、`.pglite-e2e/` へ `db:migrate` と `db:seed` を順に当てる（`playwright.config.ts` の webServer。`PGLITE_DATA_DIR` で指定し、`DATABASE_URL` は空にして開発の Neon に繋がらないようにする）。決済の確認はモックするので、買う操作ではサーバの DB に注文は入らない。注文の確定そのもの（冪等・競合）は単体テスト（PGlite）の仕事で、E2E ではブラウザ側の結果（注文番号の表示・購入分だけカートから外れる・二重に外さない）を見る
- **認証は本物**: ログイン状態は localStorage ではなくサーバのセッションなので、seed せず、画面の操作（新規登録・ログイン）で作る。サーバは固定のダミーの `BETTER_AUTH_SECRET` と `BETTER_AUTH_URL` で起動し（`playwright.config.ts`。`.env.local` に左右されない）、利用者は E2E 専用の PGlite に残る（実行をまたぐので、メールアドレスは実行ごとに一意にする）。本番ビルドは試行回数の制限が有効で、IP が分からない要求を全員で 1 つの枠に入れるため、幅ごとに `x-forwarded-for` を変えて枠を分ける（`e2e/constants.ts` の `E2E_CLIENT_IPS`）。ログインの試行は 1 つのテストの中で 10 秒に 3 回以内に収める。本物の scrypt でパスワードを計算するので、auth の spec（と、DB の使えないサーバで画面を何度も開く db-unavailable.spec.ts）は、テストの制限時間と assertion の待ち時間を長くしてある（全 E2E を並列で回すと 1 本が 40 秒を超えることがあった。期待は変えない）
- **DB が使えない画面**: 同じビルドを別のポート（3211。`e2e/constants.ts` の `DB_DOWN_PORT`）でも立て、PGlite の保存先に作れないパス（`package.json/pglite-unavailable`）を渡す（`playwright.config.ts` の 2 つ目の webServer。準備する DB は無い）。DB に触れる要求は必ず失敗するので、セッションの cookie を持つ人の `/orders` `/account` `/login` `/signup` が「ただいま表示できません」（`app/error.tsx`）になること、cookie を持たない人の閲覧・カート・ログイン画面が動くことを `e2e/db-unavailable.spec.ts` が確かめる
- **注文履歴は seed で見せる**: 買う操作は E2E で DB に届かないので、`/orders` が見せる注文は `e2e/seed.ts` が、サーバを立てる前に入れる（本物の Better Auth で登録した利用者に注文 2 件、ゲストの注文 1 件。中身は `e2e/support/history.ts`）。seed は毎回、自分の利用者と注文だけを消して作り直す（カタログの価格が変わっても期待がずれない）。E2E 専用の PGlite（`PGLITE_DATA_DIR=.pglite-e2e`）以外には書かない（取り違えたら止まる）。`e2e/orders.spec.ts` は、未ログインの転送・新規登録直後の空の表示・注文を持つ利用者の履歴（新しい順・ゲストの注文は出ない）・成功ページの注文番号との一致・別の context（localStorage が空）でも同じ履歴、を見る。ログインと登録の枠（10 秒に 3 回）は IP ごとなので、auth.spec.ts と取り合わないよう、orders.spec.ts は別の接続元（`E2E_ORDERS_CLIENT_IPS`）を使う
- **本番ビルドで回す**: `next start` に対して回す（404 の本文が HTML に入るかなど、dev とは挙動が違う）。hydration が終わる前にフォームを操作しない（`e2e/support/page.ts` の `open`）。待つときは `waitForTimeout` ではなく、`expect` の自動再試行と `expect.poll` を使う
- **新しい導線を足したとき**: E2E を 1 本足し、アプリ側の 1 行を一時的に壊して red になることを確かめる（壊しても落ちないテストは守りにならない）
- 見た目の差は E2E の仕事にしない（`toHaveScreenshot` は mac と CI の linux で字形が揺れる）。前後のスクリーンショットで見る

## トークンと部品の置き場

| 置くもの                                                                 | 場所                                                                                                                                 |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| 色・書体・角丸（Tailwind のユーティリティにもなるもの）                  | `app/styles/tokens.css` の `@theme`                                                                                                  |
| それ以外のトークン（金の半透明・影・余白・小さい文字・イージング・速さ） | `app/styles/tokens.css` の `:root`                                                                                                   |
| 文字の大きさの目盛り・行の高さ・字間 wide / widest                       | Tailwind のテーマ変数を参照する（`var(--text-sm)` `var(--text-sm--line-height)` `var(--tracking-wide)`。参照したものだけ出力される） |
| body・フォーカス表示・スキップリンク（層の外）                           | `app/styles/base.css`                                                                                                                |
| 部品のクラス（すべて `@layer components`、1 部品 1 ファイル）            | `app/styles/components/*.css`                                                                                                        |
| 形の土台（円・ピル・下からの影）                                         | `app/styles/components/shape.css`（`.circle-icon` `.pill` `.shade-up`）                                                              |
| 表示書体（見出し・金額・ブランド名）                                     | `.type-display`（`typography.css`）。見出しは `components/ui/Heading.tsx` が組み立てる                                               |
| 控えめなリンク                                                           | `.link-quiet`（+ `.link-quiet-sm`）（`link.css`）                                                                                    |
| React の共通部品                                                         | `components/ui/`（`.tsx`）                                                                                                           |
| 数量の上下限                                                             | `lib/cart.ts` の `MIN_QUANTITY` / `MAX_QUANTITY`                                                                                     |
| カテゴリへのリンク                                                       | `lib/links.ts`（`categoryHref` / `CATEGORY_LINKS`。カテゴリの正本は `lib/catalog.ts`）                                               |

- ページの `className` には配置と大きさのユーティリティだけを書き、見た目は部品へ寄せる
- 新しい部品クラスを足す前に、同じ宣言の組を持つ役割クラス（`.fine` `.lead` `.meta` など）が無いかを探す
- 切り替え幅は Tailwind と同じ rem で書く（md は `48rem`）。`@media` の中では変数が使えないので値を直接書く

## hover

- 部品 CSS の `:hover` は **`@media (hover: hover)` の中** に書く。素の `:hover` はタッチ端末でタップした後に色が残る（Tailwind の `hover:` は自動でこの中に出る）
- `npm run check:css` が `@layer components` の中で外に出た `:hover` を違反にする

## aria-current の値

- 開いているページそのものへのリンク（パスとクエリが一致）は `aria-current="page"`。その配下（商品詳細から見たショップなど）は `"true"`
- 表示中のスライドの点は、表示中のものにだけ `aria-current` を付ける（付いていない点は属性なし）
- CSS は値に結び付けず `[aria-current]` で選ぶ（値を直したときに見た目が黙って消えないように）

## 文面

- 配送・保証・返品・送料・テストモードの注記などの約束の文面は **`lib/policies.ts`** にだけ書き、ページ・部品はそこから組み立てる（`POLICIES` `TEST_MODE_NOTE` `PLEDGE_TEXT` `ANNOUNCEMENT`）
- 保証の範囲は全商品（`POLICIES.warrantyScope`）
- デモであることの注記のパネルは `components/ui/DemoNote.tsx` を使う
- プライバシーポリシーには、実際に保存・送信するものだけを書く。保存の中身を変えたら、localStorage を書き出して文面と突き合わせる

## データベース

- **スキーマの正本は `lib/db/schema.ts`**: 表・制約・外部キーはここだけに書く。直したら `npm run db:generate` で `drizzle/` の SQL を出して一緒にコミットする（CI の `db-migrations-fresh` が、generate を打って差分が出ないことを確かめる）。`drizzle-kit push` は使わない（履歴が残らない）。生成された SQL は手で直さない
- **変更は「足す → 使う → 消す」の 3 段**: 1 つの PR で列を消して、同時にその列を使うのをやめる変更はしない（Vercel のデプロイとマイグレーションの順番は保証されない）
- **接続先の切り替えは `lib/db/connect.ts` の `resolveDbTarget` の 1 か所**: `DATABASE_URL` があれば Neon、無ければ PGlite。ほかの場所で `process.env.DATABASE_URL` を読まない
- **DB は関数の引数で受け取る**（`Db` 型）: アプリは `lib/db/client.ts` の `getDb()`（`server-only`）だけから受け取り、テストは `lib/db/test-helpers.ts` の `withTestDb` の接続を差し込む。テストは `client.ts` を import しない（Stripe の `getStripe` と同じ流儀）
- **本番は `DATABASE_URL` 必須**: `resolveDbTarget` は、`NODE_ENV=production` で `DATABASE_URL` も `PGLITE_DATA_DIR` も無ければ例外にする（PGlite に黙って切り替えない）。本番ビルドをローカルで動かすとき（`next start`・E2E）は `PGLITE_DATA_DIR` で PGlite を明示する。`PGLITE_DATA_DIR` は **E2E とローカルの `next start` のための opt-in** で、Vercel（`VERCEL=1`）では無視する（置かれても、関数の実体ごとに消える DB に注文を書かない）。dev・test は従来どおり既定の `.pglite/`
- **環境の境目**: Vercel の Preview には本番の `DATABASE_URL` を入れない（Preview 用の DB を置くか、置かずに DB なし）。Webhook は本番の URL だけに登録する（Stripe はアカウントのイベントを登録済みの全エンドポイントに送るので、Preview・ローカルの試し買いも本番の Webhook に届き、本番の DB にゲストの注文として確定される。避けたいときは Preview・ローカルに別の Stripe アカウントのテストキーを使う）。手順は README の「公開（Vercel）」
- **DB の制約に写す値は、持ち主の定数から読む**: 数量の上下限は `lib/cart.ts` の `MIN_QUANTITY` / `MAX_QUANTITY` を schema が読む（定数を変えると generate の差分が出て CI が落ちる）。同じ数を schema に直書きしない
- **在庫（`products.stock`）は DB が正本**: seed（`lib/db/seed.ts`）は価格だけを合わせ、在庫は上書きしない。カタログから消えた商品も消さない（注文の明細が参照している）
- **DB のテストは PGlite**: `withTestDb` がテストごとに全マイグレーションを当てた状態の DB を立てる。外部のサービスや docker に依存しない。PGlite と本物の Postgres の差は CI の `db-migrate-postgres`（`services: postgres`）で拾う

## 注文の確定

- **注文（`orders` / `order_items`）を書くのは `lib/fulfillment.ts` の `fulfillCheckout` だけ**: Webhook（`lib/stripe-webhook.ts`）・決済確認 API（`lib/checkout-session.ts` の `verifyCheckoutSession`）・GraphQL の `orderBySession` は、どれもこれを呼ぶ。別の経路から注文を INSERT しない（冪等の守りが 1 か所に揃わなくなる）
- **冪等は 3 つで守る**: ① 先に `stripe_session_id` で DB を探す（あれば Stripe を呼ばない）② `orders.stripe_session_id` の一意制約 + `ON CONFLICT … DO NOTHING`（同時に来た 2 つ目を空振りにする）③ 注文・明細・処理済みイベント（`stripe_events`）を 1 つのトランザクションで書く（途中で失敗したら全部取り消し、イベントだけ「処理済み」になって注文が失われることがない）。トランザクションの中では `db` ではなく `tx` だけを使う（PGlite では自分の終わりを待って止まる）
- **注文の中身は Stripe から取り直す**: Webhook の本文は信じない（session の id だけ取り出す）。品目と数量は session の metadata、単価と名前はカタログから引いて、購入した時点の値を `order_items` に写す。`orderFromSession` を再利用し、注文の組み立てを重複して書かない
- **請求額・通貨を照合してから確定する**: 支払い済みでも、session の `amount_total`・`currency`（`jpy`）が、metadata とカタログから作った合計と合わなければ（`findPaymentMismatch`）注文を作らない。決済を作ってから確定するまでにカタログの価格が変わると、請求額と違う合計で記録されるため。`fulfillCheckout` が値（金額・品目）を含まない構造化ログ `fulfillment.payment-mismatch`（`sessionId` と食い違った項目だけ）を残し、結果は `payment-mismatch`（Webhook は 422 で再送させ、成功ページは「確認が取れていません」、GraphQL は隠した例外）。手で直す前提で、明細を Stripe の `line_items` から作る設計は段 7 の課題。Webhook が届けた決済を Stripe が知らない（404。鍵の取り違えの疑い）・未払いのときも、警告のログ（`fulfillment.session-not-found` / `session-unpaid`）を残す（成功ページの経路は、利用者が好きな id を送れるので残さない）
- **Webhook**: 署名は `Stripe.webhooks.constructEvent` に、加工していない本文と `Stripe-Signature`、`STRIPE_WEBHOOK_SECRET` を渡して検証する（`constructEvent` は `this` を使うので、メソッドのまま呼ぶ）。通らなければ 400（秘密が未設定なら 503）で、DB にも Stripe にも触れない。2xx を返すのは「受け取って片付いた」ときだけで、失敗は非 2xx にして Stripe に再送させる。未払いは 2xx で片付けて何も記録しない（あとから入金される方法は `async_payment_succeeded` で来る）
- **ブラウザに注文を記録しない**: 注文の正本は DB。ブラウザ（localStorage）に残すのは、購入分をカートから取り除き済みの決済の id（`cart-storage` の `settledSessions`。成功ページを開き直しても二重に取り除かないため）だけ。注文履歴 `/orders` はサーバの DB から読む（`orderStore` は消した。以前のバージョンが記録した履歴は読み込まず、引き継がない）
- **同時実行のテストは競合を作って確かめる**: 偽の Stripe（`tests/support/stripe.ts` の `waitFor`）が全員の到着を待ってから応答を返し、そろって「DB にまだ注文が無い」と見たまま書き込みに進ませる。止めないと、先の呼び出しが書き終えてから後の呼び出しが DB を見て、競合に当たらないまま通ってしまう。PGlite は 1 接続でトランザクションを順に処理するので、本物の Postgres での並行性の差はこのテストでは拾えない（CI の `db-migrate-postgres` はマイグレーションを当てるだけ。注文の確定を本物の Postgres で回すのは今後の課題）

## 注文履歴

- **注文を読むのは `lib/order-history.ts` の 3 関数だけ**: `listOrdersByUser`（利用者の注文を新しい順に 1 ページ）・`findOrderOfUser`（番号で 1 件）・`listAllOrdersByUser`（`/orders` 用に、ページをたどって上限まで集める）。GraphQL の `myOrders`・`order` とページ `/orders` は、どれもこれを呼ぶ。`orders` を利用者の絞り込みなしに読んで、画面や API に返さない
- **持ち主の絞り込み（`orders.user_id = 利用者の id`）は、そのファイルの where にだけ書く**: resolver やページの側で「持ち主か」を後から判定しない（判定を書き忘れた経路が、他の人の注文を返す）。ゲストの注文（`user_id` が null）はどの利用者の履歴にも出ない。`order(orderNo)` は持ち主でなければ（未ログイン・他の人・ゲスト・存在しない番号のどれも）同じ `null` で、注文の存在を漏らさない
- **ログインの確認は `requireViewer`（`lib/graphql/authorize.ts`）に寄せる**: 未ログインの `myOrders` は `extensions.code = "UNAUTHENTICATED"` と固定の文言で断り、DB に触れない。resolver の中で毎回 `if (!viewer) throw …` を書かない。管理者の確認（`FORBIDDEN`）は管理画面の段で `requireAdmin` として足す
- **ページ送りの `after` は前のページの最後の注文番号**: その注文の `created_at` と `id` を DB の中で引いて「それより古い」を選ぶ（JS の `Date` に丸めるとマイクロ秒が失われ、作成時刻が近い注文が境目で落ちる）。持ち主の注文に限るので、他の人の注文の番号を渡しても何も返らない。件数の上限は `MAX_PAGE_SIZE`（範囲外の `first` は `BAD_USER_INPUT`）
- **`PlacedOrder` に持ち主と Stripe の決済の番号を出す項目を足さない**: 応答に出すのは注文番号・状態・明細・合計・日時だけ（`tests/graphql.test.ts` が型の項目を固定している）。明細の `product` は今のカタログの商品で、カタログから消えた商品は注文時の写しの名前と単価で返す（落とさない）。小計は購入した時点の単価（DB の写し）× 数量
- **`/orders` はサーバコンポーネントで、`/account` と同じ作り**: `getViewer()` を引き、無ければ `redirect(loginPathFor(ORDERS_PATH))`。localStorage を見ない。日付は `formatDate`（日本時間）で整える。ヘッダーのナビの「注文履歴」は未ログインでも出し、押すとログインへ送る
- **注文の読み込み・変換は `readStoredOrders`（`lib/fulfillment.ts`）に共通化**: 決済の確認（`findOrderBySessionId`）と注文履歴が同じ関数で `StoredOrder` にする。明細の並びは商品 id の順（購入順の列は持たない）
- **テスト**: `tests/order-history.test.ts`（自分の注文だけ・新しい順・ページ送りの境目・他の人の番号・カタログから消えた商品）、`tests/graphql.test.ts`（`myOrders`・`order` の認可と形）、`tests/auth-viewer.test.ts`（本物のセッションで、買った注文が履歴に出る）、`tests/db.test.ts`（`orders_user_id_idx`）

## GraphQL の入口

- **1 リクエストの重さは検証規則で止める**（`lib/graphql/handler.ts`）: 本文 4KB・Mutation 1 つ・Stripe を呼ぶフィールド（`createCheckoutSession`・`orderBySession`）合計 1 つ・**DB を読むフィールド（`viewer`・`myOrders`・`order`・`orderBySession`）合計 2 つ**・選択するフィールドの総数 200。数えるのはルートのフィールドで、エイリアス・フラグメントの展開も数える（子の `order` は数えない）。DB を読むフィールドの上限を超えたら HTTP 400・`extensions.code = BAD_USER_INPUT` で、DB に触れない（yoga は検証のエラーに `http.spec = true` を付け、Accept が `application/json` のときは 200 にするので、`http: { status: 400, spec: false }` を明示している）
- **本番（`NODE_ENV=production`）では `GET`・`HEAD` を 405、イントロスペクション（`__schema`・`__type`）を断る**。GET は本文の上限も `Content-Type` の検査も通らず、副作用のある `orderBySession` も実行できる。本番以外は GraphiQL が使う。ブラウザのクライアント（`lib/graphql/client.ts`）は POST だけを使う
- **リクエストの本文のエラー文言（`TOO_LARGE`・`BAD_REQUEST`・`UNSUPPORTED_MEDIA_TYPE`）と `NO_STORE` は `lib/checkout-session.ts` の 1 か所**。`/checkout`・GraphQL・Webhook・`/api/auth` がそれを読む

## 認証

- **登録・ログイン・ログアウトは GraphQL にしない**: Better Auth の `/api/auth/*`（`app/api/auth/[...all]/route.ts`）が、cookie の発行と削除・試行回数の制限・送信元（Origin）の検査をまとめて持つ。GraphQL は `viewer` を読むだけ。`/api/auth/*` を自前で包み直さない
- **セッションを引く場所は 1 つ**: ページ（サーバコンポーネント）は `lib/auth/server.ts` の `getViewer()`、Route Handler と GraphQL は `getViewerFromHeaders(headers)`。どちらも `lib/auth/viewer.ts` の `viewerFromHeaders`（セッションの cookie が無ければ DB に触れない。期限は延ばさない）を通る。ほかの場所で `auth.api.getSession` を直接呼ばない。**ヘッダーだけは例外**で、クライアントの `authClient.useSession()` を使う（ヘッダーはすべてのページにあり、サーバで cookie を読むとすべてのページが動的になって、商品ページの静的生成が外れるため）
- **`/api/auth/*` の入口は `lib/auth/handler.ts` の `handleAuthRequest`**: 本文を持つ要求は 16KB（`MAX_AUTH_BODY_BYTES`）までしか読まず、超えたら Better Auth にも DB にも触れずに 413。Better Auth を作れない・想定外の例外のときは理由を出さず 500。公開している口の一覧は README の「認証」で、`tests/auth-endpoints.test.ts` が固定している（Better Auth を上げて口が増えたら落ちる）
- **利用者が入れる値には長さの上限がある**（`lib/auth/constants.ts`: 表示名 50・メール 254・画像の URL 2048 文字、User-Agent は 256 文字で切る）。Better Auth の `databaseHooks`（`lib/auth/config.ts`）が、登録と `update-user` の両方で DB に書く前に検査する（400）。登録フォームの入力欄にも同じ値を付ける
- **ログに値を出さない**: 例外を console に渡さない（Drizzle の例外は message と params に SQL の引数＝パスワードのハッシュ・メールアドレス・セッションの識別子を持つ）。出来事は `lib/log.ts` の `logEvent`（1 行 1 JSON。値は文字列・数・真偽・null だけ）で、例外は `describeError`（名前と SQLSTATE などのコードだけ）を通して書く。Better Auth のログは `logger.log` と `onAPIError.onError`（`lib/auth/log.ts`）で同じ形にする（水準は既定の warn のまま。info の「登録済みのメールへの登録の試み」にはメールが入る）。`tests/auth-log.test.ts` が、DB を失敗させて console に出た内容を調べる
- **試行回数の制限が見る接続元**は、`x-real-ip`（Vercel が前段で付け直す）を先に、無ければ `x-forwarded-for`（値 1 つのときだけ）。`IP_ADDRESS_HEADERS`（`lib/auth/constants.ts`）。本番の既定で制限が有効なことは、`NODE_ENV=production` の子プロセスで確かめる（`tests/auth-rate-limit.test.ts`。Better Auth は NODE_ENV を読み込み時に定数にするため）
- **ログインが要るページ**（`/account`・`/orders`）: サーバで `getViewer()` を引き、無ければ `redirect(loginPathFor(<そのページ>))`。localStorage を見て判定しない。`/login` と `/signup` が受ける `next` は、必ず `safeNextPath`（`lib/auth/next-path.ts`）を通してから使う（未検査の値で移動しない。オープンリダイレクトを防ぐ）
- **注文の持ち主は 1 か所で決める**: `createCheckoutSessionCore` が `client_reference_id`（セッションから引いた利用者の id。リクエストの本文の値は使わない）を付け、`fulfillCheckout` だけが `orders.user_id` に入れる（実在する利用者のときだけ。それ以外はゲストとして、支払い済みの注文を失わない）。別の経路から `orders.user_id` を書かない。応答（確認 API・GraphQL の `Order`）には持ち主を出さない
- **認証の表は Better Auth の CLI の出力が正本**: 手で列を足さない。プロパティ名（`emailVerified` など）は Better Auth のフィールド名で、アダプタがこの名前で列を引く。`role` などは管理画面の段で、Better Auth の機能（`additionalFields` か admin プラグイン）で足して、CLI の出力を取り込み直す。`tests/auth.test.ts` の「認証の表」が、Better Auth の要求との食い違い（列・型・必須・一意・外部キー・索引）を検出する
- **既定値は、採否を決めてから使う**: Better Auth の既定のうち方針に関わるもの（パスワードの長さ・セッションの期限）は `lib/auth/constants.ts` に明示して固定し、採否と理由は README の「既定値の採否」に書く。Better Auth を上げるときは、公開から 14 日以上たった版を完全一致で固定し、その表と `tests/auth.test.ts` を読み直す
- **本番の必須の環境変数**: `BETTER_AUTH_SECRET`（`resolveAuthSettings` が、無い・32 文字未満・開発用の固定の値なら例外にする）。`BETTER_AUTH_URL` は Production だけに置き、Preview には置かない（置くとプレビューの URL からのログインが 403 になる）
- **文面**: 失敗の文は `lib/auth/messages.ts`（ログインは、メールの有無・パスワードの違いを言い分けない。英語の message や例外の中身は出さない）、パスワードの再設定が無い注記は `lib/policies.ts`。プライバシーポリシーの「ログイン状態」の行は、実際の cookie と DB の行（`tests/auth.test.ts`）と突き合わせる
- **テストは本物の Better Auth**: `tests/auth.test.ts` と `tests/auth-viewer.test.ts` は、Better Auth を PGlite の DB でそのまま動かし、`auth.handler(new Request(...))` に `/api/auth/*` を送る（偽物に差し替えない。ブラウザの代わりに Set-Cookie を次の要求の Cookie に付ける）。`NODE_ENV=test` では Better Auth が Origin の検査を切るので、テストを `NODE_ENV=test` で動かさない（`node --test` は設定しない）
