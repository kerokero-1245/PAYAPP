# payapp（MAISON）の設計の決まりごと

このリポジトリでコードを足す・直すときの方針。見た目の書き方の細部は README の「デザインの書き方」を正本とし、ここには判断の基準と置き場だけを書く。

## 方針

- **共通化の線引き**: 同じ意味の値・処理が **3 回以上** 出てきたら 1 か所（トークン・部品クラス・部品・lib の定数や関数）へ寄せる。2 回までは直書きでよい。値が偶然同じでも意味が違うもの（ボタンの余白とカードの余白など）は分けたままにする
- **TypeScript**: 新しく作るファイルは TS（`.ts` / `.tsx`）で書く。既存の `.js` / `.mjs` も TS へ移す予定（全 TS 化）
- **テスト**: 純粋な関数と API（`lib/`・`app/api/`）はテスト必須（`npm test` = `node --test tests/*.test.mjs`）。UI の変更は前後のスクリーンショットを撮って比べる。ブラウザを動かす E2E テストは追加予定
- **整形**: Prettier を導入予定（導入までは周りのコードの書き方に合わせる）
- **平坦な CSS**: 1 クラス 1 役割の足し算で書き、結合子・入れ子・`!important` を使わない。詳しくは README の「デザインの書き方」。`npm run check:css` が検査し、`tests/flat-css.test.mjs` が検査そのものを確かめる

## トークンと部品の置き場

| 置くもの | 場所 |
| --- | --- |
| 色・書体・角丸（Tailwind のユーティリティにもなるもの） | `app/styles/tokens.css` の `@theme` |
| それ以外のトークン（金の半透明・影・余白・小さい文字・イージング・速さ） | `app/styles/tokens.css` の `:root` |
| 文字の大きさの目盛り・行の高さ・字間 wide / widest | Tailwind のテーマ変数を参照する（`var(--text-sm)` `var(--text-sm--line-height)` `var(--tracking-wide)`。参照したものだけ出力される） |
| body・フォーカス表示・スキップリンク（層の外） | `app/styles/base.css` |
| 部品のクラス（すべて `@layer components`、1 部品 1 ファイル） | `app/styles/components/*.css` |
| 形の土台（円・ピル・下からの影） | `app/styles/components/shape.css`（`.circle-icon` `.pill` `.shade-up`） |
| 表示書体（見出し・金額・ブランド名） | `.type-display`（`typography.css`）。見出しは `components/ui/Heading.js` が組み立てる |
| 控えめなリンク | `.link-quiet`（+ `.link-quiet-sm`）（`link.css`） |
| React の共通部品 | `components/ui/`（新しい部品は `.tsx`） |
| 数量の上下限 | `lib/cart.mjs` の `MIN_QUANTITY` / `MAX_QUANTITY` |
| カテゴリへのリンク | `lib/links.ts`（`categoryHref` / `CATEGORY_LINKS`。カテゴリの正本は `lib/catalog.mjs`） |

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

- 配送・保証・返品・送料・テストモードの注記などの約束の文面は **`lib/policies.mjs`** にだけ書き、ページ・部品はそこから組み立てる（`POLICIES` `TEST_MODE_NOTE` `PLEDGE_TEXT` `ANNOUNCEMENT`）
- 保証の範囲は全商品（`POLICIES.warrantyScope`）
- デモであることの注記のパネルは `components/ui/DemoNote.tsx` を使う
- プライバシーポリシーには、実際に保存・送信するものだけを書く。保存の中身を変えたら、localStorage を書き出して文面と突き合わせる
