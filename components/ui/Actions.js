import { cx } from "./cx";

/**
 * ボタンの並び。row: スマホは縦積み・sm から横並び / stack: 常に縦積み（全幅ボタン向け）
 * @param {{ layout?: "row" | "stack", align?: "center" | "start", className?: string }} props className は配置（mt-10 など）
 */
export default function Actions({ layout = "row", align = "center", className, children }) {
  return (
    <div className={cx(layout === "stack" ? "actions-stack" : "actions", layout !== "stack" && align === "start" && "actions-start", className)}>
      {children}
    </div>
  );
}
