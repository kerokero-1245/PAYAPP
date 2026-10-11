/**
 * ログイン中の利用者（Viewer）を、Better Auth のセッションから引く
 * ---------------------------------------------------
 * 画面（/account・/login）・GraphQL の viewer・購入手続き（client_reference_id）が見る利用者は、この形 1 つ（lib/types.ts の Viewer）。
 * セッションに載っている項目のうち、見せてよい id・email・name だけを取り出す（パスワードのハッシュや IP は載せない）。
 * Better Auth の本体は引数で受ける（lib/auth/server.ts の getAuth は server-only でテストから読めない）。
 */
import type { Viewer } from "../types.ts";
import type { Auth } from "./config.ts";
import { SESSION_COOKIE_NAME } from "./constants.ts";

/** Cookie ヘッダーに、セッションの cookie（https では __Secure- が前に付く）が含まれるか */
const SESSION_COOKIE = new RegExp(
  `(?:^|;\\s*)(?:__Secure-)?${SESSION_COOKIE_NAME.replace(".", "\\.")}=`,
);

/** リクエストがセッションの cookie を持っているか（持っていなければ、ログインしているはずがない） */
export function hasSessionCookie(requestHeaders: Headers): boolean {
  return SESSION_COOKIE.test(requestHeaders.get("cookie") ?? "");
}

/**
 * auth.api.getSession の結果（セッションが無ければ null）から利用者を作る。
 * 外から来る値なので unknown で受けて絞る。形が違えば null（ログインしていない扱い）。
 */
export function toViewer(session: unknown): Viewer | null {
  const user = (session as { user?: unknown } | null | undefined)?.user;
  if (typeof user !== "object" || user === null) return null;
  const { id, email, name } = user as Record<string, unknown>;
  if (
    typeof id !== "string" ||
    id === "" ||
    typeof email !== "string" ||
    typeof name !== "string"
  ) {
    return null;
  }
  return { id, email, name };
}

/**
 * リクエストのヘッダーから、ログイン中の利用者を引く（ログインしていなければ null）。
 *  - セッションの識別子は cookie にしかないので、セッションの cookie が無ければ getAuth も DB も呼ばずに null を返す
 *    （ログインしていない人の GraphQL の要求が DB に触れない。無関係な cookie だけを持つ人も同じ）
 *  - セッションの期限の延長（DB への書き込み）はしない（disableRefresh）。延長は /api/auth/get-session を通ったときに、
 *    cookie の期限と一緒に行う。サーバコンポーネントからは cookie を書き換えられないので、ここで延ばすと DB だけ延びて食い違う
 *  - 期限切れ・署名が合わない・存在しないセッションは null。DB に繋げないなど引けなかったときは例外を投げる（呼び出し側が失敗として扱う）
 */
export async function viewerFromHeaders(
  getAuth: () => Promise<Auth>,
  requestHeaders: Headers,
): Promise<Viewer | null> {
  if (!hasSessionCookie(requestHeaders)) return null;
  const auth = await getAuth();
  const session = await auth.api.getSession({
    headers: requestHeaders,
    query: { disableRefresh: true },
  });
  return toViewer(session);
}
