import { cx } from "./cx";

/**
 * 商品画像の上の札（NEW・LIMITED）。位置は className（absolute top-3 left-3 など）
 * @param {{ size?: "md" | "lg", className?: string, children?: React.ReactNode }} props
 */
export default function Badge({ size = "md", className, children }) {
  return <span className={cx("badge", size === "lg" && "badge-lg", className)}>{children}</span>;
}
