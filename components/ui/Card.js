import { cx } from "./cx";

const PAD = { none: null, sm: "pad-sm", md: "pad-md", lg: "pad-lg" };

/**
 * 面。card: 平らな面 / panel: 上から下へ暗くなる面。中の余白は ⑤-0 の sm / md / lg。
 * @param {{ as?: string, variant?: "card" | "panel", interactive?: boolean, padding?: "none" | "sm" | "md" | "lg", className?: string, children?: React.ReactNode } & Record<string, unknown>} props
 */
export default function Card({ as: Tag = "div", variant = "card", interactive = false, padding = "none", className, children, ...rest }) {
  return (
    <Tag className={cx(variant, interactive && "card-hover", PAD[padding], className)} {...rest}>
      {children}
    </Tag>
  );
}
