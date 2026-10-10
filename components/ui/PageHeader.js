import Eyebrow from "./Eyebrow";
import Divider from "./Divider";
import Heading from "./Heading";
import { cx } from "./cx";

/**
 * ページ先頭の見出し（eyebrow + h1 + 下の hairline）。h1 の大きさは全ページ共通（.heading-page）。
 *
 * @param {{
 *   eyebrow: React.ReactNode, title: React.ReactNode,
 *   meta?: React.ReactNode,   h1 の横に並べる補足（「10 件」）
 *   note?: React.ReactNode,   h1 の下の補足
 *   divider?: "hairline" | "none",
 *   animate?: boolean,         fade-up で出す（読み込み中の仮表示などでは false）
 *   dividerOutside?: boolean,  線を <header> の外（後ろ）に置く。header の fade-up の外に出したいとき
 *   titleClassName?: string, dividerClassName?: string, className?: string,  配置だけ
 * }} props
 */
export default function PageHeader({
  eyebrow,
  title,
  meta,
  note,
  divider = "hairline",
  dividerOutside = false,
  animate = true,
  titleClassName = "mt-3",
  dividerClassName = "mt-5",
  className,
}) {
  const h1 = (
    <Heading as="h1" size="page" className={meta ? undefined : titleClassName}>
      {title}
    </Heading>
  );
  const line = divider === "hairline" && <Divider className={dividerClassName} />;
  const header = (
    <header className={cx(animate && "animate-fade-up", className)}>
      <Eyebrow>{eyebrow}</Eyebrow>
      {meta ? (
        <div className={cx("flex flex-wrap items-baseline gap-x-4 gap-y-1", titleClassName)}>
          {h1}
          <span className="meta">{meta}</span>
        </div>
      ) : (
        h1
      )}
      {note && <p className="meta meta-faint mt-2">{note}</p>}
      {!dividerOutside && line}
    </header>
  );
  if (!dividerOutside) return header;
  return (
    <>
      {header}
      {line}
    </>
  );
}
