import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactElement, ReactNode } from "react";
import { cx } from "./cx";

type ButtonOwnProps = {
  variant?: "gold" | "outline";
  size?: "md" | "sm";
  block?: boolean;
  /** 配置（mt-8 など）だけに使う */
  className?: string;
  children?: ReactNode;
};

/** href があるとき: next/link の props をそのまま受ける */
type ButtonAsLinkProps = ButtonOwnProps &
  Omit<ComponentPropsWithoutRef<typeof Link>, keyof ButtonOwnProps>;

/** href が無いとき: <button> の props をそのまま受ける */
type ButtonAsButtonProps = ButtonOwnProps &
  Omit<ComponentPropsWithoutRef<"button">, keyof ButtonOwnProps> & {
    href?: undefined;
  };

/**
 * ボタン。href があればリンク（next/link）、無ければ <button>（既定 type="button"）。
 * 見た目は .btn + 種類（.btn-gold / .btn-outline）+ 大きさ（.btn-sm）+ 幅（.btn-block）。
 * 呼び出し側の型は上の 2 つのオーバーロードで決まり、下の実装は href の有無だけを見て、ほかの props はそのまま要素へ渡す。
 */
export default function Button(props: ButtonAsLinkProps): ReactElement;
export default function Button(props: ButtonAsButtonProps): ReactElement;
export default function Button({
  variant = "gold",
  size = "md",
  block = false,
  href,
  className,
  children,
  ...rest
}: ButtonOwnProps & { href?: ComponentPropsWithoutRef<typeof Link>["href"] }) {
  const classes = cx(
    "btn",
    `btn-${variant}`,
    size === "sm" && "btn-sm",
    block && "btn-block",
    className,
  );
  if (href) {
    return (
      <Link href={href} className={classes} {...rest}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" className={classes} {...rest}>
      {children}
    </button>
  );
}
