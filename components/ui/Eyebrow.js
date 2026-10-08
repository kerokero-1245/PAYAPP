import { cx } from "./cx";

/**
 * 小さなラベル見出し（NEW ARRIVALS など）。
 * @param {{ as?: string, size?: "md" | "sm", tone?: "gold" | "faint" | "soft", tracking?: "sm" | "md" | "lg", className?: string }} props
 */
export default function Eyebrow({ as: Tag = "p", size = "md", tone = "gold", tracking, className, children }) {
  return (
    <Tag
      className={cx(
        "eyebrow",
        size === "sm" && "eyebrow-sm",
        tone !== "gold" && `eyebrow-${tone}`,
        tracking && `eyebrow-track-${tracking}`,
        className
      )}
    >
      {children}
    </Tag>
  );
}
