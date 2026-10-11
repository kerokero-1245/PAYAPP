/**
 * 認証の失敗を、画面に出す日本語の 1 文にする（純粋な関数）
 * ---------------------------------------------------
 * Better Auth のクライアントが返す失敗（{ status, code }）と、通信そのものの失敗（例外）を受ける。
 * 方針:
 *  - ログインの失敗は、メールアドレスが無いのか、パスワードが違うのかを言い分けない（登録の有無を推測させない）
 *  - サーバの英語の message や例外の中身は画面に出さない（内部の言葉をそのまま見せない）
 *  - 新規登録の「登録済み」だけは、メールアドレスを確かめる手段（メール確認）が無いので、はっきり伝える
 *    （Better Auth も、メール確認を使わない構成では登録済みであることを返す）
 */
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "./constants.ts";

export type AuthAction = "sign-in" | "sign-up";

/** ログインの失敗（メールアドレスが無い・パスワードが違う・形が不正は、どれもこの 1 文） */
export const SIGN_IN_FAILED_MESSAGE = "メールアドレスかパスワードが違います";

/** 試行回数の制限（HTTP 429）に当たった */
export const TOO_MANY_ATTEMPTS_MESSAGE =
  "試行回数が多すぎます。しばらく待ってからもう一度お試しください";

/**
 * サーバが認証を処理できなかったとき（/api/auth/* の 500）の応答。理由（例外の中身）は入れない。
 * 画面に出す文ではない（authErrorMessage は 500 を既定の文にする）
 */
export const AUTH_UNAVAILABLE = {
  code: "AUTH_UNAVAILABLE",
  message: "認証を利用できません",
} as const;

/** 通信そのものが失敗した（サーバに届かなかった） */
export const NETWORK_FAILED_MESSAGE =
  "通信に失敗しました。時間をおいてもう一度お試しください";

/** サーバが送信元を信用せずに断った（HTTP 403。ページを開き直せば直る） */
export const REJECTED_MESSAGE =
  "送信できませんでした。ページを読み込み直してから、もう一度お試しください";

const SIGN_IN_UNAVAILABLE_MESSAGE =
  "ログインできませんでした。時間をおいてもう一度お試しください";
const SIGN_UP_UNAVAILABLE_MESSAGE =
  "登録できませんでした。時間をおいてもう一度お試しください";

/** 新規登録の失敗のうち、利用者が直せるもの（Better Auth のエラーコード → 文） */
export const SIGN_UP_MESSAGES: Readonly<Record<string, string>> = {
  USER_ALREADY_EXISTS:
    "このメールアドレスはすでに登録されています。ログインしてください",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
    "このメールアドレスはすでに登録されています。ログインしてください",
  PASSWORD_TOO_SHORT: `パスワードは ${MIN_PASSWORD_LENGTH} 文字以上にしてください`,
  PASSWORD_TOO_LONG: `パスワードは ${MAX_PASSWORD_LENGTH} 文字以内にしてください`,
  INVALID_EMAIL: "メールアドレスの形式が正しくありません",
};

/** 失敗から、読む 2 項目（HTTP ステータスとエラーコード）だけを取り出す。外から来る値なので unknown で受ける */
function readFailure(error: unknown): {
  status: number | undefined;
  code: string | undefined;
} {
  const probe = error as
    { status?: unknown; code?: unknown } | null | undefined;
  const status =
    typeof probe?.status === "number" &&
    Number.isInteger(probe.status) &&
    probe.status > 0
      ? probe.status
      : undefined;
  return {
    status,
    code: typeof probe?.code === "string" ? probe.code : undefined,
  };
}

/**
 * 認証の失敗（Better Auth のクライアントが返した { status, code }、または fetch の例外）を、画面に出す文にする。
 * HTTP ステータスが無いもの（例外）は通信の失敗。
 */
export function authErrorMessage(action: AuthAction, error: unknown): string {
  const { status, code } = readFailure(error);
  if (status === undefined) return NETWORK_FAILED_MESSAGE;
  if (status === 429) return TOO_MANY_ATTEMPTS_MESSAGE;
  if (status === 403) return REJECTED_MESSAGE;

  if (action === "sign-in") {
    // 401 は INVALID_EMAIL_OR_PASSWORD。400 はメールの形・パスワードが長すぎる。どれも言い分けない
    return status === 401 || status === 400
      ? SIGN_IN_FAILED_MESSAGE
      : SIGN_IN_UNAVAILABLE_MESSAGE;
  }
  return (code && SIGN_UP_MESSAGES[code]) || SIGN_UP_UNAVAILABLE_MESSAGE;
}
