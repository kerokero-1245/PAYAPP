import type { ElementType, ReactElement, ReactNode } from "react";
import { cx } from "./cx";
import type { PolymorphicProps } from "./polymorphic";

const SPACING = { sm: "section-sm", md: "section-md", lg: "section-lg", top: "section-top" };
const WIDTH = { wide: null, narrow: "container-narrow" };

type SectionOwnProps = {
  /** 上下の余白（⑤-0 の sm / md / lg / top） */
  spacing?: "sm" | "md" | "lg" | "top";
  width?: "wide" | "narrow";
  className?: string;
  children?: ReactNode;
};

/**
 * ページの節。コンテナ（.container-lux）と上下余白（⑤-0 の sm / md / lg / top）を 1 つの要素に付ける。
 */
export default function Section<T extends ElementType = "section">(props: PolymorphicProps<T, SectionOwnProps>): ReactElement;
export default function Section({
  as: Tag = "section",
  spacing = "md",
  width = "wide",
  className,
  children,
  ...rest
}: SectionOwnProps & { as?: ElementType }) {
  return (
    <Tag className={cx("container-lux", WIDTH[width], SPACING[spacing], className)} {...rest}>
      {children}
    </Tag>
  );
}
