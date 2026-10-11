import { handleAuthRequest } from "@/lib/auth/handler";
import { getAuth } from "@/lib/auth/server";

// Node ランタイムで動かす（パスワードのハッシュは node:crypto の scrypt、DB の接続は Neon の Pool / PGlite）
export const runtime = "nodejs";

/**
 * 認証: /api/auth/*（Better Auth）
 * 画面が使う口: 登録 POST /api/auth/sign-up/email・ログイン POST /api/auth/sign-in/email・ログアウト POST /api/auth/sign-out・
 * セッションの取得 GET /api/auth/get-session。cookie の発行と削除・試行回数の制限・送信元（Origin）の検査は Better Auth が行う。
 * Better Auth は、ほかにも /api/auth/ の下に次の口を同じ入口で受ける（ログイン中の本人だけが使えるもの。画面には出していない）:
 *   POST update-user（表示名・画像。長さの上限つき）・POST change-password・POST verify-password・GET list-sessions（自分のセッションの
 *   token・IP・User-Agent を返す）・POST revoke-session / revoke-sessions / revoke-other-sessions・GET list-accounts・GET account-info・
 *   POST update-session。
 * 設定していないので失敗する口: ソーシャルログインの sign-in/social・callback・link-social・unlink-account・refresh-token・
 * get-access-token、メールの確認・パスワードの再設定の verify-email・send-verification-email・request-password-reset・reset-password、
 * change-email・delete-user（無効）。ほかに GET ok と GET error。一覧は README の「認証」。
 * 本文を持つ要求は 16KB まで（超えたら 413。本体は lib/auth/handler.ts）。設定は lib/auth/config.ts、
 * Better Auth を作るのは lib/auth/server.ts の getAuth。
 * 認証を作れなかったとき（本番で BETTER_AUTH_SECRET が無い・DB に繋がらないなど）は、理由を応答に出さず 500 にする。
 */
const handle = (request: Request) => handleAuthRequest(request, getAuth);

export const GET = handle;
export const POST = handle;
