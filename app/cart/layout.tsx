import type { Metadata } from "next";

// カートのタイトル。ページ本体は "use client" で metadata を書けないため、ここで指定する。
export const metadata: Metadata = { title: "カート" };

export default function Layout({ children }: LayoutProps<"/cart">) {
  return children;
}
