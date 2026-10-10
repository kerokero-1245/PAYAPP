import type { ElementType, ReactElement, ReactNode } from "react";
import { cx } from "./cx";
import type { PolymorphicProps } from "./polymorphic";

/** 見出しの大きさ（.heading-page など） */
export type HeadingSize = "page" | "section" | "block" | "card" | "item" | "display" | "hero" | "tile";

type HeadingOwnProps = {
  size?: HeadingSize;
  leading?: "tight" | "snug";
  /** 配置（mt-3 など）と、リンクの色（heading-link）・truncate だけ */
  className?: string;
  children?: ReactNode;
};

/**
 * 見出しの文字（.type-display の書体 + .heading の色 + 大きさ）。見出しの class はここでだけ組み立てる。
 * ほかの props（href・ref・tabIndex）は要素へ渡す。
 */
export default function Heading<T extends ElementType = "h2">(props: PolymorphicProps<T, HeadingOwnProps>): ReactElement;
export default function Heading({
  as: Tag = "h2",
  size = "section",
  leading,
  className,
  children,
  ...rest
}: HeadingOwnProps & { as?: ElementType }) {
  return (
    <Tag className={cx("type-display heading", `heading-${size}`, leading && `heading-${leading}`, className)} {...rest}>
      {children}
    </Tag>
  );
}
