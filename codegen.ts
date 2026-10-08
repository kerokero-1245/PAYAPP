// GraphQL codegen の設定（npm run codegen）
// スキーマは lib/graphql/sdl.ts の /* GraphQL */ 印付きの文字列から読み、
// スキーマの型と resolver の型（Resolvers）を lib/graphql/__generated__/types.ts に出す。
// 生成物はコミットする（CI が npm run codegen 後の差分ゼロで鮮度を確かめる）。
import type { CodegenConfig } from "@graphql-codegen/cli";

/** 生成物の先頭に付ける注記（生成コードの any で lint を落とさない。eslint の設定は変えない） */
const HEADER = "// このファイルは npm run codegen が生成する。手で編集しない。\n/* eslint-disable */\n";

const config: CodegenConfig = {
  schema: "lib/graphql/sdl.ts",
  generates: {
    "lib/graphql/__generated__/types.ts": {
      plugins: ["typescript", "typescript-resolvers"],
      hooks: {
        beforeOneFileWrite: [(_path: string, content: string) => HEADER + content],
      },
      config: {
        // Node の型消去で動く範囲に限る（TS の enum を出さない）
        enumsAsTypes: true,
        useTypeImports: true,
        // 入力の ID は文字列（カタログの id は "1" など）
        scalars: { ID: { input: "string", output: "string" } },
      },
    },
  },
};

export default config;
