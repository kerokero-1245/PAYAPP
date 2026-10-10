/**
 * .env.local を process.env に読む（Next の外で動く drizzle-kit と scripts/ 用）
 * ---------------------------------------------------
 * next dev / next build は .env.local を自分で読むが、`drizzle-kit` と `node scripts/...` は読まない。
 * ファイルが無ければ何もしない（CI には .env.local が無い）。既にある環境変数は上書きしない（シェルや CI の指定が勝つ）。
 */
import { existsSync } from "node:fs";

export function loadLocalEnv(file = ".env.local"): void {
  if (existsSync(file)) process.loadEnvFile(file);
}
