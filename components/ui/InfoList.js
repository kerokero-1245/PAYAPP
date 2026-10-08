import { cx } from "./cx";

/**
 * 項目と内容の一覧（<dl>）。配送について・特定商取引法に基づく表記・お問い合わせの確認で使う。
 * @param {{ items: { term: React.ReactNode, desc: React.ReactNode }[], className?: string }} props
 */
export default function InfoList({ items, className }) {
  return (
    <dl className={cx("info-list", className)}>
      {items.map((item, i) => (
        <div key={i} className="info-row">
          <dt className="info-term">{item.term}</dt>
          <dd className="info-desc">{item.desc}</dd>
        </div>
      ))}
    </dl>
  );
}
