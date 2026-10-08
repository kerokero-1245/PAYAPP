import { cx } from "./cx";

/**
 * 画像の枠（next/image の fill を入れる）。
 * @param {{ as?: string, ratio?: "4/5" | "none", thumb?: "sm" | "md", className?: string, children?: React.ReactNode } & Record<string, unknown>} props
 */
export default function MediaFrame({ as: Tag = "div", ratio = "none", thumb, className, children, ...rest }) {
  return (
    <Tag className={cx("media", ratio === "4/5" && "media-4x5", thumb && `thumb-${thumb}`, className)} {...rest}>
      {children}
    </Tag>
  );
}
