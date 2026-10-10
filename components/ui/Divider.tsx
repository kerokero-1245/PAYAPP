import { cx } from "./cx";

type DividerProps = {
  variant?: "hairline" | "rule";
  className?: string;
};

/**
 * 区切り線。hairline: 全幅の細い線 / rule: 見出し下の短い金の線（行内に置く）。余白は className（my-7 など）
 */
export default function Divider({ variant = "hairline", className }: DividerProps) {
  if (variant === "rule") return <span className={cx("rule-gold", className)} />;
  return <div className={cx("hairline", className)} />;
}
