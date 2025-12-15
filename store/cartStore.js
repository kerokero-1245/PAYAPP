import { create } from "zustand";
import {persist} from "zustand/middleware";

/**
 * カート状態管理用のZustandストア
 *
 * - 商品の追加・削除
 * - 数量更新
 * - 合計金額の算出
 * - localStorage への永続化
 */
export const useCartStore = create(
  persist(
    (set,get) => ({
      items: [],

  addItem: (product) =>
    set((state) => {
      const exists = state.items.find((i) => i.id === product.id);
      if (exists) {
        return {
          items: state.items.map((i) =>
            i.id === product.id
              ? { ...i, quantity: i.quantity + 1 }
              : i
          ),
        };
      }
      return {
        items: [...state.items, { ...product, quantity: 1 }],
      };
    }),

  removeItem: (id) =>
    set((state) => ({
      items: state.items.filter((i) => i.id !== id),
    })),

  totalPrice: () => {
    const items = get().items;
    return items.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    );
  },

  updateQuantity: (id, quantity) =>
    set((state) => ({
      items: state.items.map((i) =>
        i.id === id ? { ...i, quantity } : i
      ),
    })),
  }),
   { 
     name: "cart-storage",
     partialize: (state) => ({ items: state.items }),
   }
  )
);
