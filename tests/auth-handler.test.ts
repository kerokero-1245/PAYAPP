// /api/auth/* の入口（lib/auth/handler.ts の handleAuthRequest）のテスト。実行: npm test
//
// なぜあるか: 登録は匿名で呼べて、Better Auth は本文の大きさを見ない（実測で 4 MiB の本文を受けて DB に置いた）。
// 入口で本文を 16KB までに絞り、超えるものは Better Auth にも DB にも触れずに 413 で断る。
// あわせて、app/api/auth/[...all]/route.ts が包んでいる部分（Better Auth を作れないとき・想定外の例外のときの 500、
// 通常の要求がそのまま通ること）を、route.ts を import できない node --test の代わりに、本体の関数で確かめる。
import assert from "node:assert/strict";
import { test } from "node:test";

import type { Auth } from "../lib/auth/config.ts";
import { MAX_AUTH_BODY_BYTES } from "../lib/auth/constants.ts";
import { handleAuthRequest } from "../lib/auth/handler.ts";
import { AUTH_UNAVAILABLE } from "../lib/auth/messages.ts";
import { session, user } from "../lib/db/schema.ts";
import { withTestDb } from "../lib/db/test-helpers.ts";
import {
  SAMPLE_USER,
  TEST_ORIGIN,
  authRequest,
  createTestAuth,
  readJson,
} from "./support/auth.ts";
import { captureConsole } from "./support/console.ts";

const SIGN_UP = `${TEST_ORIGIN}/api/auth/sign-up/email`;

/** 本文の長さがちょうど bytes バイトになる、登録の JSON（余りの項目 padding で長さを合わせる。Better Auth は余りの項目を無視する） */
function signUpBodyOfSize(bytes: number): string {
  const base = {
    name: SAMPLE_USER.name,
    email: SAMPLE_USER.email,
    password: SAMPLE_USER.password,
    padding: "",
  };
  const empty = Buffer.byteLength(JSON.stringify(base));
  const body = JSON.stringify({ ...base, padding: "p".repeat(bytes - empty) });
  assert.equal(Buffer.byteLength(body), bytes);
  return body;
}

function post(body: string, headers: Record<string, string> = {}): Request {
  return new Request(SIGN_UP, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: TEST_ORIGIN,
      ...headers,
    },
    body,
  });
}

/** getAuth を差し込む。呼ばれた回数も数える */
function authSource(auth: Auth) {
  const state = { calls: 0 };
  return {
    state,
    getAuth: async () => {
      state.calls += 1;
      return auth;
    },
  };
}

test("入口: 本文が上限（16KB）を超える登録は 413 で断り、Better Auth にも DB にも触れない。上限ちょうどの本文は通る", () =>
  withTestDb(async ({ db }) => {
    const source = authSource(createTestAuth(db));

    // 申告された content-length が上限を超える: 本文を読まずに断る
    const declared = await handleAuthRequest(
      post("{}", { "content-length": String(4 * 1024 * 1024) }),
      source.getAuth,
    );
    assert.equal(declared.status, 413);
    assert.equal(declared.headers.get("cache-control"), "no-store");
    assert.deepEqual(await readJson(declared), {
      code: "PAYLOAD_TOO_LARGE",
      message: "リクエストが大きすぎます",
    });

    // 申告が無い（または偽り）でも、実際に読んだ長さが上限を超えれば断る
    const streamed = await handleAuthRequest(
      post(signUpBodyOfSize(MAX_AUTH_BODY_BYTES + 1)),
      source.getAuth,
    );
    assert.equal(streamed.status, 413);
    const big = await handleAuthRequest(
      post(JSON.stringify({ name: "x".repeat(4 * 1024 * 1024) })),
      source.getAuth,
    );
    assert.equal(big.status, 413);

    assert.equal(source.state.calls, 0, "Better Auth を作る前に断る");
    assert.deepEqual(await db.select().from(user), []);

    // 上限ちょうど: 通って、登録できる
    const exact = await handleAuthRequest(
      post(signUpBodyOfSize(MAX_AUTH_BODY_BYTES)),
      source.getAuth,
    );
    assert.equal(exact.status, 200);
    assert.ok(exact.headers.getSetCookie().length > 0);
    assert.equal((await db.select().from(user)).length, 1);
    assert.equal((await db.select().from(session)).length, 1);
  }));

test("入口: 通常の要求（GET のセッション取得・JSON の登録・ログイン）はそのまま Better Auth に渡り、cookie も応答も変わらない", () =>
  withTestDb(async ({ db }) => {
    const { getAuth } = authSource(createTestAuth(db));
    const send = (path: string, init?: Parameters<typeof authRequest>[1]) =>
      handleAuthRequest(authRequest(path, init), getAuth);

    const signUp = await send("/sign-up/email", { body: SAMPLE_USER });
    assert.equal(signUp.status, 200);
    const cookie = signUp.headers
      .getSetCookie()
      .map((line) => line.split(";")[0])
      .join("; ");

    const current = await send("/get-session", { headers: { cookie } });
    assert.equal(current.status, 200);
    const body = (await readJson(current)) as {
      user?: { email?: string };
    } | null;
    assert.equal(body?.user?.email, SAMPLE_USER.email);

    const wrong = await send("/sign-in/email", {
      body: { email: SAMPLE_USER.email, password: "wrong-password-0000" },
    });
    assert.equal(wrong.status, 401);
    const right = await send("/sign-in/email", {
      body: { email: SAMPLE_USER.email, password: SAMPLE_USER.password },
    });
    assert.equal(right.status, 200);

    // 本文のない GET は、本文を読まずに渡す
    const guest = await send("/get-session");
    assert.equal(guest.status, 200);
    assert.equal(await guest.text(), "null");
  }));

test("入口: Better Auth を作れないとき（秘密が無い・DB に繋がらない）は、理由を応答に出さず 500。ログには名前とメッセージの先頭 1 行だけ", async () => {
  const capture = captureConsole();
  let response: Response;
  try {
    response = await handleAuthRequest(post("{}"), async () => {
      throw Object.assign(
        new Error(
          "BETTER_AUTH_SECRET が必要です\npostgres://user:password@host/db",
        ),
        { code: "ECONNREFUSED" },
      );
    });
  } finally {
    capture.restore();
  }
  assert.equal(response.status, 500);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await readJson(response), AUTH_UNAVAILABLE);
  assert.deepEqual(capture.events(), [
    {
      level: "error",
      event: "auth.setup-failed",
      errorName: "Error",
      errorCode: "ECONNREFUSED",
      message: "BETTER_AUTH_SECRET が必要です",
    },
  ]);
  assert.ok(!capture.text().includes("password"));
});

test("入口: Better Auth の handler が想定外の例外で失敗しても、理由を応答に出さず 500。ログには例外の名前とコードだけ", async () => {
  const failing = {
    handler: async () => {
      throw Object.assign(new Error("leak: a@example.com hash:abc"), {
        code: "XX000",
      });
    },
  } as unknown as Auth;
  const capture = captureConsole();
  let response: Response;
  try {
    response = await handleAuthRequest(post("{}"), async () => failing);
  } finally {
    capture.restore();
  }
  assert.equal(response.status, 500);
  assert.deepEqual(await readJson(response), AUTH_UNAVAILABLE);
  assert.deepEqual(capture.events(), [
    {
      level: "error",
      event: "auth.unhandled",
      errorName: "Error",
      errorCode: "XX000",
    },
  ]);
  assert.ok(!capture.text().includes("a@example.com"));
});
