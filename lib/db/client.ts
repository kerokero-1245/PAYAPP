import "server-only";
import {
  connectDb,
  resolveDbTarget,
  type Db,
  type DbConnection,
} from "./connect.ts";

/**
 * アプリ（Route Handler・サーバコンポーネント）が DB を受け取る入口
 * ---------------------------------------------------
 * Neon か PGlite かの切り替えは connect.ts の resolveDbTarget にだけある。ここはその結果を、プロセスで 1 つだけ繋いで返す。
 * - PGlite はデータのディレクトリを同時に開けるのが 1 つだけなので、必ず 1 つに絞る
 * - next dev はモジュールを読み直すので、接続は globalThis に持たせる（読み直すたびに新しい接続を作らない）
 * - 繋ぐのに失敗したら覚えず、次の呼び出しでやり直す
 *
 * "server-only" により、クライアントのコードから import するとビルドが失敗する（lib/stripe.ts の getStripe と同じ）。
 * そのためテストはここを読まず、DB を関数の引数で受け取る側（fulfillCheckout など）に lib/db/test-helpers.ts の接続を差し込む。
 */
const store = globalThis as typeof globalThis & {
  __payappDb?: Promise<DbConnection>;
};

export async function getDb(): Promise<Db> {
  if (store.__payappDb === undefined) {
    const pending = connectDb(resolveDbTarget(process.env));
    pending.catch(() => {
      if (store.__payappDb === pending) store.__payappDb = undefined;
    });
    store.__payappDb = pending;
  }
  return (await store.__payappDb).db;
}
