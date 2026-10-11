// このファイルは npm run codegen が生成する。手で編集しない。
/* eslint-disable */
import type { GraphQLResolveInfo } from 'graphql';
export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type RequireFields<T, K extends keyof T> = Omit<T, K> & { [P in K]-?: NonNullable<T[P]> };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string; }
  String: { input: string; output: string; }
  Boolean: { input: boolean; output: boolean; }
  Int: { input: number; output: number; }
  Float: { input: number; output: number; }
};

/** カートの 1 行・注文の 1 行（product はカタログから引いた商品） */
export type CartItem = {
  __typename?: 'CartItem';
  product: Product;
  /** 1〜99 */
  quantity: Scalars['Int']['output'];
  /** 単価 × quantity。カートではカタログの今の価格、注文では購入した時点の単価（product.price とは限らない） */
  subtotal: Scalars['Int']['output'];
};

export type CartItemInput = {
  id: Scalars['ID']['input'];
  quantity: Scalars['Int']['input'];
};

/** カートの見積もり。価格は送られた値ではなくカタログから決める */
export type CartQuote = {
  __typename?: 'CartQuote';
  items: Array<CartItem>;
  total: Scalars['Int']['output'];
  totalQuantity: Scalars['Int']['output'];
};

export type CartQuoteResult = {
  __typename?: 'CartQuoteResult';
  errors: Array<UserError>;
  quote?: Maybe<CartQuote>;
};

/** 商品カテゴリ（lib/catalog.ts の CATEGORIES） */
export type Category = {
  __typename?: 'Category';
  jp: Scalars['String']['output'];
  label: Scalars['String']['output'];
  /** all / watches / leather / fragrance / jewelry */
  slug: Scalars['String']['output'];
};

export type CheckoutErrorCode =
  | 'BAD_QUANTITY'
  | 'EMPTY'
  | 'STRIPE_UNAVAILABLE'
  | 'TOO_MANY'
  | 'UNKNOWN_ITEM';

export type CheckoutSessionPayload = {
  __typename?: 'CheckoutSessionPayload';
  errors: Array<UserError>;
  /** Stripe Checkout の URL。errors が空のときだけ入る */
  url?: Maybe<Scalars['String']['output']>;
};

export type Mutation = {
  __typename?: 'Mutation';
  /** Stripe Checkout Session を作る。価格はカタログから決め、id と数量を metadata に持たせる。ログイン中なら持ち主の id（viewer.id）を client_reference_id に付ける。1 リクエストに 1 つまで */
  createCheckoutSession: CheckoutSessionPayload;
};


export type MutationCreateCheckoutSessionArgs = {
  items: Array<CartItemInput>;
};

/** 支払い済みと確認できて、DB に確定した注文。単価と合計は購入した時点の写し */
export type Order = {
  __typename?: 'Order';
  items: Array<CartItem>;
  /** 画面に出す注文番号（ORD- で始まる） */
  orderNo: Scalars['ID']['output'];
  sessionId: Scalars['ID']['output'];
  total: Scalars['Int']['output'];
};

export type OrderConnection = {
  __typename?: 'OrderConnection';
  /** 次のページがあるときだけ、このページの最後の注文番号。myOrders の after にそのまま渡す */
  nextCursor?: Maybe<Scalars['String']['output']>;
  nodes: Array<PlacedOrder>;
};

export type OrderLookup = {
  __typename?: 'OrderLookup';
  order?: Maybe<Order>;
  state: PaymentState;
};

/** 注文の状態（orders.status）。今は決済を確認できた PAID だけが入る */
export type OrderStatus =
  | 'FAILED'
  | 'PAID'
  | 'PENDING';

export type PaymentState =
  | 'PAID'
  | 'UNPAID';

/** ログイン中の利用者の注文 1 件（DB に確定した注文）。持ち主・Stripe の決済の番号は出さない */
export type PlacedOrder = {
  __typename?: 'PlacedOrder';
  /** 注文の記録を作った日時（ISO 8601） */
  createdAt: Scalars['String']['output'];
  /** product は今のカタログの商品。カタログから消えた商品は、名前と単価が注文時の写しで、category は空文字・images は空になる。subtotal は購入した時点の単価 × quantity */
  items: Array<CartItem>;
  /** 画面に出す注文番号（ORD- で始まる） */
  orderNo: Scalars['ID']['output'];
  /** 支払いを確認して注文を確定した日時（ISO 8601） */
  paidAt?: Maybe<Scalars['String']['output']>;
  status: OrderStatus;
  total: Scalars['Int']['output'];
};

/** 商品（lib/catalog.ts の PRODUCTS の 1 件） */
export type Product = {
  __typename?: 'Product';
  /** NEW / LIMITED など。無い商品もある */
  badge?: Maybe<Scalars['String']['output']>;
  category: Scalars['String']['output'];
  description?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  /** picsum の絶対 URL（1 枚目がサムネイル） */
  images: Array<Scalars['String']['output']>;
  name: Scalars['String']['output'];
  /** 税込の円。整数 */
  price: Scalars['Int']['output'];
  tagline?: Maybe<Scalars['String']['output']>;
};

export type Query = {
  __typename?: 'Query';
  /** localStorage のカートを送り、カタログの価格で見積もる（副作用なし） */
  cartQuote: CartQuoteResult;
  categories: Array<Category>;
  /** ログイン中の利用者の注文を新しい順に返す。他の人の注文とゲストの注文（持ち主なし）は含まない。未ログインは extensions.code = UNAUTHENTICATED のエラー。first は 1〜50（既定 20。範囲外は BAD_USER_INPUT）。after は前のページの nextCursor（知らない値・他の人の注文の番号は空のページになる） */
  myOrders: OrderConnection;
  /** 注文番号で 1 件。自分の注文でなければ（未ログイン・他の人の注文・ゲストの注文・存在しない番号のどれも）null を返し、注文の存在を漏らさない */
  order?: Maybe<PlacedOrder>;
  /** 支払い済みの注文を返す。DB に確定済みならそれを、無ければ Stripe に 1 回照会して確定する（Webhook・成功ページと同じ fulfillCheckout）。未払い・存在しない・形の不正は UNPAID。照会や確定に失敗したら GraphQL エラー（unverified 扱い） */
  orderBySession: OrderLookup;
  product?: Maybe<Product>;
  /** category を省略・all・知らない値なら全件。q は name / tagline / description の部分一致（app/product/page.tsx と同じ規則） */
  products: Array<Product>;
  /** ログイン中の利用者。ログインしていなければ null（エラーにしない）。セッションの cookie から引く */
  viewer?: Maybe<Viewer>;
};


export type QueryCartQuoteArgs = {
  items: Array<CartItemInput>;
};


export type QueryMyOrdersArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
};


export type QueryOrderArgs = {
  orderNo: Scalars['ID']['input'];
};


export type QueryOrderBySessionArgs = {
  sessionId: Scalars['ID']['input'];
};


export type QueryProductArgs = {
  id: Scalars['ID']['input'];
};


export type QueryProductsArgs = {
  category?: InputMaybe<Scalars['String']['input']>;
  q?: InputMaybe<Scalars['String']['input']>;
};

/** 利用者に見せてよい入力エラー（CHECKOUT_ERRORS の文言。入力値は含めない） */
export type UserError = {
  __typename?: 'UserError';
  code: CheckoutErrorCode;
  message: Scalars['String']['output'];
};

/** ログイン中の利用者（Better Auth のセッションから引く）。パスワードのハッシュ・セッションの識別子・IP は持たない */
export type Viewer = {
  __typename?: 'Viewer';
  email: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
};



export type ResolverTypeWrapper<T> = Promise<T> | T;


export type ResolverWithResolve<TResult, TParent, TContext, TArgs> = {
  resolve: ResolverFn<TResult, TParent, TContext, TArgs>;
};
export type Resolver<TResult, TParent = Record<PropertyKey, never>, TContext = Record<PropertyKey, never>, TArgs = Record<PropertyKey, never>> = ResolverFn<TResult, TParent, TContext, TArgs> | ResolverWithResolve<TResult, TParent, TContext, TArgs>;

export type ResolverFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => Promise<TResult> | TResult;

export type SubscriptionSubscribeFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => AsyncIterable<TResult> | Promise<AsyncIterable<TResult>>;

export type SubscriptionResolveFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => TResult | Promise<TResult>;

export interface SubscriptionSubscriberObject<TResult, TKey extends string, TParent, TContext, TArgs> {
  subscribe: SubscriptionSubscribeFn<{ [key in TKey]: TResult }, TParent, TContext, TArgs>;
  resolve?: SubscriptionResolveFn<TResult, { [key in TKey]: TResult }, TContext, TArgs>;
}

export interface SubscriptionResolverObject<TResult, TParent, TContext, TArgs> {
  subscribe: SubscriptionSubscribeFn<any, TParent, TContext, TArgs>;
  resolve: SubscriptionResolveFn<TResult, any, TContext, TArgs>;
}

export type SubscriptionObject<TResult, TKey extends string, TParent, TContext, TArgs> =
  | SubscriptionSubscriberObject<TResult, TKey, TParent, TContext, TArgs>
  | SubscriptionResolverObject<TResult, TParent, TContext, TArgs>;

export type SubscriptionResolver<TResult, TKey extends string, TParent = Record<PropertyKey, never>, TContext = Record<PropertyKey, never>, TArgs = Record<PropertyKey, never>> =
  | ((...args: any[]) => SubscriptionObject<TResult, TKey, TParent, TContext, TArgs>)
  | SubscriptionObject<TResult, TKey, TParent, TContext, TArgs>;

export type TypeResolveFn<TTypes, TParent = Record<PropertyKey, never>, TContext = Record<PropertyKey, never>> = (
  parent: TParent,
  context: TContext,
  info: GraphQLResolveInfo
) => Maybe<TTypes> | Promise<Maybe<TTypes>>;

export type IsTypeOfResolverFn<T = Record<PropertyKey, never>, TContext = Record<PropertyKey, never>> = (obj: T, context: TContext, info: GraphQLResolveInfo) => boolean | Promise<boolean>;

export type NextResolverFn<T> = () => Promise<T>;

export type DirectiveResolverFn<TResult = Record<PropertyKey, never>, TParent = Record<PropertyKey, never>, TContext = Record<PropertyKey, never>, TArgs = Record<PropertyKey, never>> = (
  next: NextResolverFn<TResult>,
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => TResult | Promise<TResult>;





/** Mapping between all available schema types and the resolvers types */
export type ResolversTypes = {
  Boolean: ResolverTypeWrapper<Scalars['Boolean']['output']>;
  CartItem: ResolverTypeWrapper<CartItem>;
  CartItemInput: CartItemInput;
  CartQuote: ResolverTypeWrapper<CartQuote>;
  CartQuoteResult: ResolverTypeWrapper<CartQuoteResult>;
  Category: ResolverTypeWrapper<Category>;
  CheckoutErrorCode: CheckoutErrorCode;
  CheckoutSessionPayload: ResolverTypeWrapper<CheckoutSessionPayload>;
  ID: ResolverTypeWrapper<Scalars['ID']['output']>;
  Int: ResolverTypeWrapper<Scalars['Int']['output']>;
  Mutation: ResolverTypeWrapper<Record<PropertyKey, never>>;
  Order: ResolverTypeWrapper<Order>;
  OrderConnection: ResolverTypeWrapper<OrderConnection>;
  OrderLookup: ResolverTypeWrapper<OrderLookup>;
  OrderStatus: OrderStatus;
  PaymentState: PaymentState;
  PlacedOrder: ResolverTypeWrapper<PlacedOrder>;
  Product: ResolverTypeWrapper<Product>;
  Query: ResolverTypeWrapper<Record<PropertyKey, never>>;
  String: ResolverTypeWrapper<Scalars['String']['output']>;
  UserError: ResolverTypeWrapper<UserError>;
  Viewer: ResolverTypeWrapper<Viewer>;
};

/** Mapping between all available schema types and the resolvers parents */
export type ResolversParentTypes = {
  Boolean: Scalars['Boolean']['output'];
  CartItem: CartItem;
  CartItemInput: CartItemInput;
  CartQuote: CartQuote;
  CartQuoteResult: CartQuoteResult;
  Category: Category;
  CheckoutSessionPayload: CheckoutSessionPayload;
  ID: Scalars['ID']['output'];
  Int: Scalars['Int']['output'];
  Mutation: Record<PropertyKey, never>;
  Order: Order;
  OrderConnection: OrderConnection;
  OrderLookup: OrderLookup;
  PlacedOrder: PlacedOrder;
  Product: Product;
  Query: Record<PropertyKey, never>;
  String: Scalars['String']['output'];
  UserError: UserError;
  Viewer: Viewer;
};

export type CartItemResolvers<ContextType = any, ParentType extends ResolversParentTypes['CartItem'] = ResolversParentTypes['CartItem']> = {
  product?: Resolver<ResolversTypes['Product'], ParentType, ContextType>;
  quantity?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  subtotal?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
};

export type CartQuoteResolvers<ContextType = any, ParentType extends ResolversParentTypes['CartQuote'] = ResolversParentTypes['CartQuote']> = {
  items?: Resolver<Array<ResolversTypes['CartItem']>, ParentType, ContextType>;
  total?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  totalQuantity?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
};

export type CartQuoteResultResolvers<ContextType = any, ParentType extends ResolversParentTypes['CartQuoteResult'] = ResolversParentTypes['CartQuoteResult']> = {
  errors?: Resolver<Array<ResolversTypes['UserError']>, ParentType, ContextType>;
  quote?: Resolver<Maybe<ResolversTypes['CartQuote']>, ParentType, ContextType>;
};

export type CategoryResolvers<ContextType = any, ParentType extends ResolversParentTypes['Category'] = ResolversParentTypes['Category']> = {
  jp?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  label?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  slug?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export type CheckoutSessionPayloadResolvers<ContextType = any, ParentType extends ResolversParentTypes['CheckoutSessionPayload'] = ResolversParentTypes['CheckoutSessionPayload']> = {
  errors?: Resolver<Array<ResolversTypes['UserError']>, ParentType, ContextType>;
  url?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
};

export type MutationResolvers<ContextType = any, ParentType extends ResolversParentTypes['Mutation'] = ResolversParentTypes['Mutation']> = {
  createCheckoutSession?: Resolver<ResolversTypes['CheckoutSessionPayload'], ParentType, ContextType, RequireFields<MutationCreateCheckoutSessionArgs, 'items'>>;
};

export type OrderResolvers<ContextType = any, ParentType extends ResolversParentTypes['Order'] = ResolversParentTypes['Order']> = {
  items?: Resolver<Array<ResolversTypes['CartItem']>, ParentType, ContextType>;
  orderNo?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  sessionId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  total?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
};

export type OrderConnectionResolvers<ContextType = any, ParentType extends ResolversParentTypes['OrderConnection'] = ResolversParentTypes['OrderConnection']> = {
  nextCursor?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  nodes?: Resolver<Array<ResolversTypes['PlacedOrder']>, ParentType, ContextType>;
};

export type OrderLookupResolvers<ContextType = any, ParentType extends ResolversParentTypes['OrderLookup'] = ResolversParentTypes['OrderLookup']> = {
  order?: Resolver<Maybe<ResolversTypes['Order']>, ParentType, ContextType>;
  state?: Resolver<ResolversTypes['PaymentState'], ParentType, ContextType>;
};

export type PlacedOrderResolvers<ContextType = any, ParentType extends ResolversParentTypes['PlacedOrder'] = ResolversParentTypes['PlacedOrder']> = {
  createdAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  items?: Resolver<Array<ResolversTypes['CartItem']>, ParentType, ContextType>;
  orderNo?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  paidAt?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  status?: Resolver<ResolversTypes['OrderStatus'], ParentType, ContextType>;
  total?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
};

export type ProductResolvers<ContextType = any, ParentType extends ResolversParentTypes['Product'] = ResolversParentTypes['Product']> = {
  badge?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  category?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  description?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  images?: Resolver<Array<ResolversTypes['String']>, ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  price?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  tagline?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
};

export type QueryResolvers<ContextType = any, ParentType extends ResolversParentTypes['Query'] = ResolversParentTypes['Query']> = {
  cartQuote?: Resolver<ResolversTypes['CartQuoteResult'], ParentType, ContextType, RequireFields<QueryCartQuoteArgs, 'items'>>;
  categories?: Resolver<Array<ResolversTypes['Category']>, ParentType, ContextType>;
  myOrders?: Resolver<ResolversTypes['OrderConnection'], ParentType, ContextType, RequireFields<QueryMyOrdersArgs, 'first'>>;
  order?: Resolver<Maybe<ResolversTypes['PlacedOrder']>, ParentType, ContextType, RequireFields<QueryOrderArgs, 'orderNo'>>;
  orderBySession?: Resolver<ResolversTypes['OrderLookup'], ParentType, ContextType, RequireFields<QueryOrderBySessionArgs, 'sessionId'>>;
  product?: Resolver<Maybe<ResolversTypes['Product']>, ParentType, ContextType, RequireFields<QueryProductArgs, 'id'>>;
  products?: Resolver<Array<ResolversTypes['Product']>, ParentType, ContextType, Partial<QueryProductsArgs>>;
  viewer?: Resolver<Maybe<ResolversTypes['Viewer']>, ParentType, ContextType>;
};

export type UserErrorResolvers<ContextType = any, ParentType extends ResolversParentTypes['UserError'] = ResolversParentTypes['UserError']> = {
  code?: Resolver<ResolversTypes['CheckoutErrorCode'], ParentType, ContextType>;
  message?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export type ViewerResolvers<ContextType = any, ParentType extends ResolversParentTypes['Viewer'] = ResolversParentTypes['Viewer']> = {
  email?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export type Resolvers<ContextType = any> = {
  CartItem?: CartItemResolvers<ContextType>;
  CartQuote?: CartQuoteResolvers<ContextType>;
  CartQuoteResult?: CartQuoteResultResolvers<ContextType>;
  Category?: CategoryResolvers<ContextType>;
  CheckoutSessionPayload?: CheckoutSessionPayloadResolvers<ContextType>;
  Mutation?: MutationResolvers<ContextType>;
  Order?: OrderResolvers<ContextType>;
  OrderConnection?: OrderConnectionResolvers<ContextType>;
  OrderLookup?: OrderLookupResolvers<ContextType>;
  PlacedOrder?: PlacedOrderResolvers<ContextType>;
  Product?: ProductResolvers<ContextType>;
  Query?: QueryResolvers<ContextType>;
  UserError?: UserErrorResolvers<ContextType>;
  Viewer?: ViewerResolvers<ContextType>;
};

