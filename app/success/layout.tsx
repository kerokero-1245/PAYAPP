import type { Metadata } from "next";

// 決済結果（/success）のタイトル。ページ本体は "use client" で metadata を書けないため、ここで指定する。
export const metadata: Metadata = { title: "ご注文の確認" };

export default function Layout({ children }: LayoutProps<"/success">) {
  return children;
}
