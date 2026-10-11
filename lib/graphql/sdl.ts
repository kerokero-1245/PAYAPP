/**
 * GraphQL のスキーマ（SDL）。codegen（codegen.ts）もこの文字列を読む。
 * 商品・カテゴリの読み取り、カートの見積もり、決済セッションの作成、確定した注文の照会、ログイン中の利用者（viewer）を持つ。
 * カートはブラウザ（localStorage）のまま（サーバにカートの状態は持たない）。注文は支払いを確認したときに DB に確定し
 * （lib/fulfillment.ts。Webhook・成功ページ・orderBySession が同じ関数を呼ぶ）、orderBySession はその DB の注文を返す。
 * ログイン・ログアウト・登録は GraphQL ではなく Better Auth の /api/auth/*（lib/auth/）が受け、GraphQL は viewer を読むだけ。
 * 注文履歴の一覧（myOrders など）は、次の段で足す。
 */
export const typeDefs = /* GraphQL */ `
  """
  商品カテゴリ（lib/catalog.ts の CATEGORIES）
  """
  type Category {
    "all / watches / leather / fragrance / jewelry"
    slug: String!
    label: String!
    jp: String!
  }

  """
  商品（lib/catalog.ts の PRODUCTS の 1 件）
  """
  type Product {
    id: ID!
    name: String!
    "税込の円。整数"
    price: Int!
    category: String!
    tagline: String
    description: String
    "NEW / LIMITED など。無い商品もある"
    badge: String
    "picsum の絶対 URL（1 枚目がサムネイル）"
    images: [String!]!
  }

  """
  カートの 1 行・注文の 1 行（product はカタログから引いた商品）
  """
  type CartItem {
    product: Product!
    "1〜99"
    quantity: Int!
    "単価 × quantity。カートではカタログの今の価格、注文では購入した時点の単価（product.price とは限らない）"
    subtotal: Int!
  }

  """
  カートの見積もり。価格は送られた値ではなくカタログから決める
  """
  type CartQuote {
    items: [CartItem!]!
    total: Int!
    totalQuantity: Int!
  }

  """
  支払い済みと確認できて、DB に確定した注文。単価と合計は購入した時点の写し
  """
  type Order {
    "画面に出す注文番号（ORD- で始まる）"
    orderNo: ID!
    sessionId: ID!
    items: [CartItem!]!
    total: Int!
  }

  """
  ログイン中の利用者（Better Auth のセッションから引く）。パスワードのハッシュ・セッションの識別子・IP は持たない
  """
  type Viewer {
    id: ID!
    email: String!
    name: String!
  }

  """
  利用者に見せてよい入力エラー（CHECKOUT_ERRORS の文言。入力値は含めない）
  """
  type UserError {
    code: CheckoutErrorCode!
    message: String!
  }

  enum CheckoutErrorCode {
    EMPTY
    TOO_MANY
    UNKNOWN_ITEM
    BAD_QUANTITY
    STRIPE_UNAVAILABLE
  }

  input CartItemInput {
    id: ID!
    quantity: Int!
  }

  type CartQuoteResult {
    quote: CartQuote
    errors: [UserError!]!
  }

  type CheckoutSessionPayload {
    "Stripe Checkout の URL。errors が空のときだけ入る"
    url: String
    errors: [UserError!]!
  }

  enum PaymentState {
    PAID
    UNPAID
  }

  type OrderLookup {
    state: PaymentState!
    order: Order
  }

  type Query {
    categories: [Category!]!
    "category を省略・all・知らない値なら全件。q は name / tagline / description の部分一致（app/product/page.tsx と同じ規則）"
    products(category: String, q: String): [Product!]!
    product(id: ID!): Product
    "localStorage のカートを送り、カタログの価格で見積もる（副作用なし）"
    cartQuote(items: [CartItemInput!]!): CartQuoteResult!
    "支払い済みの注文を返す。DB に確定済みならそれを、無ければ Stripe に 1 回照会して確定する（Webhook・成功ページと同じ fulfillCheckout）。未払い・存在しない・形の不正は UNPAID。照会や確定に失敗したら GraphQL エラー（unverified 扱い）"
    orderBySession(sessionId: ID!): OrderLookup!
    "ログイン中の利用者。ログインしていなければ null（エラーにしない）。セッションの cookie から引く"
    viewer: Viewer
  }

  type Mutation {
    "Stripe Checkout Session を作る。価格はカタログから決め、id と数量を metadata に持たせる。ログイン中なら持ち主の id（viewer.id）を client_reference_id に付ける。1 リクエストに 1 つまで"
    createCheckoutSession(items: [CartItemInput!]!): CheckoutSessionPayload!
  }
`;
