import Eyebrow from "./Eyebrow";
import Divider from "./Divider";
import Actions from "./Actions";
import StatusIcon from "./StatusIcon";
import { cx } from "./cx";

/**
 * 結果画面（404・決済の結果・お問い合わせの送信済み）の骨組み:
 * マーク → eyebrow → h1 → 金の短い線 → 本文 → （追加の中身）→ ボタンの並び。中央寄せ・上下余白 lg。
 *
 * @param {{ icon?: "check" | "notice" | "cancel", eyebrow: React.ReactNode, title: React.ReactNode,
 *   lead: React.ReactNode, actions?: React.ReactNode, children?: React.ReactNode, titleAs?: string,
 *   contained?: boolean, role?: string, titleRef?: React.Ref<HTMLElement>, className?: string }} props
 *   contained=false: ページの中に置くとき（コンテナと上下余白を付けない。お問い合わせの送信済み）
 *   role: 読み上げの領域（"status" など）。titleRef: 見出しへフォーカスを移すとき（見出しに tabIndex=-1 を付ける）
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
}) {
  return (
    <div role={role} className={cx(contained && "container-lux container-narrow section-lg", "text-center animate-fade-up", className)}>
      {icon && <StatusIcon kind={icon} />}
      <Eyebrow className={icon ? "mt-8" : undefined}>{eyebrow}</Eyebrow>
      <Title ref={titleRef} tabIndex={titleRef ? -1 : undefined} className="heading heading-page mt-4">
        {title}
      </Title>
      <Divider variant="rule" className="mt-6" />
      <p className="lead mt-6">{lead}</p>
      {children}
      {actions && <Actions className="mt-10">{actions}</Actions>}
    </div>
  );
}
