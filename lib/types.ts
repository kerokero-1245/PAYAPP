/**
 * 共有するドメインの型（型だけ。実行時の値は置かない）
 * ---------------------------------------------------
 * 3 か所以上で使う型をここに集める。1 つのモジュールの中だけで使う型は、そのモジュールに置く。
 * GraphQL の境界の型は lib/graphql/__generated__/types.ts（SDL から生成）が正本で、ここの型とは別に持つ。
 * 名前が同じもの（Product・Order など）は、生成型の側を `import type { Product as GqlProduct }` のように別名で読む。
 *
 * localStorage から戻した値（カートの行・注文・モック認証の利用者）は、型で形を宣言しているだけで、
 * 実行時に形を保証するものではない（カートは reconcileCart で作り直すが、注文とログイン状態は検査しない）。
 */

/** カテゴリ（lib/catalog.ts の CATEGORIES の 1 件） */
export type Category = {
  slug: string;
  label: string;
  jp: string;
};

/** 商品（lib/catalog.ts の PRODUCTS の 1 件）。tagline・description・badge が無い商品もある */
export type Product = {
  id: string;
  name: string;
  /** 税込の円。整数 */
  price: number;
  category: string;
  tagline?: string;
  description?: string;
  /** NEW / LIMITED など */
  badge?: string;
  /** 絶対 URL（1 枚目がサムネイル） */
  images: string[];
};

/** カートに保持する 1 行。価格・商品名・画像・カテゴリは、カタログから id で引いた値 */
export type CartLine = {
  id: string;
  name: string;
  price: number;
  image: string | null;
  category: string | null;
  quantity: number;
};

/** 注文の 1 行（カートの行と同じ形。購入した時点のカタログの値を写したもの） */
export type OrderItem = CartLine;

/** 注文履歴の 1 件（新しい順に保持する） */
export type Order = {
  id: string;
  /** ISO 8601 */
  date: string;
  items: OrderItem[];
  total: number;
  /** 決済の確認が取れた注文だけが持つ（Stripe の Checkout Session の id） */
  sessionId?: string;
};

/** ログイン中の利用者（Better Auth のセッションから lib/auth/viewer.ts の toViewer が作る。GraphQL の Viewer と同じ項目） */
export type Viewer = {
  id: string;
  email: string;
  name: string;
};

/** ログイン中の利用者（モック認証。store/authStore.ts と E2E の seed だけが使う。ページを Better Auth に切り替えるコミットで、ストアと一緒に消す） */
export type User = {
  email: string;
  name: string;
};

/** お問い合わせフォームの入力値 */
export type ContactValues = {
  name: string;
  email: string;
  topic: string;
  orderId: string;
  message: string;
};

/** 品目と数量（購入内容から id と数量だけを取り出したもの） */
export type ItemQuantity = {
  id: string;
  quantity: number;
};

/**
 * 検査前の品目と数量（localStorage・リクエスト本文・確認ルートの応答から来た値）。
 * 形は未検査なので、読んだ項目は unknown。使う側が typeof などで絞ってから使う。
 */
export type RawItem = {
  id?: unknown;
  quantity?: unknown;
};

/** id から商品を引く関数（カタログに無ければ undefined。テストから差し替えられる） */
export type ProductLookup = (id: string) => Product | undefined;
