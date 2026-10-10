/**
 * カテゴリへのリンク（ヘッダーのナビ・フッターの列・サイドメニュー・トップのタイルで共有する）。
 * カテゴリの slug と名前の正本は lib/catalog.ts の CATEGORIES。ここではそれから URL を作るだけ。
 */
import { CATEGORIES } from "./catalog.ts";

/** カテゴリの一覧ページの URL（"all" はクエリなしの /product） */
export function categoryHref(slug: string): string {
  return slug === "all" ? "/product" : `/product?category=${slug}`;
}

/** "all" を除くカテゴリのリンク（CATEGORIES の並び順） */
export const CATEGORY_LINKS: { slug: string; href: string; label: string }[] = CATEGORIES.filter(
  (c) => c.slug !== "all"
).map((c) => ({ slug: c.slug, href: categoryHref(c.slug), label: c.label }));
