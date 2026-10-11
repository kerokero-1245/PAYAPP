/**
 * 本番（NODE_ENV=production）の既定で試行回数の制限が効くことを、子プロセスで確かめるための実行ファイル
 * ---------------------------------------------------
 * tests/auth-rate-limit.test.ts が NODE_ENV=production で起動する。Better Auth は NODE_ENV を読み込み時に定数にする（isProduction）ので、
 * 同じプロセスの中では切り替えられない。rateLimit の設定を何も渡さない createAuth（本番と同じ）で、同じ IP から誤ったパスワードで
 * ログインを 4 回続け、応答の status を JSON で標準出力に出す。
 * `tests/*.test.ts` のグロブには当たらないので、テストとしては実行されない。
 */
import { createTestDb } from "../../lib/db/test-helpers.ts";
import { SAMPLE_USER, createTestAuth, signIn, signUp } from "./auth.ts";

const IP = "198.51.100.77";
const conn = await createTestDb();
try {
  // settings に rateLimit を渡さない（本番の createAuth と同じ呼び方）
  const auth = createTestAuth(conn.db);
  await signUp(auth, SAMPLE_USER, { headers: { "x-forwarded-for": IP } });
  const statuses: number[] = [];
  for (let n = 0; n < 4; n += 1) {
    const { response } = await signIn(
      auth,
      { email: SAMPLE_USER.email, password: "wrong-password-0000" },
      { headers: { "x-forwarded-for": IP } },
    );
    statuses.push(response.status);
  }
  console.log(JSON.stringify({ nodeEnv: process.env.NODE_ENV, statuses }));
} finally {
  await conn.close();
}
