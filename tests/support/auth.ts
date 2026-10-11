/**
 * 認証のテストの道具（Better Auth を、テスト用の PGlite の DB で本物のまま動かす）
 * ---------------------------------------------------
 * 本物の Better Auth（lib/auth/config.ts の createAuth）に、auth.handler(new Request(...)) で /api/auth/* を送る。
 * ブラウザの代わりに、Set-Cookie を受けて次の要求の Cookie に付ける（cookieHeader）。外部のサービスにも通信しない。
 * `tests/*.test.ts` のグロブには当たらないので、テストとしては実行されない。
 */
import { createAuth } from "../../lib/auth/config.ts";
import type { Auth, AuthSettings } from "../../lib/auth/config.ts";
import { AUTH_BASE_PATH } from "../../lib/auth/constants.ts";
import type { Db } from "../../lib/db/connect.ts";

/** テスト用の固定のダミー秘密（本物の秘密ではない。32 文字以上で、Better Auth の強度の警告に当たらない長さと多様さ） */
export const TEST_AUTH_SECRET = "test-secret-5f3a9c7e1b2d4a6c8e0f1a3b5c7d9e1f";

/** テストのサイトのオリジン（BETTER_AUTH_URL にあたる） */
export const TEST_ORIGIN = "http://localhost:3000";

/** 登録するサンプルの利用者（パスワードは、DB に平文で残らないことを確かめるために、ほかの値と重ならない文字列にしてある） */
export const SAMPLE_USER = {
  name: "山田 花子",
  email: "hanako@example.com",
  password: "correct horse battery staple 2026",
};

/** テスト用の DB で動く Better Auth を作る（既定は固定の秘密と http://localhost:3000。settings で替えられる） */
export function createTestAuth(
  db: Db,
  settings: Partial<AuthSettings> = {},
): Auth {
  return createAuth(db, {
    secret: TEST_AUTH_SECRET,
    baseURL: TEST_ORIGIN,
    ...settings,
  });
}

type AuthRequestInit = {
  /** 省略すると、body があれば POST、なければ GET */
  method?: string;
  /** JSON にして送る */
  body?: unknown;
  /** ブラウザが付ける Origin（既定はテストのサイト自身。null なら付けない） */
  origin?: string | null;
  headers?: Record<string, string>;
  /** 要求の URL のオリジン（既定は TEST_ORIGIN） */
  base?: string;
};

/** /api/auth/<path> への要求。ブラウザの同一オリジンの fetch と同じく、JSON と Origin を付ける */
export function authRequest(
  path: string,
  { method, body, origin, headers, base = TEST_ORIGIN }: AuthRequestInit = {},
): Request {
  const requestHeaders = new Headers(headers);
  if (body !== undefined)
    requestHeaders.set("content-type", "application/json");
  const sent = origin === undefined ? base : origin;
  if (sent !== null && !requestHeaders.has("origin"))
    requestHeaders.set("origin", sent);
  return new Request(`${base}${AUTH_BASE_PATH}${path}`, {
    method: method ?? (body === undefined ? "GET" : "POST"),
    headers: requestHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** 応答の Set-Cookie の行（1 つ 1 行） */
export function setCookies(response: Response): string[] {
  return response.headers.getSetCookie();
}

/**
 * 応答の Set-Cookie を、次の要求の Cookie ヘッダーにする（ブラウザの cookie の持ち方の代わり）。
 * 値が空のもの・Max-Age=0 のもの（= 削除の指示）は含めない。
 */
export function cookieHeader(response: Response): string {
  const pairs: string[] = [];
  for (const line of setCookies(response)) {
    const [pair = "", ...attributes] = line
      .split(";")
      .map((part) => part.trim());
    const value = pair.slice(pair.indexOf("=") + 1);
    const removed = attributes.some((a) => /^max-age=0$/i.test(a));
    if (value !== "" && !removed) pairs.push(pair);
  }
  return pairs.join("; ");
}

/** 応答の Set-Cookie のうち、名前が name で終わるもの（"better-auth.session_token" など。Secure のときの __Secure- を問わない） */
export function findSetCookie(
  response: Response,
  name: string,
): string | undefined {
  return setCookies(response).find((line) => {
    const cookieName = line.slice(0, line.indexOf("="));
    return cookieName === name || cookieName === `__Secure-${name}`;
  });
}

/** 登録する（メール + パスワード）。応答と、続く要求に付ける cookie を返す */
export async function signUp(
  auth: Auth,
  user: { name: string; email: string; password: string } = SAMPLE_USER,
  init: AuthRequestInit = {},
) {
  const response = await auth.handler(
    authRequest("/sign-up/email", { ...init, body: user }),
  );
  return { response, cookie: cookieHeader(response) };
}

/** ログインする。応答と、続く要求に付ける cookie を返す */
export async function signIn(
  auth: Auth,
  credentials: { email: string; password: string } = SAMPLE_USER,
  init: AuthRequestInit = {},
) {
  const response = await auth.handler(
    authRequest("/sign-in/email", {
      ...init,
      body: { email: credentials.email, password: credentials.password },
    }),
  );
  return { response, cookie: cookieHeader(response) };
}

/** 応答の JSON を読む（読めなければ null） */
export async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}
