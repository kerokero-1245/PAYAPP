/** cx に渡せる値（条件式の `cond && "class"` が返す false・undefined・null も渡せる） */
export type ClassValue = string | false | null | undefined;

/** クラス名をつなぐ（偽の値は捨てる） */
export function cx(...names: ClassValue[]): string {
  return names.filter(Boolean).join(" ");
}
