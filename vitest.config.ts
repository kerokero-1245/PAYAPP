import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Vitest 設定
 *
 * ドメイン層は副作用を持たない純粋なロジックなので、高速な node 環境で実行する。
 * 将来コンポーネントテストを追加する場合は jsdom + @testing-library/react を
 * devDependencies に加え、該当テスト先頭に `// @vitest-environment jsdom` を付ける。
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["domain/**/*.test.ts", "lib/**/*.test.{ts,js}"],
    coverage: {
      provider: "v8",
      include: ["domain/**/*.ts"],
      exclude: ["domain/**/*.test.ts"],
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
});
