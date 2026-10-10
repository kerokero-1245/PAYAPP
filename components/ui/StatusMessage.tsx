import type { ElementType, ReactNode, Ref } from "react";
import Eyebrow from "./Eyebrow";
import Divider from "./Divider";
import Actions from "./Actions";
import StatusIcon from "./StatusIcon";
import Heading from "./Heading";
import { cx } from "./cx";

type StatusMessageProps = {
  icon?: "check" | "notice" | "cancel";
  eyebrow: ReactNode;
  title: ReactNode;
  lead: ReactNode;
  actions?: ReactNode;
  /** 本文の下に足す中身 */
  children?: ReactNode;
  /** 見出しの要素（既定は h1） */
  titleAs?: ElementType;
  /** false: ページの中に置くとき（コンテナと上下余白を付けない。お問い合わせの送信済み） */
  contained?: boolean;
  /** 読み上げの領域（"status" など） */
  role?: string;
  /** 見出しへフォーカスを移すとき（見出しに tabIndex=-1 を付ける） */
  titleRef?: Ref<HTMLElement>;
  className?: string;
};

/**
 * 結果画面（404・決済の結果・お問い合わせの送信済み）の骨組み:
 * マーク → eyebrow → h1 → 金の短い線 → 本文 → （追加の中身）→ ボタンの並び。中央寄せ・上下余白 lg。
 */
export default function StatusMessage({
  icon,
  eyebrow,
  title,
  lead,
  actions,
  children,
  titleAs: Title = "h1",
  contained = true,
  role,
  titleRef,
  className,
}: StatusMessageProps) {
  return (
    <div role={role} className={cx(contained && "container-lux container-narrow section-lg", "text-center animate-fade-up", className)}>
      {icon && <StatusIcon kind={icon} />}
      <Eyebrow className={icon ? "mt-8" : undefined}>{eyebrow}</Eyebrow>
      <Heading as={Title} ref={titleRef} tabIndex={titleRef ? -1 : undefined} size="page" className="mt-4">
        {title}
      </Heading>
      <Divider variant="rule" className="mt-6" />
      <p className="lead mt-6">{lead}</p>
      {children}
      {actions && <Actions className="mt-10">{actions}</Actions>}
    </div>
  );
}
