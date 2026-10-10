import { create } from "zustand";
import { persist } from "zustand/middleware";
import { appendOrder } from "@/lib/checkout";
import type { NewOrder } from "@/lib/checkout";
import type { Order } from "@/lib/types";

type OrderState = {
  /**
   * 注文履歴（新しい順）。localStorage から戻すときは検査していない（形を信用している）ので、
   * この型は実行時の保証ではない。
   */
  orders: Order[];
  addOrder: (order: NewOrder) => void;
  clearOrders: () => void;
};

/**
 * 注文履歴を管理する Zustand ストア（読み取り専用の残り物。段 4 で /orders をサーバから読む形にして、ストアごと消す）
 *
 * 注文の正本はサーバの DB になった（決済成功ページの確認 API と Stripe の Webhook が、同じ fulfillCheckout で確定する）。
 * このストアには、もう何も書かない（addOrder の呼び出し元は無い）。/orders はまだここを読むので、
 * 以前このブラウザに記録された注文は表示されるが、DB に確定した新しい注文は段 4 までここには出ない。
 * 保存先はこのブラウザの localStorage だけなので、履歴はブラウザごとに別だった。
 */
export const useOrderStore = create<OrderState>()(
  persist(
    (set) => ({
      orders: [],

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
    },
  ),
);
