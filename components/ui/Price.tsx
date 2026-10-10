import type { ElementType, ReactNode } from "react";
import { formatYen } from "@/lib/format";
import { cx } from "./cx";

type PriceProps = {
  amount: number;
  /** 描画する要素（既定は span） */
  as?: ElementType;
  /** 省略すると親の大きさ */
  size?: "xs" | "base" | "lg" | "xl" | "hero";
  tone?: "cream" | "gold" | "gold-soft" | "muted" | "faint";
  /** 見出しの書体 */
  display?: boolean;
  /** 字間を少し空ける */
  wide?: boolean;
  /** 数字の幅をそろえる */
  tabular?: boolean;
  suffix?: ReactNode;
  className?: string;
};

/**
 * 金額（¥248,000）。
 */
export default function Price({ amount, as: Tag = "span", size, tone, display, wide, tabular, suffix, className }: PriceProps) {
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
