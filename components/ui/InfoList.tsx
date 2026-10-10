import type { ReactNode } from "react";
import { cx } from "./cx";

type InfoListProps = {
  items: { term: ReactNode; desc: ReactNode }[];
  className?: string;
};

/**
 * 項目と内容の一覧（<dl>）。配送について・特定商取引法に基づく表記・お問い合わせの確認で使う。
 */
export default function InfoList({ items, className }: InfoListProps) {
  return (
    <dl className={cx("info-list", className)}>
      {items.map((item, i) => (
        <div key={i} className="info-row">
          <dt className="info-term">{item.term}</dt>
          <dd className="lead">{item.desc}</dd>
        </div>
      ))}
    </dl>
  );
}
