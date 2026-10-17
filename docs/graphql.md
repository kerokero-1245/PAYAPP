# GraphQL API

エンドポイントは `/api/graphql`（`POST` は `Content-Type: application/json`。**本番（`NODE_ENV=production`）では `GET` は 405** で、`POST` だけです。開発中はブラウザで開くと GraphiQL が使え、`GET` でもクエリを送れます）。スキーマは `lib/graphql/sdl.ts`、resolver は `lib/graphql/schema.ts` です。

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

ログイン中の利用者の注文を新しい順に（ログインしていなければ `extensions.code` が `UNAUTHENTICATED` のエラー。ゲストの注文・他の人の注文は含まれません。`first` は 1〜50 で既定 20、`after` には前のページの `nextCursor` を渡します）:

```graphql
query {
  myOrders(first: 20) {
    nodes {
      orderNo
      status
      total
      paidAt
      items {
        quantity
        subtotal
        product {
          id
          name
        }
      }
    }
    nextCursor
  }
}
```

注文番号で 1 件は `order(orderNo: "ORD-…")` です。自分の注文でなければ、未ログイン・他の人の注文・ゲストの注文・存在しない番号のどれも同じ `null` を返し、注文の存在を漏らしません。

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
- **ログイン中の利用者は context の `getViewer`**: `viewer`（ログインしていなければ `null`。エラーにしない）と `createCheckoutSession`（持ち主の id を `client_reference_id` に付ける）が必要としたときだけ、1 リクエストにつき 1 回だけ cookie からセッションを引きます。セッションの cookie が無い要求（ゲスト）は DB に触れません。引けなかったとき（DB に繋がらないなど）は、ゲスト扱いにせず失敗にします（ログイン中の人の購入が持ち主なしになるのを避けるため）。ログイン・ログアウト・登録は GraphQL ではなく `/api/auth/*`（[認証](auth.md#認証)）。
- **注文履歴は持ち主の注文だけ**: `myOrders`・`order` は `lib/order-history.ts`（DB を引数で受け、持ち主の絞り込み `orders.user_id = 利用者の id` をその where にだけ書きます。ページ `/orders` も同じ関数を呼びます）を呼ぶだけです。ログインの確認は `requireViewer`（`lib/graphql/authorize.ts`）に寄せ、未ログインの `myOrders` は DB に触れずに `UNAUTHENTICATED` で断ります。`PlacedOrder` には持ち主と Stripe の決済の番号を出す項目がありません。`nextCursor` はそのページの最後の注文番号で、DB の中でその注文の作成時刻を引いて「それより古い」を選ぶので（JS の日付に丸めない）、作成時刻が同じ注文も境目で落ちません。カタログから消えた商品を含む注文でも落ちず、その商品は注文時の写しの名前と単価で返します（`category` は空、`images` は空）。
- **決済の確認は REST のまま**: 成功ページは `GET /api/checkout/session` の HTTP ステータスで「支払い済み / 未払い / 確認できなかった」を分けて二重購入を防いでいるので、GraphQL には置き換えていません。GraphQL の `orderBySession` は、同じ `fulfillCheckout` を呼んで DB の注文（`orderNo` つき。小計は購入した時点の単価 × 数量）を返す読み取り用の入口です。確定済みなら Stripe を呼びません。
- **入口の保護**:
  - 本文は 4KB まで（超えたら 413）。POST は `Content-Type: application/json` だけ（それ以外は 415）。
  - Stripe を呼ぶフィールド（`createCheckoutSession`・`orderBySession`）は 1 リクエスト合計 1 つまで。エイリアス・フラグメント・`@include` 経由も数えるので、1 リクエストで Stripe に多重に要求させられません。Mutation も 1 つまで。
  - DB を読むフィールド（`viewer`・`myOrders`・`order`・`orderBySession`）は 1 リクエスト合計 2 つまで（エイリアス・フラグメントも数えます。超えたら HTTP 400 で `extensions.code` が `BAD_USER_INPUT` のエラーになり、DB には触れません）。`myOrders` 1 つが DB への問い合わせ 2 回なので、数に上限が無いと、3.5KB の要求のエイリアス 100 個で 200 回になります。
  - 本番では `GET` と `HEAD` を 405 にします（本文の 4KB の上限も `Content-Type` の検査も通らず、副作用のある `orderBySession` も実行できてしまうため。ブラウザのクライアント `lib/graphql/client.ts` は `POST` だけを使います）。イントロスペクション（`__schema`・`__type`）も本番では断ります。
  - 選択するフィールドの総数は 1 リクエスト 200 まで（エイリアス・同名フィールドの重複・フラグメントの展開も数える）。解析・検証結果のキャッシュは 100 件まで。
  - Stripe の例外文は返さない（yoga の maskedErrors）。CORS ヘッダーは付けない（他オリジンを反射しない）。応答はすべて `Cache-Control: no-store`。GraphiQL は本番（`NODE_ENV=production`）では出さない。
- テスト（`tests/graphql.test.ts`）は handler を `new Request()` で直接呼び、偽の Stripe を差し込みます。サーバは起動せず、Stripe にも通信しません（Node 24 の型消去で `.ts` をそのまま読み込みます）。
