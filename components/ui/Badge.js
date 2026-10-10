import { cx } from "./cx";

/**
 * 商品画像の上の札（NEW・LIMITED）。位置は className（absolute top-3 left-3 など）
 * @param {{ className?: string, children?: React.ReactNode }} props
 */
export default function Badge({ className, children }) {
  return <span className={cx("badge", className)}>{children}</span>;
}
