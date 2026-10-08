/**
 * GraphQL のスキーマ（SDL）。codegen（codegen.ts）もこの文字列を読む。
 * 無状態（A 案）: 商品・カテゴリの読み取り、カートの見積もり、決済セッションの作成、
 * Stripe で確認した注文の照会だけを持つ。カートと注文履歴はブラウザ（localStorage）のまま。
 */
export const typeDefs = /* GraphQL */ `
  """
  商品カテゴリ（lib/catalog.mjs の CATEGORIES）
  """
  type Category {
    "all / watches / leather / fragrance / jewelry"
    slug: String!
    label: String!
    jp: String!
  }

  """
  商品（lib/catalog.mjs の PRODUCTS の 1 件）
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
  カートの 1 行（サーバがカタログから引いた値）
  """
  type CartItem {
    product: Product!
    "1〜99"
    quantity: Int!
    "price × quantity"
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
  Stripe で支払い済みと確認できた注文（保存はしない。毎回 Stripe に照会して作る）
  """
  type Order {
    sessionId: ID!
    items: [CartItem!]!
    total: Int!
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
    "category を省略・all・知らない値なら全件。q は name / tagline / description の部分一致（app/product/page.js と同じ規則）"
    products(category: String, q: String): [Product!]!
    product(id: ID!): Product
    "localStorage のカートを送り、カタログの価格で見積もる（副作用なし）"
    cartQuote(items: [CartItemInput!]!): CartQuoteResult!
    "Stripe に照会して注文を返す（保存しない）。照会失敗は GraphQL エラー（unverified 扱い）"
    orderBySession(sessionId: ID!): OrderLookup!
  }

  type Mutation {
    "Stripe Checkout Session を作る。価格はカタログから決め、id と数量を metadata に持たせる。1 リクエストに 1 つまで"
    createCheckoutSession(items: [CartItemInput!]!): CheckoutSessionPayload!
  }
`;
