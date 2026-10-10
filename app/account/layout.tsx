import type { Metadata } from "next";

// アカウントのタイトル。ページ本体は "use client" で metadata を書けないため、ここで指定する。
export const metadata: Metadata = { title: "アカウント" };

export default function Layout({ children }: LayoutProps<"/account">) {
  return children;
}
