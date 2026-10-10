import type { ReactNode } from "react";
import Card from "./Card";

type DemoNoteProps = {
  /** 注記の本文（先頭の「※ 」は部品が付ける） */
  children: ReactNode;
  /** 配置・出方だけ（animate-fade-in など） */
  className?: string;
};

/**
 * デモであることの注記のパネル（特定商取引法に基づく表記・お問い合わせ）。
 * 面・余白・文字の大きさはここで決め、ページごとにずれないようにする。
 */
export default function DemoNote({ children, className }: DemoNoteProps) {
  return (
    <Card variant="panel" padding="sm" className={className}>
      <p className="fine fine-relaxed">※ {children}</p>
    </Card>
  );
}
