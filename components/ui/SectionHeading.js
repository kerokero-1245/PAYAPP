import Eyebrow from "./Eyebrow";
import Divider from "./Divider";
import Heading from "./Heading";
import { cx } from "./cx";

/**
 * 節の見出し（eyebrow + h2 + 金の短い線 + 導入文）。
 * center: 中央寄せの縦並び（トップ）/ start: 左寄せ（関連商品・新ページの節）
 * @param {{ eyebrow?: React.ReactNode, title: React.ReactNode, lead?: React.ReactNode, align?: "center" | "start", size?: "page" | "section", className?: string }} props
 */
export default function SectionHeading({ eyebrow, title, lead, align = "center", size, className }) {
  if (align === "center") {
    return (
      <div className={cx("flex flex-col items-center text-center gap-3", className)}>
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <Heading size={size ?? "page"}>{title}</Heading>
        <Divider variant="rule" />
        {lead && <p className="lead max-w-xl">{lead}</p>}
      </div>
    );
  }
  return (
    <div className={className}>
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <Heading size={size ?? "section"} className={eyebrow ? "mt-2" : undefined}>
        {title}
      </Heading>
      <Divider variant="rule" className="mt-4" />
      {lead && <p className="lead mt-4">{lead}</p>}
    </div>
  );
}
