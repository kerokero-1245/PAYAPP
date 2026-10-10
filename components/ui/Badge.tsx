import type { ReactNode } from "react";
import { cx } from "./cx";

type BadgeProps = {
  className?: string;
  children?: ReactNode;
};

/**
 * 商品画像の上の札（NEW・LIMITED）。位置は className（absolute top-3 left-3 など）
 */
export default function Badge({ className, children }: BadgeProps) {
  return <span className={cx("pill badge", className)}>{children}</span>;
}
