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
};

export default nextConfig;