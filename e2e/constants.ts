/**
 * E2E で共有する定数（URL・ビューポート・テスト用の session id・Stripe の実通信を許す条件）
 * ---------------------------------------------------
 * playwright.config.ts も import する（ポートと幅を 1 か所にするため）ので、Playwright の値は import しない。
 */

/** `next start` を立てるポート（撮影スクリプトが使う 3101〜3103 と分ける） */
export const PORT = 3210;
export const BASE_URL = `http://localhost:${PORT}`;

/** プロジェクトの幅（撮影の幅と同じ 390 / 1280）。高さは見た目の確認には使わない */
export const VIEWPORTS = {
  mobile: { width: 390, height: 844 },
  desktop: { width: 1280, height: 800 },
} as const;

/** Tailwind の md（48rem）。これ未満はヘッダーの検索欄がメニューの中に入り、サイドメニューが出ない */
export const MD_MIN_WIDTH = 768;

/** 画面の URL（アプリの Route と同じ） */
export const PATHS = {
  home: "/",
  products: "/product",
  cart: "/cart",
  success: "/success",
  orders: "/orders",
  login: "/login",
  account: "/account",
  contact: "/contact",
} as const;

/** 決済の確認で使う session id（実在しない値。モックと実サーバの形の検査にだけ使う） */
export const SESSION_IDS = {
  paid: "cs_test_e2e_paid",
  unpaid: "cs_test_e2e_unpaid",
  unverified: "cs_test_e2e_unverified",
  /** cs_ で始まらない形。確認ルートが Stripe を呼ばずに 400 を返す */
  malformed: "bad",
} as const;

/**
 * 決済の確認のモックが返す注文番号（本物はサーバが DB に確定した番号。ORD- と英大文字・数字）。
 * 画面に出る番号がこの値であることで、「注文番号はブラウザが作らず、確認ルートの応答のもの」を確かめる
 */
export const ORDER_NO = "ORD-E2ETESTPAID";

/**
 * E2E のサーバ（next start）が使う PGlite の保存先。開発の .pglite/ と取り合わないよう専用にする。
 * 本番ビルドは DATABASE_URL が無いと DB を開かない（lib/db/connect.ts）ので、PGLITE_DATA_DIR で明示して渡す。
 * 画面の操作ではサーバの DB まで届かない（決済の確認はモックする）が、サーバが DB を使う導線を足したときのために、
 * サーバを立てる前にマイグレーションと seed を当てておく（playwright.config.ts）。
 */
export const E2E_PGLITE_DIR = ".pglite-e2e";

/** Stripe のモックが返す決済ページの URL（遷移先もモックで返すので、外には出ない） */
export const CHECKOUT_REDIRECT_URL =
  "https://checkout.stripe.com/c/pay/cs_test_e2e";

/** 実際の Stripe に通信するテストにだけ付けるタグ（`--grep @stripe` で選べる） */
export const STRIPE_TAG = "@stripe";

/**
 * 実際の Stripe に通信するテストを動かす条件。`STRIPE_SECRET_KEY` と `E2E_STRIPE=1` の両方があるときだけ。
 * `.env.local` にキーがあるだけでは回さない（意図せず Stripe に通信しないため）。
 */
export const STRIPE_ENABLED =
  Boolean(process.env.STRIPE_SECRET_KEY) && process.env.E2E_STRIPE === "1";
