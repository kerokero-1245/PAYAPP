import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  clampQuantity,
  reconcileCart,
  removePurchasedFromCart,
} from "@/lib/cart.mjs";

/**
 * カート状態管理用の Zustand ストア
 *
 * - 商品の追加・削除・数量更新（数量は 1 行あたり 1〜99）
 * - 合計金額 / 合計点数の算出
 * - localStorage への永続化
 * - 価格・商品名などはカタログから id で引き直す（localStorage に残った値は信用しない）。
 *   カタログに無い id の行は戻すときに外す
 */
export const useCartStore = create(
  persist(
    (set, get) => ({
      items: [],

      // 既にカートにある場合は「上書き」ではなく「加算」する（合算後に上限 99 を当てる）
      addItem: (product, qty = 1) =>
        set((state) => ({
          items: reconcileCart([
            ...state.items,
            { id: product.id, quantity: clampQuantity(qty) },
          ]),
        })),

      removeItem: (id) =>
        set((state) => ({
          items: state.items.filter((i) => i.id !== id),
        })),

      updateQuantity: (id, quantity) =>
        set((state) => ({
          items: state.items.map((i) =>
            i.id === id ? { ...i, quantity: clampQuantity(quantity) } : i
          ),
        })),

      /** 決済が済んだ品目と数量だけを取り除く（決済後に足した品は残す） */
      removePurchased: (purchasedItems) =>
        set((state) => ({
          items: removePurchasedFromCart(state.items, purchasedItems),
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
      // localStorage から戻すときに、カタログに合わせて作り直す
      merge: (persisted, current) => ({
        ...current,
        items: reconcileCart(persisted?.items),
      }),
    }
  )
);
