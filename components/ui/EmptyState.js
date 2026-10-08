import Eyebrow from "./Eyebrow";
import Button from "./Button";
import { cx } from "./cx";

/**
 * 空の表示（該当なし・注文なし・未ログイン・カートが空）。
 *
 * @param {{
 *   framed?: "none" | "card" | "panel",  枠の面（余白は padding）
 *   padding?: "sm" | "md" | "lg",
 *   layout?: "flow" | "stack",           flow: 余白で並べる / stack: 等間隔に詰める
 *   icon?: React.ReactNode, eyebrow?: React.ReactNode,
 *   title: React.ReactNode, titleAs?: string, titleSize?: "page" | "section" | "block",
 *   description: React.ReactNode,
 *   action?: { href: string, label: string, variant?: "gold" | "outline" },
 *   className?: string, titleClassName?: string, descriptionClassName?: string, actionClassName?: string,  配置だけ
 * }} props
 */
export default function EmptyState({
  framed = "none",
  padding,
  layout = "flow",
  icon,
  eyebrow,
  title,
  titleAs: Title = "h2",
  titleSize = "section",
  description,
  action,
  className,
  titleClassName,
  descriptionClassName = "mt-3",
  actionClassName = "mt-8",
}) {
  const stack = layout === "stack";
  return (
    <div
      className={cx(
        "empty",
        stack && "empty-stack",
        framed !== "none" && framed,
        padding && `pad-${padding}`,
        className
      )}
    >
      {icon && <div className="empty-icon mb-8">{icon}</div>}
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <Title className={cx("heading", `heading-${titleSize}`, titleClassName)}>{title}</Title>
      <p className={cx("lead", stack ? "max-w-md" : descriptionClassName)}>{description}</p>
      {action && (
        <Button href={action.href} variant={action.variant ?? "gold"} className={actionClassName}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
