/**
 * 外部画像の差し替え
 * ---------------------------------------------------
 * 商品の画像は picsum.photos の絵で、next/image が /_next/image（サーバ側の最適化）経由で取りに行く。
 * 外への通信と遅さでテストが落ちないよう、どちらも 1×1 の PNG で返す。
 * 画像の見た目は E2E の仕事ではない（前後の撮影が担当）。
 */
import type { BrowserContext } from "@playwright/test";

/** 1×1 の PNG */
const PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64"
);

/** 差し替える URL: next/image の最適化（/_next/image）と、カタログの元画像（picsum） */
const IMAGE_ROUTES = ["**/_next/image**", "https://picsum.photos/**"];

export async function stubExternalImages(context: BrowserContext): Promise<void> {
  for (const pattern of IMAGE_ROUTES) {
    await context.route(pattern, (route) => route.fulfill({ contentType: "image/png", body: PIXEL_PNG }));
  }
}
