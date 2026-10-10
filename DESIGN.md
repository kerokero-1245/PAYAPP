# payapp（MAISON）の設計の決まりごと

このリポジトリでコードを足す・直すときの方針。見た目の書き方の細部は README の「デザインの書き方」を正本とし、ここには判断の基準と置き場だけを書く。

## 方針

- **共通化の線引き**: 同じ意味の値・処理が **3 回以上** 出てきたら 1 か所（トークン・部品クラス・部品・lib の定数や関数）へ寄せる。2 回までは直書きでよい。値が偶然同じでも意味が違うもの（ボタンの余白とカードの余白など）は分けたままにする
- **TypeScript**: すべて TS（`.ts` / `.tsx`）で書く。JS で残すのはツールの設定（`eslint.config.mjs`・`postcss.config.mjs`）と、検査の見本 `tests/fixtures/flat-css/` だけ。`any` は使わない。型の検査は `npx next typegen` → `npx tsc --noEmit`（CI でも実行）
- **型の置き場**: 3 か所以上で使うドメインの型は `lib/types.ts`、1 ファイルだけで使う型はそのファイルに書く。`as` で要素を差し替える部品の props は `components/ui/polymorphic.ts` の `PolymorphicProps`。外から来る値（localStorage・リクエスト本文・Stripe の metadata・環境変数）を受ける関数は、引数を `unknown` で受けて中で絞る
- **Node 側の import**: `lib/`・`tests/`・`scripts/` は Node が型を剥がして直接読むので、相対パスに拡張子 `.ts` を付け、型だけの import は `import type` で書く（`@/` は使わない）。`app/`・`components/`・`store/` は Next が読むので `@/…` で拡張子なし。enum・namespace・コンストラクタの引数プロパティは使えない（`erasableSyntaxOnly`）
- **テスト**: 純粋な関数と API（`lib/`・`app/api/`）はテスト必須（`npm test` = `node --test tests/*.test.ts`。Stripe は `getStripe` で差し込める形にして、偽の Stripe を渡す）。UI の変更は前後のスクリーンショットを撮って比べる。画面の操作（導線）は `e2e/` の E2E（Playwright。`npm run test:e2e`）で確かめる。書き方は下の「E2E（Playwright）」
- **整形**: Prettier を導入予定（導入までは周りのコードの書き方に合わせる）
- **平坦な CSS**: 1 クラス 1 役割の足し算で書き、結合子・入れ子・`!important` を使わない。詳しくは README の「デザインの書き方」。`npm run check:css` が検査し、`tests/flat-css.test.ts` が検査そのものを確かめる

## E2E（Playwright）

- **置き場**: `e2e/*.spec.ts`（1 ファイル 1 導線）、`e2e/fixtures/`（localStorage の形・Stripe のモック・外部画像・`test` の拡張）、`e2e/support/`（カタログから期待値を作る・画面を開く・ロケータ）、`e2e/constants.ts`（URL・ビューポート・session id）。`tests/` は `node --test` のグロブなので混ぜない。新規は TS で、`any` は使わない
- **ロケータ**: `getByRole` / `getByLabel` / 文言で取り、クラス名と DOM の構造には頼らない（部品クラスを改名しても落ちないのが正しい）。取れない部品には、見た目を変えずに `aria-label` を足す（例: ヘッダーのカート点数バッジ）
- **期待値**: 件数・商品名・金額はカタログ（`lib/catalog.ts`）から組み、テストに直書きしない。localStorage の形（cart / order / auth）を知るのは `e2e/fixtures/storage.ts` だけで、seed は画面を開く前に `seedStorage` で入れる
- **Stripe には通信しない**: Stripe に向かう通信（`createCheckoutSession`・決済確認）は既定で閉じてあり、テストが `page.route` でモックする。モックし忘れるとテストが落ちる。実通信は `@stripe` タグの 1 本だけで、`STRIPE_SECRET_KEY` と `E2E_STRIPE=1` の両方があるときだけ動く。CI には Stripe のキーを置かない
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
- **DB の制約に写す値は、持ち主の定数から読む**: 数量の上下限は `lib/cart.ts` の `MIN_QUANTITY` / `MAX_QUANTITY` を schema が読む（定数を変えると generate の差分が出て CI が落ちる）。同じ数を schema に直書きしない
- **在庫（`products.stock`）は DB が正本**: seed（`lib/db/seed.ts`）は価格だけを合わせ、在庫は上書きしない。カタログから消えた商品も消さない（注文の明細が参照している）
- **DB のテストは PGlite**: `withTestDb` がテストごとに全マイグレーションを当てた状態の DB を立てる。外部のサービスや docker に依存しない。PGlite と本物の Postgres の差は CI の `db-migrate-postgres`（`services: postgres`）で拾う
