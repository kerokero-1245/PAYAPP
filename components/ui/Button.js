import Link from "next/link";
import { cx } from "./cx";

/**
 * ボタン。href があればリンク（next/link）、無ければ <button>（既定 type="button"）。
 * 見た目は .btn + 種類（.btn-gold / .btn-outline）+ 大きさ（.btn-sm）+ 幅（.btn-block）。
 *
 * @param {{ variant?: "gold" | "outline", size?: "md" | "sm", block?: boolean, href?: string, className?: string, children?: React.ReactNode } & Record<string, unknown>} props
 *   className は配置（mt-8 など）だけに使う
 */
export default function Button({ variant = "gold", size = "md", block = false, href, className, children, ...rest }) {
  const classes = cx("btn", `btn-${variant}`, size === "sm" && "btn-sm", block && "btn-block", className);
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
