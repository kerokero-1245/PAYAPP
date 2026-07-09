import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * カート状態管理用の Zustand ストア
 *
 * - 商品の追加・削除・数量更新
 * - 合計金額 / 合計点数の算出
 * - localStorage への永続化
 */
export const useCartStore = create(
  persist(
    (set, get) => ({
      items: [],

      addItem: (product, qty = 1) =>
        set((state) => {
          // 追加数量は 1 以上に丸める（詳細ページの数量セレクタから複数個追加も可能）
          const amount = Math.max(1, Number(qty) || 1);
          const exists = state.items.find((i) => i.id === product.id);
          if (exists) {
            // 既にカートにある場合は「上書き」ではなく「加算」する
            return {
              items: state.items.map((i) =>
                i.id === product.id
                  ? { ...i, quantity: i.quantity + amount }
                  : i
              ),
            };
          }
          // カート行に必要な情報だけを正規化して保持（サムネ含む）
          const image = product.images?.[0] ?? product.image ?? null;
          return {
            items: [
              ...state.items,
              {
                id: product.id,
                name: product.name,
                price: product.price,
                image,
                category: product.category ?? null,
                quantity: amount,
              },
            ],
          };
        }),

      removeItem: (id) =>
        set((state) => ({
          items: state.items.filter((i) => i.id !== id),
        })),

      updateQuantity: (id, quantity) =>
        set((state) => ({
          items: state.items.map((i) =>
            // 数量は 1 以上に丸める（0 や NaN を防ぐ）
            i.id === id
              ? { ...i, quantity: Math.max(1, Number(quantity) || 1) }
              : i
          ),
        })),

      clearCart: () => set({ items: [] }),

      totalPrice: () =>
        get().items.reduce((sum, item) => sum + item.price * item.quantity, 0),

      totalItems: () =>
        get().items.reduce((sum, item) => sum + item.quantity, 0),
    }),
    {
      name: "cart-storage",
      partialize: (state) => ({ items: state.items }),
    }
  )
);