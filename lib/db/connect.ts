/**
 * DB への接続（Neon か PGlite かを決めるのは、このファイルの resolveDbTarget の 1 か所だけ）
 * ---------------------------------------------------
 * - DATABASE_URL がある → Neon（本番・プレビュー・Neon の開発ブランチ）。@neondatabase/serverless の Pool（WebSocket）なのでトランザクションが使える
 * - DATABASE_URL が無い → PGlite（Postgres を WASM で同じプロセスの中に立てる）。ローカルのファイル（.pglite/）に保存する。
 *   Neon のアカウントもネットも要らない。ファイルを開けるのは 1 プロセスだけなので、dev サーバを止めてから db:migrate / db:seed を打つ
 *
 * Neon のドライバは WebSocket のプロキシ経由で Neon に繋ぐ。素の Postgres（docker の postgres など）には繋げない。
 * アプリが受け取るのは接続（Db）で、これを関数の引数で渡す（今の getStripe と同じ流儀。テストは lib/db/test-helpers.ts の PGlite を差し込む）。
 * server-only はここには付けない（drizzle.config.ts と scripts/ が Node から直接読む）。アプリからは lib/db/client.ts の getDb() を通す。
 */
import type { PGlite, PGliteOptions } from "@electric-sql/pglite";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema.ts";

/** アプリ・seed・テストが受け取る DB の型。Neon と PGlite のどちらも代入できる共通の親（トランザクションも使える） */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

/** 接続と、閉じる関数 */
export type DbConnection<TDb extends Db = Db> = {
  db: TDb;
  close: () => Promise<void>;
};

/** PGlite の接続。client は PGlite 本体（テストが dumpDataDir を使う） */
export type PgliteConnection = DbConnection<PgliteDatabase<typeof schema>> & {
  client: PGlite;
};

/** PGlite の保存先（リポジトリ直下。.gitignore 済み）。PGlite は親のディレクトリを作らないので、入れ子にしない */
export const PGLITE_DATA_DIR = ".pglite";

/** 接続先 */
export type DbTarget =
  { kind: "neon"; url: string } | { kind: "pglite"; dataDir: string };

/**
 * どの用途の接続か。
 * runtime = アプリ・seed（DATABASE_URL。Neon ではプール経由）
 * migrate = マイグレーション（DATABASE_URL_UNPOOLED の直結。無ければ DATABASE_URL）
 */
export type DbPurpose = "runtime" | "migrate";

const POSTGRES_URL = /^postgres(ql)?:\/\//;

/** 空文字・空白だけは未設定として扱う（.env に `DATABASE_URL=` と書いてあるだけの場合） */
function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * 環境変数から接続先を決める（Neon か PGlite かの切り替えはここだけ）。
 * 接続文字列にはパスワードが入るので、形が違うときのエラー文には値を入れない。
 */
export function resolveDbTarget(
  env: Readonly<Record<string, string | undefined>>,
  purpose: DbPurpose = "runtime",
): DbTarget {
  const url =
    (purpose === "migrate" ? nonEmpty(env.DATABASE_URL_UNPOOLED) : undefined) ??
    nonEmpty(env.DATABASE_URL);
  if (url === undefined) return { kind: "pglite", dataDir: PGLITE_DATA_DIR };
  if (!POSTGRES_URL.test(url)) {
    throw new Error(
      "DATABASE_URL は postgres:// か postgresql:// で始まる接続文字列にしてください",
    );
  }
  return { kind: "neon", url };
}

/** 接続先を画面・ログに出すための文（接続文字列そのものは出さない） */
export function describeDbTarget(target: DbTarget): string {
  return target.kind === "neon"
    ? "Neon（DATABASE_URL）"
    : `PGlite（${target.dataDir}）`;
}

/**
 * PGlite に繋ぐ。dataDir が無ければメモリ上（テスト用）、あれば同じ名前のディレクトリに保存する。
 * 新しいディレクトリの初期化（initdb）は 1 回に数秒かかる。2 回目からは速い。
 */
export async function connectPglite(
  options: PGliteOptions = {},
): Promise<PgliteConnection> {
  const [{ PGlite }, { drizzle }] = await Promise.all([
    import("@electric-sql/pglite"),
    import("drizzle-orm/pglite"),
  ]);
  const client = new PGlite(options);
  await client.waitReady;
  return {
    db: drizzle({ client, schema }),
    client,
    close: () => client.close(),
  };
}

/** Neon に繋ぐ。Node 22 には WebSocket が標準であるので、ws は要らない */
async function connectNeon(url: string): Promise<DbConnection> {
  const [{ Pool }, { drizzle }] = await Promise.all([
    import("@neondatabase/serverless"),
    import("drizzle-orm/neon-serverless"),
  ]);
  const pool = new Pool({ connectionString: url });
  // 待機中の接続が切れたときのエラーを拾わないと、プロセスが落ちる
  pool.on("error", (error: Error) =>
    console.error("DB（Neon）の接続でエラー:", error.message),
  );
  return { db: drizzle({ client: pool, schema }), close: () => pool.end() };
}

/** 接続先に繋ぐ */
export function connectDb(target: DbTarget): Promise<DbConnection> {
  return target.kind === "neon"
    ? connectNeon(target.url)
    : connectPglite({ dataDir: target.dataDir });
}
