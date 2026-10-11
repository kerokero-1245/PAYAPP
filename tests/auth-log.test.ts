// 認証のログに、値（パスワードのハッシュ・メールアドレス・SQL の引数）が出ないことのテスト。実行: npm test
//
// なぜあるか: 登録の途中で DB が失敗すると、Better Auth は例外をそのままログに出す。Drizzle の例外は message と params に
// SQL の引数を持つので、INSERT の引数（パスワードの scrypt ハッシュ・メールアドレス）がサーバのログ（Vercel の実行時ログ）に残っていた。
// 無料枠の超過などで DB の書き込みが止まると、登録のたびにこれが起きる。
// DB の失敗を作るため、表に必ず失敗する CHECK 制約を足して登録し、console に出た内容（console が整形する文字列そのもの）を調べる。
// 失敗の種類（例外の名前と SQLSTATE）はログに残る。残らないと、障害の原因を追えない。
import assert from "node:assert/strict";
import { test } from "node:test";

import { withTestDb } from "../lib/db/test-helpers.ts";
import { logAuthMessage } from "../lib/auth/log.ts";
import { MAX_LOG_STRING_LENGTH } from "../lib/log.ts";
import {
  SAMPLE_USER,
  authRequest,
  createTestAuth,
  signUp,
} from "./support/auth.ts";
import { captureConsole } from "./support/console.ts";

/** Postgres の SQLSTATE: check_violation */
const PG_CHECK_VIOLATION = "23514";
/** パスワードの scrypt ハッシュ（salt:key。16 バイトと 64 バイトの 16 進） */
const SCRYPT_HASH = /[0-9a-f]{32}:[0-9a-f]{128}/;

/** 登録を送り、そのあいだに出たログと応答の status を返す */
async function signUpWhileCapturing(
  table: "account" | "user",
  email: string,
): Promise<{ status: number; text: string; count: number }> {
  return withTestDb(async ({ db, client }) => {
    await client.exec(
      `alter table "${table}" add constraint ${table}_always_fails check (false)`,
    );
    const auth = createTestAuth(db);
    const capture = captureConsole();
    let status = 0;
    try {
      const response = await auth.handler(
        authRequest("/sign-up/email", {
          body: { name: "ログの確認", email, password: SAMPLE_USER.password },
        }),
      );
      status = response.status;
    } finally {
      capture.restore();
    }
    return { status, text: capture.text(), count: capture.lines.length };
  });
}

for (const [table, expectedStatus] of [
  ["account", 500],
  ["user", 422],
] as const) {
  test(`ログ: 登録の途中で ${table} の挿入が DB で失敗しても、ログにパスワードのハッシュ・メールアドレス・パスワード・SQL の引数が出ない。失敗の種類は残る`, async () => {
    const email = `leak-probe-${table}@example.com`;
    const { status, text, count } = await signUpWhileCapturing(table, email);
    assert.equal(status, expectedStatus);

    assert.ok(count > 0, "DB の失敗はログに残す");
    assert.ok(!SCRYPT_HASH.test(text), "パスワードのハッシュがログに出ている");
    assert.ok(!text.includes(email), "メールアドレスがログに出ている");
    assert.ok(
      !text.includes(SAMPLE_USER.password),
      "パスワードがログに出ている",
    );
    assert.ok(!/params/i.test(text), "SQL の引数（params）がログに出ている");
    assert.ok(
      text.includes(`"errorCode":"${PG_CHECK_VIOLATION}"`),
      `失敗の種類（SQLSTATE）が残っていない: ${text.slice(0, 300)}`,
    );
  });
}

test("ログ: 登録済みのメールアドレスで登録し直しても、メールアドレスをログに出さない（Better Auth の info の記録は出力しない水準にしてある）", () =>
  withTestDb(async ({ db }) => {
    const auth = createTestAuth(db);
    const capture = captureConsole();
    let status = 0;
    try {
      await signUp(auth);
      status = (await signUp(auth)).response.status;
    } finally {
      capture.restore();
    }
    assert.equal(status, 422);
    assert.ok(
      !capture.text().includes(SAMPLE_USER.email),
      capture.text().slice(0, 300),
    );
  }));

test("logAuthMessage: メッセージは先頭 1 行・上限の長さまで、例外は名前とコードだけ。例外でない引数と、オブジェクトの中身は出さない", () => {
  const capture = captureConsole();
  try {
    const dbError = Object.assign(
      new Error(
        `Failed query: insert into "user" values ($1)\nparams: ${SAMPLE_USER.email}`,
      ),
      {
        cause: Object.assign(new Error("check"), { code: PG_CHECK_VIOLATION }),
      },
    );
    logAuthMessage("error", "Failed to create user\nparams: secret", dbError);
    logAuthMessage("warn", "x".repeat(MAX_LOG_STRING_LENGTH + 50));
    logAuthMessage("warn", "Invalid origin", {
      origin: "https://evil.example",
    });
    logAuthMessage("info", "Sign-up attempt", "plain string");
    logAuthMessage("debug", "debug は info 扱い");
  } finally {
    capture.restore();
  }
  const [failed, long, plain, info, debug] = capture.events();
  assert.deepEqual(failed, {
    level: "error",
    event: "auth.log",
    message: "Failed to create user",
    errorName: "Error",
    errorCode: PG_CHECK_VIOLATION,
  });
  assert.equal(
    (long?.message as string).length,
    MAX_LOG_STRING_LENGTH + 1,
    "上限の長さ + 省略の記号",
  );
  assert.deepEqual(plain, {
    level: "warn",
    event: "auth.log",
    message: "Invalid origin",
  });
  assert.equal(info?.level, "info");
  assert.equal(debug?.level, "info");
  assert.ok(!capture.text().includes(SAMPLE_USER.email));
  assert.ok(!capture.text().includes("evil.example"));
  assert.ok(!capture.text().includes("secret"));
});
