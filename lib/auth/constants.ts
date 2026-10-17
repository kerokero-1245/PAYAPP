/**
 * 認証の方針の数値（サーバの設定・登録フォーム・文面・テストで同じ値を使うために、ここ 1 か所に置く）
 * ---------------------------------------------------
 * ブラウザのコード（登録フォームなど）も読むので、何も import しない（Better Auth や DB を引き込まない）。
 * Better Auth の既定と同じ値も、ここで明示して固定する（ライブラリの既定が変わっても、方針は黙って変わらない）。
 * 値の採否と理由は、段 3 の既定値の一覧（docs/auth.md の「認証」節）にある。
 */

/** Better Auth の Route Handler を置くパス（app/api/auth/[...all]/route.ts）。クライアントも同じ場所に問い合わせる */
export const AUTH_BASE_PATH = "/api/auth";

/**
 * セッションの cookie の名前（Better Auth の既定。https の URL では前に `__Secure-` が付く）。
 * cookie の有無でセッションを引きに行くかを決める（lib/auth/viewer.ts）ほか、プライバシーポリシーの文面とテストが使う
 */
export const SESSION_COOKIE_NAME = "better-auth.session_token";

/** パスワードの長さ（文字数）。サーバが検査し、登録フォームも同じ値で入力欄を制限する */
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;

const SECONDS_PER_DAY = 24 * 60 * 60;

/**
 * ログインの有効期間（日）。最後に使ってからこの日数で切れる。使い続ける限りは延びる
 * （絶対の期限は無い。Better Auth の既定と同じ。プライバシーポリシーの文面もこの値から作る）
 */
export const SESSION_EXPIRES_IN_DAYS = 7;
export const SESSION_EXPIRES_IN_SECONDS =
  SESSION_EXPIRES_IN_DAYS * SECONDS_PER_DAY;

/** セッションの有効期限を延ばす間隔（秒）。最後の更新からこれだけ経ってから使われたときに、期限を延ばして DB に書く */
export const SESSION_UPDATE_AGE_SECONDS = SECONDS_PER_DAY;

/**
 * 利用者が入れる値の長さの上限（文字数）。Better Auth は名前・画像の長さに上限を持たず、登録 1 回で数 MB を DB に置けてしまうので、
 * サーバ（databaseHooks。lib/auth/config.ts）が登録・更新のたびに検査する。登録フォームも同じ値で入力欄を制限する
 */
export const MAX_NAME_LENGTH = 50;
/** メールアドレスの長さ（RFC 5321 の上限と同じ） */
export const MAX_EMAIL_LENGTH = 254;
/** 画像の URL の長さ（画面には出さない項目なので、URL として十分な長さに留める） */
export const MAX_IMAGE_URL_LENGTH = 2048;
/** session.user_agent に保存する User-Agent の長さ。超えた分は切り捨てる（ログインのたびに行が増えるため） */
export const MAX_USER_AGENT_LENGTH = 256;
/** /api/auth/* が受ける本文の上限（バイト）。登録・ログインの本文は 1KB に満たない */
export const MAX_AUTH_BODY_BYTES = 16 * 1024;

/**
 * 試行回数の制限が接続元を決めるときに見るヘッダー（前から順に。値が 1 つの有効な IP になった最初のものを使う）。
 * Vercel は前段で x-real-ip と x-forwarded-for を接続元の IP に付け直す（利用者が送った値は信用しない）。
 * x-forwarded-for はローカル・E2E（幅ごとに値を変えて枠を分ける）のため。Vercel 以外の前段（追記型のプロキシ）に置くなら、
 * advanced.ipAddress.trustedProxies も要る（docs/auth.md の「認証」）
 */
export const IP_ADDRESS_HEADERS = ["x-real-ip", "x-forwarded-for"];
