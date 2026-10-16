import type { Metadata } from "next";

// 商品一覧（/product）のタイトル。ページ本体は "use client" で metadata を書けないため、ここで指定する。
// 子（商品詳細）のタイトルにも「| MAISON NOIR」を付けるため、template も持たせる。
export const metadata: Metadata = {
  title: { default: "ショップ", template: "%s | MAISON NOIR" },
};

export default function Layout({ children }: LayoutProps<"/product">) {
  return children;
}
