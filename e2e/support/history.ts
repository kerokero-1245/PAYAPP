/**
 * 注文履歴（/orders）の E2E が見る、E2E 専用の DB に入れておく利用者と注文
 * ---------------------------------------------------
 * seed（e2e/seed.ts。サーバを立てる前に打つ）と orders.spec.ts の両方が読む。Playwright には依存しない（Node から直接読める）。
 * 買う操作（Stripe の決済）は E2E では行わないので、「Webhook が先に確定していた注文」を DB に入れておく。
 * 日付は日本時間の昼（UTC の 03:00）にして、どの時刻の環境でも画面の日付が変わらないようにする。
 */
import type { ItemQuantity } from "../../lib/types.ts";

/** 注文を持つ利用者（seed が Better Auth で登録する。ダミーのパスワードで、本物の秘密ではない） */
export const HISTORY_BUYER = {
  name: "E2E 買い手",
  email: "e2e-history-buyer@example.com",
  password: "e2e-history-buyer-passphrase-2026",
} as const;

/** seed する注文 1 件 */
export type SeededOrder = {
  /** 画面に出す注文番号（generateOrderNo の形: ORD- と英大文字・数字 10 文字） */
  orderNo: string;
  /** Checkout Session の id（成功ページの確認が、Stripe を呼ばずにこの注文を返す） */
  sessionId: string;
  items: ItemQuantity[];
  /** 注文を確定した日時（ISO 8601）。created_at にも同じ値を入れる */
  paidAt: string;
  /** 画面に出る日付（日本時間） */
  dateText: string;
};

/** 利用者の注文（新しい順に newer, older）。商品は買った順ではなく id の順に表示される */
export const BUYER_ORDERS = {
  newer: {
    orderNo: "ORD-E2EHISTNEW",
    sessionId: "cs_test_e2e_history_new",
    items: [
      { id: "5", quantity: 2 },
      { id: "1", quantity: 1 },
    ],
    paidAt: "2026-03-20T03:00:00.000Z",
    dateText: "2026年3月20日",
  },
  older: {
    orderNo: "ORD-E2EHISTOLD",
    sessionId: "cs_test_e2e_history_old",
    items: [{ id: "3", quantity: 1 }],
    paidAt: "2026-01-15T03:00:00.000Z",
    dateText: "2026年1月15日",
  },
} satisfies Record<string, SeededOrder>;

/** ログインせずに買った注文（持ち主なし）。どの利用者の履歴にも出ない。日付は二人の注文の間 */
export const GUEST_ORDER = {
  orderNo: "ORD-E2EHISTGST",
  sessionId: "cs_test_e2e_history_guest",
  items: [{ id: "2", quantity: 1 }],
  paidAt: "2026-02-10T03:00:00.000Z",
  dateText: "2026年2月10日",
} satisfies SeededOrder;
