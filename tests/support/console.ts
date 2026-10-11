/**
 * console に出た内容を集めるテストの道具
 * ---------------------------------------------------
 * ログに値（パスワードのハッシュ・メールアドレス・SQL の引数）が出ていないか、出すべき記録が出ているかを、
 * console が実際に出す文字列（util.format の整形）で調べる。restore で元の console に戻す。
 * `tests/*.test.ts` のグロブには当たらないので、テストとしては実行されない。
 */
import { format } from "node:util";

const NAMES = ["debug", "info", "log", "warn", "error"] as const;
export type ConsoleName = (typeof NAMES)[number];

/** console.* の呼び出しを、整形した文字列にして集め始める（元の出力は止める） */
export function captureConsole() {
  const lines: { name: ConsoleName; text: string }[] = [];
  const saved = Object.fromEntries(NAMES.map((name) => [name, console[name]]));
  for (const name of NAMES) {
    console[name] = (...args: unknown[]) => {
      lines.push({ name, text: format(...args) });
    };
  }
  return {
    lines,
    /** 集めた内容を 1 つの文字列にする */
    text: () => lines.map((line) => line.text).join("\n"),
    /** 集めた 1 行 1 JSON のログを読む（JSON でない行は除く） */
    events: () =>
      lines.flatMap(({ text }) => {
        try {
          return [JSON.parse(text) as Record<string, unknown>];
        } catch {
          return [];
        }
      }),
    restore() {
      for (const name of NAMES) console[name] = saved[name]!;
    },
  };
}
