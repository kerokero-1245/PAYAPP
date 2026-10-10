import { formatYen } from "@/lib/format";
import { cx } from "./cx";

/**
 * 金額（¥248,000）。
 * @param {{
 *   amount: number, as?: string,
 *   size?: "xs" | "base" | "lg" | "xl" | "hero",  省略すると親の大きさ
 *   tone?: "cream" | "gold" | "gold-soft" | "muted" | "faint",
 *   display?: boolean,  見出しの書体
 *   wide?: boolean,     字間を少し空ける
 *   tabular?: boolean,  数字の幅をそろえる
 *   suffix?: React.ReactNode, className?: string,
 * }} props
 */
export default function Price({ amount, as: Tag = "span", size, tone, display, wide, tabular, suffix, className }) {
  return (
    <Tag
      className={cx(
        display && "type-display",
        size && `price-${size}`,
        tone && `price-${tone}`,
        wide && "price-wide",
        tabular && "price-tabular",
        className
      )}
    >
      {formatYen(amount)}
      {suffix}
    </Tag>
  );
}
