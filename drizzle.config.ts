// drizzle-kit の設定（npm run db:generate / db:migrate）
// スキーマは lib/db/schema.ts。generate が drizzle/ に SQL を出す（生成物はコミットする。CI が差分ゼロで鮮度を確かめる）。
// migrate の接続先は DATABASE_URL_UNPOOLED（直結）、無ければ DATABASE_URL、どちらも無ければ .pglite/ の PGlite。
// `drizzle-kit push` は使わない（履歴が残らない）。
import { defineConfig } from "drizzle-kit";
import { resolveDbTarget } from "./lib/db/connect.ts";
import { loadLocalEnv } from "./lib/db/load-env.ts";

loadLocalEnv();
const target = resolveDbTarget(process.env, "migrate");

export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  ...(target.kind === "neon"
    ? { dbCredentials: { url: target.url } }
    : { driver: "pglite", dbCredentials: { url: target.dataDir } }),
});
