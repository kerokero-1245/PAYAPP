// /api/auth/* で Better Auth が受ける口の一覧のテスト。実行: npm test
//
// なぜあるか: app/api/auth/[...all]/route.ts は Better Auth の口をすべて同じ入口で受ける。画面が使うのは登録・ログイン・ログアウト・
// セッションの取得の 4 つだけだが、update-user・change-password・list-sessions なども、ログイン中の本人なら呼べる。
// README の「公開している口」の表は、ここで確かめた結果を書いたもの。Better Auth を上げて口が増えたとき・設定していない機能が
// 使えるようになったときに、このテストが落ちて気付けるようにする（表を読み直す）。
import assert from "node:assert/strict";
import { test } from "node:test";

import { withTestDb } from "../lib/db/test-helpers.ts";
import {
  SAMPLE_USER,
  authRequest,
  createTestAuth,
  signUp,
} from "./support/auth.ts";

/** auth.api の 1 口（path が無いものはサーバの中からだけ呼べる口） */
type Endpoint = {
  path?: string;
  options?: {
    method?: string | string[];
    metadata?: { SERVER_ONLY?: boolean };
  };
};

/** README の「公開している口」の表のとおり。Better Auth が HTTP で受ける口 */
const PUBLISHED = [
  "POST /sign-in/social",
  "GET|POST /callback/:id",
  "GET|POST /get-session",
  "POST /sign-out",
  "POST /sign-up/email",
  "POST /sign-in/email",
  "POST /reset-password",
  "POST /verify-password",
  "GET /verify-email",
  "POST /send-verification-email",
  "POST /change-email",
  "POST /change-password",
  "POST /update-session",
  "POST /update-user",
  "POST /delete-user",
  "POST /request-password-reset",
  "GET /reset-password/:token",
  "GET /list-sessions",
  "POST /revoke-session",
  "POST /revoke-sessions",
  "POST /revoke-other-sessions",
  "POST /link-social",
  "GET /list-accounts",
  "GET /delete-user/callback",
  "POST /unlink-account",
  "POST /refresh-token",
  "POST /get-access-token",
  "GET /account-info",
  "GET /ok",
  "GET /error",
];

test("公開している口: Better Auth が HTTP で受ける口は、README の「公開している口」の表と同じ（口が増えたら気付く）", () =>
  withTestDb(async ({ db }) => {
    const auth = createTestAuth(db);
    const routes = Object.values(auth.api as Record<string, Endpoint>)
      .filter(
        (endpoint) => endpoint.path && !endpoint.options?.metadata?.SERVER_ONLY,
      )
      .map(
        (endpoint) =>
          `${[endpoint.options?.method].flat().join("|")} ${endpoint.path}`,
      );
    assert.deepEqual(routes.sort(), [...PUBLISHED].sort());
  }));

test("公開している口: ログイン中の本人だけが使える口は未ログインでは 401。設定していない機能（外部ログイン・メール確認・再設定・メールの変更・退会）は、ログイン中でも失敗する", () =>
  withTestDb(async ({ db }) => {
    const auth = createTestAuth(db);
    const { cookie } = await signUp(auth);
    const statusOf = async (
      method: string,
      path: string,
      body?: unknown,
      headers?: Record<string, string>,
    ) =>
      (await auth.handler(authRequest(path, { method, body, headers }))).status;

    // 本人だけ: cookie が無ければ 401
    for (const [method, path, body] of [
      ["POST", "/update-user", { name: "x" }],
      ["POST", "/change-password", { currentPassword: "x", newPassword: "y" }],
      ["POST", "/verify-password", { password: "x" }],
      ["GET", "/list-sessions"],
      ["POST", "/revoke-session", { token: "x" }],
      ["POST", "/revoke-sessions", {}],
      ["POST", "/revoke-other-sessions", {}],
      ["GET", "/list-accounts"],
    ] as const) {
      assert.equal(
        await statusOf(method, path, body),
        401,
        `${method} ${path}`,
      );
    }

    // 設定していない機能: ログイン中（cookie あり）でも成功しない
    for (const [method, path, body] of [
      ["POST", "/sign-in/social", { provider: "github" }],
      ["POST", "/link-social", { provider: "github" }],
      ["POST", "/change-email", { newEmail: "new@example.com" }],
      ["POST", "/delete-user", {}],
      ["POST", "/send-verification-email", { email: SAMPLE_USER.email }],
      ["POST", "/request-password-reset", { email: SAMPLE_USER.email }],
      ["POST", "/reset-password", { newPassword: "zzzzzzzzzz", token: "x" }],
      ["GET", "/verify-email?token=x"],
    ] as const) {
      const status = await statusOf(method, path, body, { cookie });
      assert.ok(status >= 400 && status < 500, `${method} ${path}: ${status}`);
    }
  }));
