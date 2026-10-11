// 認証の入力の大きさの上限（表示名・メールアドレス・画像の URL・User-Agent）のテスト。実行: npm test
//
// なぜあるか: Better Auth は表示名・画像の URL に長さの上限を持たず、/api/auth/sign-up/email は匿名で呼べる。
// 上限が無いと、登録 1 回で数 MB（実測 4 MiB）を DB に置け、Neon の無料枠（1GB）を数百回の登録で埋めて、
// 支払い済みの注文を確定できなくなる。User-Agent もログインのたびに session 表へそのまま入る（実測 15,000 文字）。
// 本物の Better Auth（lib/auth/config.ts の createAuth）に /api/auth/* を送り、次を固定する。
//  - 上限を超える名前・メール・画像は 4xx で断り、利用者もセッションも増やさない。ちょうど上限の値は通す
//  - 登録後の更新（update-user）でも同じ上限が効き、保存済みの値は変わらない
//  - User-Agent は上限の長さに切り詰めて保存する
// 本文そのものの上限（16KB で 413）は lib/auth/handler.ts の仕事で、tests/auth-handler.test.ts が確かめる。
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import { eq } from "drizzle-orm";

import {
  MAX_EMAIL_LENGTH,
  MAX_IMAGE_URL_LENGTH,
  MAX_NAME_LENGTH,
  MAX_USER_AGENT_LENGTH,
} from "../lib/auth/constants.ts";
import type { Db } from "../lib/db/connect.ts";
import { session, user } from "../lib/db/schema.ts";
import { withTestDb } from "../lib/db/test-helpers.ts";
import {
  SAMPLE_USER,
  authRequest,
  createTestAuth,
  readJson,
  signIn,
  signUp,
} from "./support/auth.ts";

const MiB = 1024 * 1024;
const PASSWORD = "long-enough-password-1";

/** Better Auth のエラー応答（{ message, code }）の読み取り */
async function failureOf(response: Response) {
  const body = (await readJson(response)) as {
    message?: string;
    code?: string;
  } | null;
  return { status: response.status, code: body?.code };
}

/** 利用者・セッションの行数 */
async function rowCounts(db: Db) {
  const [users, sessions] = await Promise.all([
    db.select().from(user),
    db.select().from(session),
  ]);
  return { users: users.length, sessions: sessions.length };
}

/** 長さがちょうど length 文字のメールアドレス（local@example.com の local を伸ばす） */
function emailOfLength(length: number): string {
  const domain = "@example.com";
  return `${"a".repeat(length - domain.length)}${domain}`;
}

test("登録: 表示名が上限を超えたら 4xx で断り、利用者もセッションも増えない。ちょうど上限の長さなら登録できる", () =>
  withTestDb(async ({ db }) => {
    const auth = createTestAuth(db);
    const rejected = await signUp(auth, {
      name: "あ".repeat(MAX_NAME_LENGTH + 1),
      email: "long-name@example.com",
      password: PASSWORD,
    });
    const failure = await failureOf(rejected.response);
    assert.equal(failure.status, 400);
    assert.equal(failure.code, "NAME_TOO_LONG");
    assert.deepEqual(await rowCounts(db), { users: 0, sessions: 0 });

    const accepted = await signUp(auth, {
      name: "あ".repeat(MAX_NAME_LENGTH),
      email: "max-name@example.com",
      password: PASSWORD,
    });
    assert.equal(accepted.response.status, 200);
    assert.deepEqual(await rowCounts(db), { users: 1, sessions: 1 });
  }));

test("登録: 4 MiB の乱数の名前（圧縮されずにそのまま DB に入る大きさ）は断り、DB に何も残さない", () =>
  withTestDb(async ({ db, client }) => {
    const auth = createTestAuth(db);
    const huge = await signUp(auth, {
      name: randomBytes(2 * MiB).toString("hex"),
      email: "huge-name@example.com",
      password: PASSWORD,
    });
    assert.equal((await failureOf(huge.response)).status, 400);
    assert.deepEqual(await rowCounts(db), { users: 0, sessions: 0 });
    const { rows } = await client.query<{ bytes: string }>(
      `select pg_total_relation_size('"user"')::text as bytes`,
    );
    assert.ok(
      Number(rows[0]!.bytes) < MiB,
      `user 表が ${rows[0]!.bytes} バイトに膨らんだ`,
    );
  }));

test("登録: メールアドレスが 254 文字を超えたら 4xx で断り、利用者は増えない。ちょうど 254 文字なら登録できる", () =>
  withTestDb(async ({ db }) => {
    const auth = createTestAuth(db);
    const rejected = await signUp(auth, {
      name: "長いメール",
      email: emailOfLength(MAX_EMAIL_LENGTH + 1),
      password: PASSWORD,
    });
    const failure = await failureOf(rejected.response);
    assert.equal(failure.status, 400);
    assert.equal(failure.code, "EMAIL_TOO_LONG");
    // 一意索引の上限（約 2.7KB）を超える長さでも、DB の失敗（422）にならず入口で断る
    const enormous = await signUp(auth, {
      name: "とても長いメール",
      email: emailOfLength(3_000),
      password: PASSWORD,
    });
    assert.equal((await failureOf(enormous.response)).code, "EMAIL_TOO_LONG");
    assert.deepEqual(await rowCounts(db), { users: 0, sessions: 0 });

    const accepted = await signUp(auth, {
      name: "上限のメール",
      email: emailOfLength(MAX_EMAIL_LENGTH),
      password: PASSWORD,
    });
    assert.equal(accepted.response.status, 200);
    assert.equal((await rowCounts(db)).users, 1);
  }));

test("登録: 画像の URL が上限を超えたら 4xx で断り、利用者は増えない。ちょうど上限の長さなら登録できる", () =>
  withTestDb(async ({ db }) => {
    const auth = createTestAuth(db);
    const longImage = (length: number) =>
      `https://example.com/${"a".repeat(length - "https://example.com/".length)}`;
    const rejected = await auth.handler(
      authRequest("/sign-up/email", {
        body: {
          name: "画像つき",
          email: "image-over@example.com",
          password: PASSWORD,
          image: longImage(MAX_IMAGE_URL_LENGTH + 1),
        },
      }),
    );
    const failure = await failureOf(rejected);
    assert.equal(failure.status, 400);
    assert.equal(failure.code, "IMAGE_TOO_LONG");
    assert.deepEqual(await rowCounts(db), { users: 0, sessions: 0 });

    const accepted = await auth.handler(
      authRequest("/sign-up/email", {
        body: {
          name: "画像つき",
          email: "image-max@example.com",
          password: PASSWORD,
          image: longImage(MAX_IMAGE_URL_LENGTH),
        },
      }),
    );
    assert.equal(accepted.status, 200);
    assert.equal((await rowCounts(db)).users, 1);
  }));

test("更新（update-user）: 上限を超える名前・画像は 4xx で断り、保存済みの値は変わらない。上限内なら更新できる", () =>
  withTestDb(async ({ db }) => {
    const auth = createTestAuth(db);
    const { cookie } = await signUp(auth);
    const stored = async () => {
      const [row] = await db
        .select({ name: user.name, image: user.image })
        .from(user)
        .where(eq(user.email, SAMPLE_USER.email));
      return row;
    };
    const update = (body: Record<string, unknown>) =>
      auth.handler(authRequest("/update-user", { body, headers: { cookie } }));

    // 4 MiB の名前で上書きしようとしても（登録後の書き換え口）、同じ上限で断る
    for (const body of [
      { name: randomBytes(2 * MiB).toString("hex") },
      { name: "あ".repeat(MAX_NAME_LENGTH + 1) },
      { image: "x".repeat(MAX_IMAGE_URL_LENGTH + 1) },
    ]) {
      const failure = await failureOf(await update(body));
      assert.equal(failure.status, 400, Object.keys(body).join());
      assert.ok(failure.code, Object.keys(body).join());
    }
    assert.deepEqual(await stored(), { name: SAMPLE_USER.name, image: null });

    const ok = await update({
      name: "あ".repeat(MAX_NAME_LENGTH),
      image: "https://example.com/a.png",
    });
    assert.equal(ok.status, 200);
    assert.deepEqual(await stored(), {
      name: "あ".repeat(MAX_NAME_LENGTH),
      image: "https://example.com/a.png",
    });
  }));

test("ログイン: 15,000 文字の User-Agent で入っても、session.user_agent には上限の長さまでしか保存しない（短い値はそのまま）", () =>
  withTestDb(async ({ db }) => {
    const auth = createTestAuth(db);
    await signUp(auth);
    const ua = "A".repeat(7_500) + "B".repeat(7_500);
    for (let n = 0; n < 2; n += 1) {
      const { response } = await signIn(auth, SAMPLE_USER, {
        headers: { "user-agent": ua },
      });
      assert.equal(response.status, 200);
    }
    const short = await signIn(auth, SAMPLE_USER, {
      headers: { "user-agent": "curl/8.7.1" },
    });
    assert.equal(short.response.status, 200);

    const rows = await db
      .select({ userAgent: session.userAgent })
      .from(session);
    const lengths = rows
      .map((row) => (row.userAgent ?? "").length)
      .sort((a, b) => a - b);
    // 登録時の session（User-Agent なし）1 行 + 短い 1 行 + 長い 2 行（上限の長さまで）
    assert.deepEqual(lengths, [
      0,
      "curl/8.7.1".length,
      MAX_USER_AGENT_LENGTH,
      MAX_USER_AGENT_LENGTH,
    ]);
    assert.ok(
      rows.some((row) => row.userAgent === "A".repeat(MAX_USER_AGENT_LENGTH)),
      "先頭から切り詰める",
    );
  }));
