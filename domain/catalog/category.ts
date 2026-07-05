/**
 * Category — 商品カテゴリ（Catalog コンテキストの値）
 *
 * カテゴリはサイドメニュー・絞り込み・商品の分類で共有される固定の語彙。
 * スラッグの集合をドメインの単一の真実として定義し、妥当性検証を提供する。
 */
export const CATEGORY_SLUGS = [
  "watches",
  "leather",
  "fragrance",
  "jewelry",
] as const;

export type CategorySlug = (typeof CATEGORY_SLUGS)[number];

/** 絞り込み用の「すべて」を含めた表示用定義 */
export interface CategoryDef {
  slug: CategorySlug | "all";
  label: string;
  jp: string;
}

export const CATEGORIES: readonly CategoryDef[] = [
  { slug: "all", label: "すべて", jp: "All" },
  { slug: "watches", label: "時計", jp: "Watches" },
  { slug: "leather", label: "レザー", jp: "Leather" },
  { slug: "fragrance", label: "フレグランス", jp: "Fragrance" },
  { slug: "jewelry", label: "ジュエリー", jp: "Jewelry" },
];

/** 実在するカテゴリスラッグかどうか（"all" は分類ではないため false） */
export function isCategorySlug(value: unknown): value is CategorySlug {
  return (
    typeof value === "string" &&
    (CATEGORY_SLUGS as readonly string[]).includes(value)
  );
}
