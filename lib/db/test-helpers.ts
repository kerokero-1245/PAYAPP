/**
 * DB を使うテストの道具（テスト専用。アプリは import しない）
 * ---------------------------------------------------
 * テストごとに、全マイグレーション（drizzle/）を当てた空の PGlite をメモリ上に立てる。外部のサービスも docker も要らない。
 *
 * 空の PGlite の初期化（initdb）は 1 つに数秒かかる。テストの数だけ繰り返すと遅いので、
 * プロセスで最初の 1 回だけ「空の PGlite に全マイグレーションを当てて、その状態を丸ごと写し取る」。
 * 各テストはその写しから立ち上げる（=マイグレーションを当てた直後と同じ状態から始まる。テスト同士は共有しない）。
 * 写しを作るときにマイグレーションが失敗すれば、DB を使うテストはすべて落ちる。
 */
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import type { PGliteOptions } from "@electric-sql/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { connectPglite, type PgliteConnection } from "./connect.ts";

/** マイグレーションの SQL と履歴（meta/_journal.json）を置いた drizzle/ */
export const MIGRATIONS_FOLDER = fileURLToPath(
  new URL("../../drizzle", import.meta.url),
);

let migratedSnapshot: Promise<Blob> | undefined;

/** 空の PGlite に全マイグレーションを当て、データのディレクトリを丸ごと写し取る */
async function snapshotMigratedDb(): Promise<Blob> {
  const { db, client, close } = await connectPglite();
  try {
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
    return await client.dumpDataDir("none");
  } finally {
    await close();
  }
}

/** 全マイグレーションを当てた、まっさらな PGlite（メモリ上。options.dataDir を渡すとそのディレクトリに保存する） */
export async function createTestDb(
  options: PGliteOptions = {},
): Promise<PgliteConnection> {
  migratedSnapshot ??= snapshotMigratedDb();
  return connectPglite({ ...options, loadDataDir: await migratedSnapshot });
}

/** テスト 1 つぶんの DB を立てて run に渡し、終わったら（落ちても）閉じる */
export async function withTestDb<T>(
  run: (connection: PgliteConnection) => Promise<T>,
): Promise<T> {
  const connection = await createTestDb();
  try {
    return await run(connection);
  } finally {
    await connection.close();
  }
}

/** Postgres の SQLSTATE（制約違反） */
export const PG_UNIQUE_VIOLATION = "23505";
export const PG_FOREIGN_KEY_VIOLATION = "23503";
/** ON DELETE RESTRICT の外部キーは、参照されている行を消そうとすると 23503 ではなくこちらになる */
export const PG_RESTRICT_VIOLATION = "23001";
export const PG_CHECK_VIOLATION = "23514";

/** Postgres のエラーから取り出す、テストで見る 2 つ（SQLSTATE と違反した制約の名前） */
export type PgErrorInfo = { code: string; constraint?: string };

/** drizzle は元のエラーを cause に入れて包む。cause をたどって Postgres のエラーを探す */
export function pgErrorInfo(error: unknown): PgErrorInfo | undefined {
  let current: unknown = error;
  for (
    let depth = 0;
    depth < 5 && typeof current === "object" && current !== null;
    depth++
  ) {
    const { code, constraint, cause } = current as Record<string, unknown>;
    if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) {
      return typeof constraint === "string" ? { code, constraint } : { code };
    }
    current = cause;
  }
  return undefined;
}

/** run が、期待した制約（SQLSTATE と制約の名前）の違反で失敗すること。別の理由で失敗したり成功したりしたら落とす */
export async function assertPgError(
  run: () => PromiseLike<unknown>,
  expected: PgErrorInfo,
): Promise<void> {
  let failure: { error: unknown } | undefined;
  try {
    await run();
  } catch (error) {
    failure = { error };
  }
  assert.ok(
    failure,
    `失敗するはずが成功した（期待: ${JSON.stringify(expected)}）`,
  );
  assert.deepEqual(pgErrorInfo(failure.error), expected, String(failure.error));
}
