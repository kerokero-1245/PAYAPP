// 試行回数の制限の設定（接続元の決め方・本番の既定）のテスト。実行: npm test
//
// なぜあるか:
//  - 制限は接続元の IP ごとに数える。Vercel が前段で付ける x-real-ip を先に見て、無ければ x-forwarded-for を見る
//    （E2E とローカルは x-forwarded-for で枠を分ける）。呼び出し側が x-forwarded-for を好きに変えても、x-real-ip が付いていれば逃げられない
//  - 本番では制限が既定で有効（lib/auth/config.ts の rateLimit は、渡されたときだけ Better Auth の既定を上書きする）。
//    「本番の既定だけを切る」変更は、tests/auth.test.ts の 2 本（制限を true で明示するもの・本番以外で制限しないもの）では拾えない。
//    NODE_ENV は Better Auth が読み込み時に定数にするので、NODE_ENV=production の子プロセスで確かめる
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { withTestDb } from "../lib/db/test-helpers.ts";
import { SAMPLE_USER, createTestAuth, signIn, signUp } from "./support/auth.ts";

const run = promisify(execFile);
const CHILD = fileURLToPath(
  new URL("./support/rate-limit-child.ts", import.meta.url),
);

const WRONG = { email: SAMPLE_USER.email, password: "wrong-password-0000" };

test("試行回数の制限: 接続元は x-real-ip を先に見る（x-forwarded-for を毎回変えても、同じ x-real-ip なら同じ枠）。無い・IP でない値のときは x-forwarded-for", () =>
  withTestDb(async ({ db }) => {
    const auth = createTestAuth(db, { rateLimit: true });
    await signUp(auth, SAMPLE_USER, {
      headers: { "x-forwarded-for": "203.0.113.1" },
    });
    const attempt = async (headers: Record<string, string>) =>
      (await signIn(auth, WRONG, { headers })).response.status;

    // x-real-ip が同じなら、x-forwarded-for が毎回違っても 4 回目で 429
    const statuses: number[] = [];
    for (let n = 1; n <= 4; n += 1) {
      statuses.push(
        await attempt({
          "x-real-ip": "198.51.100.30",
          "x-forwarded-for": `192.0.2.${n}`,
        }),
      );
    }
    assert.deepEqual(statuses, [401, 401, 401, 429]);

    // x-real-ip が違えば別の枠（x-forwarded-for が同じでも）
    assert.equal(
      await attempt({
        "x-real-ip": "198.51.100.31",
        "x-forwarded-for": "192.0.2.1",
      }),
      401,
    );

    // x-real-ip が無ければ x-forwarded-for で数える（E2E の幅ごとの枠）。値が違えば別の枠
    const byForwarded: number[] = [];
    for (let n = 0; n < 4; n += 1) {
      byForwarded.push(await attempt({ "x-forwarded-for": "198.51.100.40" }));
    }
    assert.deepEqual(byForwarded, [401, 401, 401, 429]);
    assert.equal(await attempt({ "x-forwarded-for": "198.51.100.41" }), 401);

    // x-real-ip が IP の形でなければ無視して x-forwarded-for を使う
    const fallback: number[] = [];
    for (let n = 0; n < 4; n += 1) {
      fallback.push(
        await attempt({
          "x-real-ip": "not-an-ip",
          "x-forwarded-for": "198.51.100.50",
        }),
      );
    }
    assert.deepEqual(fallback, [401, 401, 401, 429]);
  }));

test("試行回数の制限: 本番（NODE_ENV=production）では、設定を何も渡さなくても既定で有効（同じ IP のログインは 4 回目で 429）", async () => {
  const { stdout } = await run(process.execPath, [CHILD], {
    env: { ...process.env, NODE_ENV: "production" },
    timeout: 120_000,
  });
  const result = JSON.parse(stdout.trim().split("\n").at(-1)!) as {
    nodeEnv: string;
    statuses: number[];
  };
  assert.equal(result.nodeEnv, "production");
  assert.deepEqual(result.statuses, [401, 401, 401, 429]);
});
