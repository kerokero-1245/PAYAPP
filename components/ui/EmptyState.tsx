import type { ElementType, ReactNode } from "react";
import Eyebrow from "./Eyebrow";
import Button from "./Button";
import Heading from "./Heading";
import type { HeadingSize } from "./Heading";
import { cx } from "./cx";

type EmptyStateProps = {
  /** 枠の面（余白は padding） */
  framed?: "none" | "card" | "panel";
  padding?: "sm" | "md" | "lg";
  /** flow: 余白で並べる / stack: 等間隔に詰める */
  layout?: "flow" | "stack";
  icon?: ReactNode;
  eyebrow?: ReactNode;
  title: ReactNode;
  /** 見出しの要素（既定は h2） */
  titleAs?: ElementType;
  titleSize?: HeadingSize;
  description: ReactNode;
  action?: { href: string; label: string; variant?: "gold" | "outline" };
  /** 配置だけ */
  className?: string;
  titleClassName?: string;
  descriptionClassName?: string;
  actionClassName?: string;
};

/**
 * 空の表示（該当なし・注文なし・未ログイン・カートが空）。
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
}: EmptyStateProps) {
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
      {icon && <div className="circle-icon empty-icon mb-8">{icon}</div>}
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <Heading as={Title} size={titleSize} className={titleClassName}>
        {title}
      </Heading>
      <p className={cx("lead", stack ? "max-w-md" : descriptionClassName)}>{description}</p>
      {action && (
        <Button href={action.href} variant={action.variant ?? "gold"} className={actionClassName}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
