/**
 * /api/auth/* の入口（app/api/auth/[...all]/route.ts が呼ぶ。Better Auth の handler の前に、本文の大きさを見る）
 * ---------------------------------------------------
 * 登録（POST /api/auth/sign-up/email）は匿名で呼べて、Better Auth は本文の大きさを見ない。実測で 4 MiB の本文を受けて DB に置いた
 * （Vercel の本文の上限 4.5MB まで通る）。そこで、本文を持つ要求は MAX_AUTH_BODY_BYTES（16KB）までしか読まず、
 * 超えるものは Better Auth にも DB にも触れずに 413 で断る（申告された content-length が超えていれば、読まずに断る）。
 * 登録・ログインの本文は 1KB に満たない。読み終えた本文で Request を作り直して渡す（URL・ヘッダーはそのまま）。
 *
 * Better Auth を作れなかったとき（本番で BETTER_AUTH_SECRET が無い・DB に繋がらないなど）は、理由を応答に出さず 500 にする。
 * 想定外の例外は、名前とコードだけを記録する（例外ごと console に出すと、SQL の引数に入っているパスワードのハッシュやメールが
 * ログに残る。lib/auth/log.ts）。
 * 使える入口（/api/auth/ の下）は docs/auth.md の「認証」の表のとおり。
 */
import {
  BAD_REQUEST,
  NO_STORE,
  TOO_LARGE,
  readBodyWithLimit,
} from "../checkout-session.ts";
import { describeError, firstLine, logEvent } from "../log.ts";
import type { Auth } from "./config.ts";
import { MAX_AUTH_BODY_BYTES } from "./constants.ts";
import { AUTH_UNAVAILABLE } from "./messages.ts";

function failure(
  status: number,
  body: { code: string; message: string },
): Response {
  return Response.json(body, { status, headers: NO_STORE });
}

/** Better Auth の応答が返らなかった（作れなかった・想定外の例外）ときの 500。理由は入れない */
function unavailable(): Response {
  return failure(500, AUTH_UNAVAILABLE);
}

/**
 * 本文を持つ要求（GET・HEAD 以外）の本文を上限つきで読み、読み終えた本文の Request を返す。
 * 上限を超える・読めないときは、そのまま返せる応答（413・400）を返す。
 */
async function limitBody(request: Request): Promise<Request | Response> {
  if (request.method === "GET" || request.method === "HEAD") return request;
  let text: string | null;
  try {
    text = await readBodyWithLimit(request, MAX_AUTH_BODY_BYTES);
  } catch {
    return failure(400, { code: "BAD_REQUEST", message: BAD_REQUEST });
  }
  if (text === null) {
    return failure(413, { code: "PAYLOAD_TOO_LARGE", message: TOO_LARGE });
  }
  // 読み終えた本文で作り直す。申告された content-length は消す（作り直した本文の長さで決まる）
  const headers = new Headers(request.headers);
  headers.delete("content-length");
  return new Request(request.url, {
    method: request.method,
    headers,
    body: text,
    signal: request.signal,
  });
}

/** /api/auth/* の要求を、本文の大きさを見てから Better Auth に渡す。getAuth は Better Auth を返す関数（lib/auth/server.ts） */
export async function handleAuthRequest(
  request: Request,
  getAuth: () => Promise<Auth>,
): Promise<Response> {
  const limited = await limitBody(request);
  if (limited instanceof Response) return limited;

  let auth: Auth;
  try {
    auth = await getAuth();
  } catch (cause) {
    // 本番で秘密が無い・DB に繋がらないなど。原因を追えるよう message の先頭 1 行は残す（設定の不備を言う文で、利用者の値は入らない）。
    // スタックは出さない
    logEvent("error", "auth.setup-failed", {
      ...describeError(cause),
      message: cause instanceof Error ? firstLine(cause.message) : undefined,
    });
    return unavailable();
  }
  try {
    return await auth.handler(limited);
  } catch (cause) {
    logEvent("error", "auth.unhandled", describeError(cause));
    return unavailable();
  }
}
