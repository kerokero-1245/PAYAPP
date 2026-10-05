import { create } from "zustand";
import { persist } from "zustand/middleware";
import { appendOrder } from "@/lib/checkout.mjs";

/**
 * 注文履歴を管理する Zustand ストア
 *
 * 決済成功ページで、Stripe の決済確認が取れたときだけ、支払った session の内容
 * （品目・単価・数量・合計）で注文を記録する。保存先はこのブラウザの localStorage だけの
 * デモ実装なので、注文履歴はブラウザごとに別になる。
 * sessionId 付きの注文は同じ sessionId で二重に記録しない。
 */
export const useOrderStore = create(
  persist(
    (set) => ({
      orders: [], // { id, date, items, total, sessionId? }[]

      /** 注文を追加。id / date は呼び出し側で付与、無ければ生成。記録済みの sessionId なら何もしない */
      addOrder: (order) =>
        set((state) => {
          const orders = appendOrder(state.orders, order);
          return orders === state.orders ? state : { orders };
        }),

      clearOrders: () => set({ orders: [] }),
    }),
    {
      name: "order-storage",
    }
  )
);