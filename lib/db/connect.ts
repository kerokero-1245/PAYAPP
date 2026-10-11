/**
 * DB への接続（Neon か PGlite かを決めるのは、このファイルの resolveDbTarget の 1 か所だけ）
 * ---------------------------------------------------
 * - DATABASE_URL がある → Neon（本番・プレビュー・Neon の開発ブランチ）。@neondatabase/serverless の Pool（WebSocket）なのでトランザクションが使える
 * - DATABASE_URL が無い → PGlite（Postgres を WASM で同じプロセスの中に立てる）。ローカルのファイル（既定は .pglite/）に保存する。
 *   Neon のアカウントもネットも要らない。ファイルを開けるのは 1 プロセスだけなので、dev サーバを止めてから db:migrate / db:seed を打つ
 *   保存先は PGLITE_DATA_DIR で変えられる（E2E は専用のディレクトリを使う）。PGLITE_DATA_DIR は E2E とローカルの `next start` のための明示で、
 *   Vercel（VERCEL=1）では無視する（置かれても、関数の実体ごとに消える DB に注文を書かないため）
 * - 本番（NODE_ENV=production）で DATABASE_URL が無いときは例外にする。本番で PGlite に黙って切り替わると、書き込めない（Vercel）か、
 *   消える DB に注文を書くことになるため。本番ビルドをローカルで動かすとき（next start・E2E）は、PGLITE_DATA_DIR で PGlite を明示する
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

/**
 * PGlite の既定の保存先（リポジトリ直下。.gitignore 済み）。PGlite は親のディレクトリを作らないので、入れ子にしない。
 * 環境変数 PGLITE_DATA_DIR があればそちらが先（E2E は .pglite-e2e を使い、開発の DB と取り合わない）
 */
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
 *  1. DATABASE_URL（migrate では先に DATABASE_URL_UNPOOLED）があれば Neon
 *  2. PGLITE_DATA_DIR があれば、そのディレクトリの PGlite（PGlite を使うという明示。本番ビルドでも使える。VERCEL=1 のときは無視する）
 *  3. NODE_ENV=production なら例外（接続先を決めずに本番で動かさない）
 *  4. それ以外（dev・test・scripts）は、既定のディレクトリ（.pglite/）の PGlite
 * 接続文字列にはパスワードが入るので、エラー文には値を入れない。
 */
export function resolveDbTarget(
  env: Readonly<Record<string, string | undefined>>,
  purpose: DbPurpose = "runtime",
): DbTarget {
  const url =
    (purpose === "migrate" ? nonEmpty(env.DATABASE_URL_UNPOOLED) : undefined) ??
    nonEmpty(env.DATABASE_URL);
  if (url !== undefined) {
    if (!POSTGRES_URL.test(url)) {
      throw new Error(
        "DATABASE_URL は postgres:// か postgresql:// で始まる接続文字列にしてください",
      );
    }
    return { kind: "neon", url };
  }
  // Vercel では PGLITE_DATA_DIR を使わない（/tmp を指されると、関数の実体ごとに消える DB に注文を書く。.env.local を取り込んだ・
  // E2E の設定を写した、などで置かれうる）。無いものとして扱い、下の本番の検査に任せる
  const onVercel = env.VERCEL === "1";
  const dataDir = onVercel ? undefined : nonEmpty(env.PGLITE_DATA_DIR);
  if (dataDir !== undefined) return { kind: "pglite", dataDir };
  if (env.NODE_ENV === "production") {
    throw new Error(
      "本番（NODE_ENV=production）では DATABASE_URL が必要です。PGlite のファイルには黙って切り替えません。" +
        (onVercel
          ? "Vercel では PGLITE_DATA_DIR は使いません（関数の実体ごとに消える DB になるため）。Neon の接続文字列を DATABASE_URL に置いてください"
          : "ローカルで本番ビルドを動かすときは、PGLITE_DATA_DIR で PGlite の保存先を明示してください"),
    );
  }
  return { kind: "pglite", dataDir: PGLITE_DATA_DIR };
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
