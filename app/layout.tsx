import type { Metadata, Viewport } from "next";
import { Playfair_Display, Inter } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import {
  SITE_DESCRIPTION,
  SITE_OPEN_GRAPH,
  SITE_TITLE,
  resolveMetadataBase,
} from "@/lib/site.mjs";

/** 見出し用のセリフ（ラグジュアリー感） */
const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

/** 本文・UI用のサンセリフ */
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  // OGP 画像などを絶対 URL にする基準。NEXT_PUBLIC_BASE_URL が未設定・不正なら
  // 例外にせず Next.js の既定（Vercel では本番 URL、ローカルでは http://localhost:<port>）に任せる。
  metadataBase: resolveMetadataBase(process.env.NEXT_PUBLIC_BASE_URL),
  title: {
    default: SITE_TITLE,
    template: "%s | MAISON",
  },
  description: SITE_DESCRIPTION,
  openGraph: SITE_OPEN_GRAPH,
};

export const viewport: Viewport = {
  themeColor: "#0b0b0d",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className={`${playfair.variable} ${inter.variable}`}>
      <body className="min-h-screen flex flex-col antialiased">
        {/* キーボード操作でヘッダーを飛ばして本文へ移るためのリンク（フォーカス時だけ表示） */}
        <a href="#main-content" className="skip-link btn btn-gold">
          本文へスキップ
        </a>
        <Header />
        {/* tabIndex=-1: スキップリンクで飛んだときにフォーカスを main に移す。
            scroll-mt: 固定ヘッダーの下に main の先頭が隠れないようにする */}
        <main id="main-content" tabIndex={-1} className="flex-1 scroll-mt-28 outline-none">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}