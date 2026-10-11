import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Next 16 では images.domains は非推奨のため remotePatterns を使用
    remotePatterns: [
      { protocol: "https", hostname: "picsum.photos" },
      { protocol: "https", hostname: "fastly.picsum.photos" },
      { protocol: "https", hostname: "placehold.co" },
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
  },
  // 全ページを、他のサイトの <iframe> に入れられないようにする（ログイン・新規登録・ログアウトの画面を透明にかぶせて
  // 押させるクリックジャッキングを防ぐ）。frame-ancestors は現行の規格、X-Frame-Options は同じことを古いブラウザにも伝える。
  // tests/next-config.test.ts が確かめている
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'none'",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
