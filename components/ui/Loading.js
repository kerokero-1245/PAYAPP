import { cx } from "./cx";

/**
 * 「読み込み中…」。announce: role="status" を付けて読み上げる（ページに別の role="status" があるときは false）
 * @param {{ label?: string, announce?: boolean, className?: string }} props
 */
export default function Loading({ label = "読み込み中…", announce = true, className }) {
  return (
    <p role={announce ? "status" : undefined} className={cx("loading-text", className)}>
      {label}
    </p>
  );
}
