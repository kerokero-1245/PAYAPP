import type { ReactNode } from "react";

type FaqItemProps = {
  question: ReactNode;
  children: ReactNode;
};

/**
 * よくある質問の 1 項目（<details> / <summary>。JS なしで開閉する）
 */
export default function FaqItem({ question, children }: FaqItemProps) {
  return (
    <details className="faq-item">
      <summary className="faq-q">{question}</summary>
      <div className="faq-a">{children}</div>
    </details>
  );
}
