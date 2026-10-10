import type { ElementType, ReactNode } from "react";
import { cx } from "./cx";

type EyebrowProps = {
  /** 描画する要素（既定は p） */
  as?: ElementType;
  size?: "md" | "sm";
  tone?: "gold" | "faint" | "soft";
  tracking?: "sm" | "md" | "lg";
  className?: string;
  children?: ReactNode;
};

/**
 * 小さなラベル見出し（NEW ARRIVALS など）。
 */
export default function Eyebrow({
  as: Tag = "p",
  size = "md",
  tone = "gold",
  tracking,
  className,
  children,
}: EyebrowProps) {
  return (
    <Tag
      className={cx(
        "eyebrow",
        size === "sm" && "eyebrow-sm",
        tone !== "gold" && `eyebrow-${tone}`,
        tracking && `eyebrow-track-${tracking}`,
        className,
      )}
    >
      {children}
    </Tag>
  );
}
