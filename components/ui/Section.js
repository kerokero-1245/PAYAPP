import { cx } from "./cx";

const SPACING = { sm: "section-sm", md: "section-md", lg: "section-lg", top: "section-top" };
const WIDTH = { wide: null, narrow: "container-narrow", form: "container-form" };

/**
 * ページの節。コンテナ（.container-lux）と上下余白（⑤-0 の sm / md / lg / top）を 1 つの要素に付ける。
 * @param {{ as?: string, spacing?: "sm" | "md" | "lg" | "top", width?: "wide" | "narrow" | "form", className?: string, children?: React.ReactNode }} props
 */
export default function Section({ as: Tag = "section", spacing = "md", width = "wide", className, children, ...rest }) {
  return (
    <Tag className={cx("container-lux", WIDTH[width], SPACING[spacing], className)} {...rest}>
      {children}
    </Tag>
  );
}
