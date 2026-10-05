/**
 * サイト全体の設定と、URL の決め方（純粋な関数）
 * ---------------------------------------------------
 * - parseBaseUrl / resolveMetadataBase: NEXT_PUBLIC_BASE_URL が未設定・不正でも例外にしない
 * - resolveReturnOrigin: 決済後の戻り先。リクエストの Origin ヘッダーは使わない
 */

export const SITE_NAME = "MAISON";
export const SITE_TITLE = "MAISON — PAYAPP";
export const SITE_DESCRIPTION =
  "選び抜かれた逸品だけを集めたラグジュアリー・オンラインストア。時計・レザー・フレグランス・ジュエリー。";

/** OGP の共通部分（商品ページは title / description だけ差し替える） */
export const SITE_OPEN_GRAPH = {
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  type: "website",
  locale: "ja_JP",
  siteName: SITE_NAME,
  images: [
    {
      url: "/og-image.png",
      width: 1200,
      height: 630,
      alt: "MAISON のトップページ",
    },
  ],
};

/**
 * NEXT_PUBLIC_BASE_URL のような値を URL にする。
 * 未設定・空・URL として読めない・http(s) 以外のときは null（例外にしない）。
 */
export function parseBaseUrl(value) {
  if (typeof value !== "string" || value.trim() === "") return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return new URL(url.origin);
  } catch {
    return null;
  }
}

/** metadataBase に渡す値。使えない値なら undefined（Next.js の既定に任せる） */
export function resolveMetadataBase(value) {
  return parseBaseUrl(value) ?? undefined;
}

/**
 * 決済後の戻り先（success_url / cancel_url）の origin を決める。
 * NEXT_PUBLIC_BASE_URL があればそれ、無ければリクエスト URL 自体の origin。
 * リクエストの Origin ヘッダーは利用者が自由に書き換えられるので使わない
 * （引数で headers を受け取っても見ない）。
 *
 * @param {{ requestUrl: string, baseUrl?: string, headers?: unknown }} input
 */
export function resolveReturnOrigin(input) {
  const base = parseBaseUrl(input.baseUrl);
  if (base) return base.origin;
  return new URL(input.requestUrl).origin;
}
