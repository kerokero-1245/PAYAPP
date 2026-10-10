import { create } from "zustand";
import { CATEGORIES, PRODUCTS, getProductById } from "@/lib/catalog";
import type { Category, Product } from "@/lib/types";

/**
 * 商品カタログを管理する Zustand ストア
 *
 * - カタログの正本は lib/catalog.ts（サーバの /checkout と共有する素のモジュール）
 * - 商品は「ソースデータ」であってユーザー状態ではないため persist しない
 *   （persist すると旧 localStorage の古いカタログで上書きされてしまう）
 */

/** カテゴリ定義（サイドメニュー・絞り込みで共有）と、id からの商品取得（カタログと同じ関数） */
export { CATEGORIES, getProductById };

type ProductState = {
  products: Product[];
  categories: Category[];
};

export const useProductStore = create<ProductState>(() => ({
  products: PRODUCTS,
  categories: CATEGORIES,
}));
