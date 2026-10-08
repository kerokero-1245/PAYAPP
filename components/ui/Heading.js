import { cx } from "./cx";

/**
 * 見出しの文字（.heading + 大きさ）。
 * @param {{ as?: string, size?: "page" | "section" | "block" | "card" | "item" | "display" | "hero" | "tile", leading?: "tight" | "snug", className?: string, children?: React.ReactNode }} props
 */
export default function Heading({ as: Tag = "h2", size = "section", leading, className, children }) {
  return <Tag className={cx("heading", `heading-${size}`, leading && `heading-${leading}`, className)}>{children}</Tag>;
}
