import { cx } from "./cx";

/**
 * 見出しの文字（.type-display の書体 + .heading の色 + 大きさ）。見出しの class はここでだけ組み立てる。
 * @param {{ as?: React.ElementType, size?: "page" | "section" | "block" | "card" | "item" | "display" | "hero" | "tile",
 *   leading?: "tight" | "snug", className?: string, children?: React.ReactNode } & Record<string, unknown>} props
 *   className は配置（mt-3 など）と、リンクの色（heading-link）・truncate だけ。ほかの props（href・ref・tabIndex）は要素へ渡す
 */
export default function Heading({ as: Tag = "h2", size = "section", leading, className, children, ...rest }) {
  return (
    <Tag className={cx("type-display heading", `heading-${size}`, leading && `heading-${leading}`, className)} {...rest}>
      {children}
    </Tag>
  );
}
