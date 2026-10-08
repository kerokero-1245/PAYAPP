import { cx } from "./cx";

/**
 * 区切り線。hairline: 全幅の細い線 / rule: 見出し下の短い金の線（行内に置く）。余白は className（my-7 など）
 * @param {{ variant?: "hairline" | "rule", className?: string }} props
 */
export default function Divider({ variant = "hairline", className }) {
  if (variant === "rule") return <span className={cx("rule-gold", className)} />;
  return <div className={cx("hairline", className)} />;
}
