import Eyebrow from "./Eyebrow";
import Divider from "./Divider";
import Heading from "./Heading";
import type { ReactNode } from "react";
import { cx } from "./cx";

type PageHeaderProps = {
  eyebrow: ReactNode;
  title: ReactNode;
  /** h1 の横に並べる補足（「10 件」） */
  meta?: ReactNode;
  /** h1 の下の補足 */
  note?: ReactNode;
  divider?: "hairline" | "none";
  /** fade-up で出す（読み込み中の仮表示などでは false） */
  animate?: boolean;
  /** 線を <header> の外（後ろ）に置く。header の fade-up の外に出したいとき */
  dividerOutside?: boolean;
  /** 配置だけ */
  titleClassName?: string;
  dividerClassName?: string;
  className?: string;
};

/**
 * ページ先頭の見出し（eyebrow + h1 + 下の hairline）。h1 の大きさは全ページ共通（.heading-page）。
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
}: PageHeaderProps) {
  const h1 = (
    <Heading as="h1" size="page" className={meta ? undefined : titleClassName}>
      {title}
    </Heading>
  );
  const line = divider === "hairline" && (
    <Divider className={dividerClassName} />
  );
  const header = (
    <header className={cx(animate && "animate-fade-up", className)}>
      <Eyebrow>{eyebrow}</Eyebrow>
      {meta ? (
        <div
          className={cx(
            "flex flex-wrap items-baseline gap-x-4 gap-y-1",
            titleClassName,
          )}
        >
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
