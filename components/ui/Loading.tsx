import { cx } from "./cx";

type LoadingProps = {
  label?: string;
  /** role="status" を付けて読み上げる（ページに別の role="status" があるときは false） */
  announce?: boolean;
  className?: string;
};

/**
 * 「読み込み中…」。announce: role="status" を付けて読み上げる（ページに別の role="status" があるときは false）
 */
export default function Loading({ label = "読み込み中…", announce = true, className }: LoadingProps) {
  return (
    <p role={announce ? "status" : undefined} className={cx("loading-text", className)}>
      {label}
    </p>
  );
}
