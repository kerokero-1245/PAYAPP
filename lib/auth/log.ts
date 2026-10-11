/**
 * Better Auth のログと、想定外の例外の扱い
 * ---------------------------------------------------
 * Better Auth の既定のログは、例外をそのまま console に渡す。DB の失敗では、Drizzle の例外が SQL の引数（パスワードのハッシュ・
 * メールアドレス）を持つので、そのままサーバのログに残ってしまう。ここでは、メッセージの先頭 1 行と、例外の名前・コード
 * （SQLSTATE など）だけを 1 行の JSON にして出し、例外の本体と引数は捨てる（lib/log.ts）。
 *  - logAuthMessage: createAuth の logger.log
 *  - handleAuthError: createAuth の onAPIError.onError。想定外の例外（API エラーでないもの）は、better-call が
 *    console.error("# SERVER_ERROR:", 例外) と出してしまう（Better Auth のログの設定が効かない）ので、その前にここで受ける
 */
import { APIError, isAPIError } from "better-auth/api";
import { describeError, firstLine, logEvent } from "../log.ts";
import { AUTH_UNAVAILABLE } from "./messages.ts";

/** createAuth の logger.log に渡す。level は Better Auth が渡す debug / info / warn / error */
export function logAuthMessage(
  level: "debug" | "info" | "warn" | "error",
  message: string,
  ...args: unknown[]
): void {
  const detail = args.find(
    (arg): arg is object => typeof arg === "object" && arg !== null,
  );
  logEvent(level === "error" || level === "warn" ? level : "info", "auth.log", {
    message: firstLine(message),
    ...(detail === undefined ? {} : describeError(detail)),
  });
}

/**
 * createAuth の onAPIError.onError に渡す。
 *  - API エラー（401・422・429 など、Better Auth が応答にするもの）は何もしない。5xx のものだけ記録する
 *  - それ以外の例外（DB の失敗など）は、名前とコードだけを記録して、理由を含まない 500 の API エラーに置き換える
 */
export function handleAuthError(error: unknown): void {
  if (isAPIError(error)) {
    if (error.statusCode >= 500) {
      logEvent("error", "auth.api-error", { status: error.statusCode });
    }
    return;
  }
  logEvent("error", "auth.unhandled", describeError(error));
  throw APIError.from("INTERNAL_SERVER_ERROR", AUTH_UNAVAILABLE);
}
