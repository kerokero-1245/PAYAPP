import type { Metadata } from "next";

// 注文履歴のタイトル。ページ本体は "use client" で metadata を書けないため、ここで指定する。
export const metadata: Metadata = { title: "注文履歴" };

export default function Layout({ children }: LayoutProps<"/orders">) {
  return children;
}
