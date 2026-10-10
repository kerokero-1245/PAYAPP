import type { Metadata } from "next";

// ログインのタイトル。ページ本体は "use client" で metadata を書けないため、ここで指定する。
export const metadata: Metadata = { title: "ログイン" };

export default function Layout({ children }: LayoutProps<"/login">) {
  return children;
}
