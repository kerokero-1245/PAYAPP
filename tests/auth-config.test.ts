// 認証の設定・利用者・失敗の文（lib/auth/ の純粋な関数）のテスト。DB にも Better Auth にも触れない。実行: npm test
//
// なぜあるか: 認証は設定を間違えると、黙って弱い鍵で動いたり、別のサイトの URL を信用したりする。
// ここでは次を固定する。
//  - 本番では BETTER_AUTH_SECRET が無い・短い・開発用の固定の値なら、認証を作らずに例外にする（例外文に秘密の値を入れない）
//  - BETTER_AUTH_URL はオリジンだけ（パスやクエリがあると Better Auth はそれを基準の URL にしてしまう）
//  - ログイン中の利用者（Viewer）には、見せてよい id・email・name だけを載せる
//  - 失敗の文: ログインはメールアドレスの有無・パスワードの違いを言い分けず、英語の message や例外の中身を出さない
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DEV_AUTH_SECRET,
  MIN_PRODUCTION_SECRET_LENGTH,
  resolveAuthSettings,
} from "../lib/auth/config.ts";
import {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
} from "../lib/auth/constants.ts";
import {
  NETWORK_FAILED_MESSAGE,
  REJECTED_MESSAGE,
  SIGN_IN_FAILED_MESSAGE,
  SIGN_UP_MESSAGES,
  TOO_MANY_ATTEMPTS_MESSAGE,
  authErrorMessage,
} from "../lib/auth/messages.ts";
import { hasSessionCookie, toViewer } from "../lib/auth/viewer.ts";

/** 本番の秘密として通る長さの値（テスト用のダミー） */
const PRODUCTION_SECRET = "p".repeat(MIN_PRODUCTION_SECRET_LENGTH);

test("認証の設定: 本番では BETTER_AUTH_SECRET が必須で、無い・短い・開発用の固定の値は例外にする。例外文に秘密の値は入れない", () => {
  const production = { NODE_ENV: "production" };

  for (const secret of [
    undefined,
    "",
    "   ",
    "short-secret",
    "s".repeat(MIN_PRODUCTION_SECRET_LENGTH - 1),
    DEV_AUTH_SECRET,
  ]) {
    assert.throws(
      () => resolveAuthSettings({ ...production, BETTER_AUTH_SECRET: secret }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /BETTER_AUTH_SECRET/);
        // 例外文に、渡された秘密の値（短い・開発用のものを含む）を入れない
        if (secret?.trim()) assert.ok(!error.message.includes(secret.trim()));
        return true;
      },
      JSON.stringify(secret),
    );
  }

  // 32 文字以上のランダムな値なら通る。そのまま使う
  assert.deepEqual(
    resolveAuthSettings({
      ...production,
      BETTER_AUTH_SECRET: PRODUCTION_SECRET,
    }),
    { secret: PRODUCTION_SECRET, baseURL: undefined },
  );
});

test("認証の設定: 開発・テストでは BETTER_AUTH_SECRET が無ければ開発用の固定の値を使い、あればそれを使う", () => {
  for (const env of [{}, { NODE_ENV: "development" }, { NODE_ENV: "test" }]) {
    assert.equal(resolveAuthSettings(env).secret, DEV_AUTH_SECRET);
  }
  assert.equal(
    resolveAuthSettings({ BETTER_AUTH_SECRET: "  my-dev-secret  " }).secret,
    "my-dev-secret",
    "前後の空白は取る",
  );
  // 開発用の固定の値は公開されているので、本番で使えないことと同時に、十分な長さがあること（Better Auth が警告しない）を確かめる
  assert.ok(DEV_AUTH_SECRET.length >= MIN_PRODUCTION_SECRET_LENGTH);
});

test("認証の設定: BETTER_AUTH_URL はオリジンだけを受け付け（末尾の / は取る）、パス・クエリ・http(s) 以外・URL でない値は例外。空は未設定", () => {
  const url = (BETTER_AUTH_URL: string | undefined) =>
    resolveAuthSettings({ BETTER_AUTH_URL }).baseURL;

  assert.equal(url("https://example.com"), "https://example.com");
  assert.equal(url("https://example.com/"), "https://example.com");
  assert.equal(url("  http://localhost:3000  "), "http://localhost:3000");
  assert.equal(url("https://Example.COM:8443"), "https://example.com:8443");
  for (const unset of [undefined, "", "   "])
    assert.equal(url(unset), undefined);

  for (const invalid of [
    "example.com",
    "localhost:3000",
    "//example.com",
    "ftp://example.com",
    "javascript:alert(1)",
    "https://example.com/app",
    "https://example.com/api/auth",
    "https://example.com?x=1",
    "https://example.com/#top",
    "not a url",
  ]) {
    assert.throws(
      () => url(invalid),
      /BETTER_AUTH_URL/,
      JSON.stringify(invalid),
    );
  }
});

test("toViewer: セッションから、見せてよい id・email・name だけを取り出し、形が違えば null（ログインしていない扱い）", () => {
  const user = {
    id: "u1",
    email: "hanako@example.com",
    name: "山田 花子",
    emailVerified: false,
    image: null,
    createdAt: new Date(),
  };
  // セッションの行（token・IP・userAgent）や、利用者のそのほかの項目は載せない
  const session = { token: "secret-token", ipAddress: "203.0.113.1" };
  assert.deepEqual(toViewer({ session, user }), {
    id: "u1",
    email: "hanako@example.com",
    name: "山田 花子",
  });

  for (const notSession of [
    null,
    undefined,
    "session",
    1,
    [],
    {},
    { user: null },
    { user: "u1" },
    { user: { id: "", email: "a@example.com", name: "a" } },
    { user: { id: 1, email: "a@example.com", name: "a" } },
    { user: { id: "u1", email: null, name: "a" } },
    { user: { id: "u1", email: "a@example.com" } },
  ]) {
    assert.equal(toViewer(notSession), null, JSON.stringify(notSession));
  }
});

test("hasSessionCookie: セッションの cookie（https では __Secure- つき）があるときだけ true。無関係な cookie・名前が似た cookie・空は false", () => {
  const has = (cookie?: string) =>
    hasSessionCookie(new Headers(cookie === undefined ? {} : { cookie }));

  for (const cookie of [
    "better-auth.session_token=abc.def",
    "__Secure-better-auth.session_token=abc.def",
    "theme=dark; better-auth.session_token=abc.def",
    "theme=dark;better-auth.session_token=abc.def",
    "better-auth.session_token=abc.def; theme=dark",
    "a=1; __Secure-better-auth.session_token=abc.def; b=2",
  ]) {
    assert.equal(has(cookie), true, cookie);
  }
  for (const cookie of [
    undefined,
    "",
    "theme=dark",
    "__vercel_live_token=x; __prerender_bypass=y",
    // セッションの cookie ではない（キャッシュの cookie・名前が似たもの・名前の途中・値の中）
    "better-auth.session_data=abc",
    "better-auth.session_token_x=abc",
    "better-auth-session_token=abc",
    "xbetter-auth.session_token=abc",
    "note=better-auth.session_token=abc",
  ]) {
    assert.equal(has(cookie), false, String(cookie));
  }
});

test("認証の失敗の文: ログインは、メールアドレスが無い・パスワードが違う・形が不正を、すべて同じ 1 文にする", () => {
  // Better Auth のクライアントが返す失敗の形（{ status, code, message }）。英語の message は画面に出さない
  const failures = [
    {
      status: 401,
      code: "INVALID_EMAIL_OR_PASSWORD",
      message: "Invalid email or password",
    },
    { status: 400, code: "INVALID_EMAIL", message: "Invalid email" },
    { status: 400, code: "PASSWORD_TOO_LONG", message: "Password too long" },
  ];
  for (const failure of failures) {
    assert.equal(authErrorMessage("sign-in", failure), SIGN_IN_FAILED_MESSAGE);
  }
  assert.equal(SIGN_IN_FAILED_MESSAGE, "メールアドレスかパスワードが違います");
});

test("認証の失敗の文: 試行回数の制限・送信元の拒否・通信の失敗・サーバの失敗は、ログインと登録で同じ扱い。内部の言葉を出さない", () => {
  for (const action of ["sign-in", "sign-up"] as const) {
    assert.equal(
      authErrorMessage(action, { status: 429, message: "Too many requests" }),
      TOO_MANY_ATTEMPTS_MESSAGE,
    );
    assert.equal(
      authErrorMessage(action, { status: 403, code: "INVALID_ORIGIN" }),
      REJECTED_MESSAGE,
    );
    // fetch の例外（HTTP ステータスが無い）は通信の失敗
    for (const thrown of [
      new TypeError("Failed to fetch"),
      null,
      undefined,
      "x",
      { status: 0 },
    ]) {
      assert.equal(authErrorMessage(action, thrown), NETWORK_FAILED_MESSAGE);
    }
    // 500 など: 英語の message や例外の中身は出さず、あとでもう一度の案内にする
    const unavailable = authErrorMessage(action, {
      status: 500,
      message: 'relation "user" does not exist',
    });
    assert.ok(!/relation|user|exist/i.test(unavailable), unavailable);
    assert.match(unavailable, /時間をおいてもう一度/);
  }
});

test("認証の失敗の文: 新規登録は、登録済み・パスワードの長さ・メールの形を利用者が直せる文にし、そのほかは既定の文にする", () => {
  const message = (code: string, status = 422) =>
    authErrorMessage("sign-up", { status, code });

  assert.equal(
    message("USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL"),
    "このメールアドレスはすでに登録されています。ログインしてください",
  );
  assert.equal(
    message("USER_ALREADY_EXISTS"),
    SIGN_UP_MESSAGES.USER_ALREADY_EXISTS,
  );
  assert.equal(
    message("PASSWORD_TOO_SHORT", 400),
    `パスワードは ${MIN_PASSWORD_LENGTH} 文字以上にしてください`,
  );
  assert.equal(
    message("PASSWORD_TOO_LONG", 400),
    `パスワードは ${MAX_PASSWORD_LENGTH} 文字以内にしてください`,
  );
  assert.equal(
    message("INVALID_EMAIL", 400),
    "メールアドレスの形式が正しくありません",
  );
  // 知らないコードは、コードを画面に出さず、既定の文
  const unknown = message("SOMETHING_NEW", 422);
  assert.ok(!unknown.includes("SOMETHING_NEW"));
  assert.match(unknown, /登録できませんでした/);
});
