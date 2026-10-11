/**
 * 認証の方針の数値（サーバの設定・登録フォーム・文面・テストで同じ値を使うために、ここ 1 か所に置く）
 * ---------------------------------------------------
 * ブラウザのコード（登録フォームなど）も読むので、何も import しない（Better Auth や DB を引き込まない）。
 * Better Auth の既定と同じ値も、ここで明示して固定する（ライブラリの既定が変わっても、方針は黙って変わらない）。
 * 値の採否と理由は、段 3 の既定値の一覧（README の「認証」節）にある。
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
