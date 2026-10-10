import type { ReactNode } from "react";
import { cx } from "./cx";

type ActionsProps = {
  layout?: "row" | "stack";
  align?: "center" | "start";
  /** 配置（mt-10 など） */
  className?: string;
  children?: ReactNode;
};

/**
 * ボタンの並び。row: スマホは縦積み・sm から横並び / stack: 常に縦積み（全幅ボタン向け）
 */
export default function Actions({ layout = "row", align = "center", className, children }: ActionsProps) {
  return (
    <div className={cx(layout === "stack" ? "actions-stack" : "actions", layout !== "stack" && align === "start" && "actions-start", className)}>
      {children}
    </div>
  );
}
