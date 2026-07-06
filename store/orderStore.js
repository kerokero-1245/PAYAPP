import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * 注文履歴を管理する Zustand ストア
 *
 * 決済成功ページでカート内容から注文を生成し、履歴として永続化する。
 * （バックエンドが無いため localStorage 上のデモ実装）
 */
export const useOrderStore = create(
  persist(
    (set) => ({
      orders: [], // { id, date, items, total }[]

      /** 注文を追加。id / date は呼び出し側で付与、無ければ生成 */
      addOrder: (order) =>
        set((state) => {
          const record = {
            id: order.id ?? `ORD-${Date.now().toString(36).toUpperCase()}`,
            date: order.date ?? new Date().toISOString(),
            items: order.items ?? [],
            total: order.total ?? 0,
          };
          return { orders: [record, ...state.orders] };
        }),

      clearOrders: () => set({ orders: [] }),
    }),
    {
      name: "order-storage",
    }
  )
);