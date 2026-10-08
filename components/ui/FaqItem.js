/**
 * よくある質問の 1 項目（<details> / <summary>。JS なしで開閉する）
 * @param {{ question: React.ReactNode, children: React.ReactNode }} props
 */
export default function FaqItem({ question, children }) {
  return (
    <details className="faq-item">
      <summary className="faq-q">{question}</summary>
      <div className="faq-a">{children}</div>
    </details>
  );
}
