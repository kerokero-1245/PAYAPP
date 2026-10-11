/**
 * 利用者が入れる値の長さの検査（純粋な関数）
 * ---------------------------------------------------
 * Better Auth の databaseHooks（lib/auth/config.ts）と、登録フォーム（app/signup/SignupForm.tsx）が使う。
 * 上限の値は lib/auth/constants.ts。ブラウザのコードも読むので、Better Auth や DB を import しない。
 * 長さは「見た目の 1 文字」（サロゲートペアは 1 文字）で数える。
 */
import {
  MAX_EMAIL_LENGTH,
  MAX_IMAGE_URL_LENGTH,
  MAX_NAME_LENGTH,
  MAX_USER_AGENT_LENGTH,
} from "./constants.ts";

/** 長さの違反。code は Better Auth のエラー応答の code、message は応答の message（利用者が直せる文） */
export type UserFieldViolation = { code: string; message: string };

export const USER_FIELD_ERRORS = {
  name: {
    code: "NAME_TOO_LONG",
    message: `表示名は ${MAX_NAME_LENGTH} 文字以内にしてください`,
  },
  email: {
    code: "EMAIL_TOO_LONG",
    message: `メールアドレスは ${MAX_EMAIL_LENGTH} 文字以内にしてください`,
  },
  image: {
    code: "IMAGE_TOO_LONG",
    message: `画像の URL は ${MAX_IMAGE_URL_LENGTH} 文字以内にしてください`,
  },
} as const satisfies Record<string, UserFieldViolation>;

/** 文字数が limit を超えるか。巨大な文字列を配列に展開しないよう、長さで先に決められるものは決める */
export function exceedsLength(value: string, limit: number): boolean {
  if (value.length <= limit) return false;
  // 1 文字は最大 2 コードユニット（サロゲートペア）なので、これを超えれば文字数でも超えている
  if (value.length > limit * 2) return true;
  return Array.from(value).length > limit;
}

/** 先頭から limit 文字までに切り詰める（サロゲートペアを割らない） */
export function clipLength(value: string, limit: number): string {
  return exceedsLength(value, limit)
    ? Array.from(value).slice(0, limit).join("")
    : value;
}

/** 登録・更新の値（name・email・image）のうち、上限を超えるものがあれば最初の 1 つの違反を返す。文字列でない値は見ない */
export function findUserFieldViolation(fields: {
  name?: unknown;
  email?: unknown;
  image?: unknown;
}): UserFieldViolation | null {
  const checks = [
    ["name", MAX_NAME_LENGTH],
    ["email", MAX_EMAIL_LENGTH],
    ["image", MAX_IMAGE_URL_LENGTH],
  ] as const;
  for (const [key, limit] of checks) {
    const value = fields[key];
    if (typeof value === "string" && exceedsLength(value, limit)) {
      return USER_FIELD_ERRORS[key];
    }
  }
  return null;
}

/** session.user_agent に保存する User-Agent。上限を超える分は捨てる（文字列でなければ空） */
export function clipUserAgent(value: unknown): string {
  return typeof value === "string"
    ? clipLength(value, MAX_USER_AGENT_LENGTH)
    : "";
}

/** 登録フォームが送る表示名を、上限の長さまでにする（空ならメールの @ より前を使うので、長いメールでも登録できるように） */
export function clipName(value: string): string {
  return clipLength(value, MAX_NAME_LENGTH);
}
