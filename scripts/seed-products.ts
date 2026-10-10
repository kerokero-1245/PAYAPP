// カタログの商品を products 表へ upsert する。実行: npm run db:seed（先に npm run db:migrate）
//
// 接続先は DATABASE_URL（.env.local か環境変数）。無ければ .pglite/ の PGlite。何度打っても同じ状態になる（lib/db/seed.ts）。
// PGlite のファイルを開けるのは 1 プロセスだけなので、dev サーバを止めてから打つ。
import {
  connectDb,
  describeDbTarget,
  resolveDbTarget,
} from "../lib/db/connect.ts";
import { loadLocalEnv } from "../lib/db/load-env.ts";
import { seedProducts } from "../lib/db/seed.ts";

loadLocalEnv();
const target = resolveDbTarget(process.env);
const connection = await connectDb(target);
try {
  const changed = await seedProducts(connection.db);
  console.log(
    `seed-products: ${describeDbTarget(target)}の products を ${changed} 件追加・更新しました`,
  );
} finally {
  await connection.close();
}
