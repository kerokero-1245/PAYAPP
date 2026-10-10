import type { ElementType, ReactElement, ReactNode } from "react";
import { cx } from "./cx";
import type { PolymorphicProps } from "./polymorphic";

const PAD = { none: null, sm: "pad-sm", md: "pad-md", lg: "pad-lg" };

type CardOwnProps = {
  /** card: 平らな面 / panel: 上から下へ暗くなる面 */
  variant?: "card" | "panel";
  interactive?: boolean;
  /** 中の余白（⑤-0 の sm / md / lg） */
  padding?: "none" | "sm" | "md" | "lg";
  className?: string;
  children?: ReactNode;
};

/**
 * 面。card: 平らな面 / panel: 上から下へ暗くなる面。中の余白は ⑤-0 の sm / md / lg。
 * `as` の要素の props（onPointerEnter など）はそのまま要素へ渡す。
 */
export default function Card<T extends ElementType = "div">(
  props: PolymorphicProps<T, CardOwnProps>,
): ReactElement;
export default function Card({
  as: Tag = "div",
  variant = "card",
  interactive = false,
  padding = "none",
  className,
  children,
  ...rest
}: CardOwnProps & { as?: ElementType }) {
  return (
    <Tag
      className={cx(
        variant,
        interactive && "card-hover",
        PAD[padding],
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
}
