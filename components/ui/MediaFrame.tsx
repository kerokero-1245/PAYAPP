import type { ElementType, ReactElement, ReactNode } from "react";
import { cx } from "./cx";
import type { PolymorphicProps } from "./polymorphic";

type MediaFrameOwnProps = {
  ratio?: "4/5" | "none";
  thumb?: "sm" | "md";
  className?: string;
  children?: ReactNode;
};

/**
 * 画像の枠（next/image の fill を入れる）。
 * `as={Link} href=…` や `as="button" type=…` のように、要素の props をそのまま受けて要素へ渡す。
 */
export default function MediaFrame<T extends ElementType = "div">(
  props: PolymorphicProps<T, MediaFrameOwnProps>,
): ReactElement;
export default function MediaFrame({
  as: Tag = "div",
  ratio = "none",
  thumb,
  className,
  children,
  ...rest
}: MediaFrameOwnProps & { as?: ElementType }) {
  return (
    <Tag
      className={cx(
        "media",
        ratio === "4/5" && "media-4x5",
        thumb && `thumb-${thumb}`,
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
}
