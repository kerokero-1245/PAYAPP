/**
 * カタログから期待値を作る（金額・商品名をテストに直書きしない）
 * ---------------------------------------------------
 * 価格や商品名を変えても E2E が一緒に追従するよう、期待値はアプリと同じカタログ（lib/catalog.ts）から組む。
 * 金額の表示（¥496,000）だけは、アプリの整形関数を使わずここで独立に組む（表示の崩れを見逃さないため）。
 */
import { CATEGORIES, PRODUCTS, getProductById } from "../../lib/catalog.ts";
import { encodeOrderMetadata, orderFromSession } from "../../lib/checkout.ts";
import type { ConfirmedOrder, PaidOrder } from "../../lib/checkout.ts";
import type { Category, ItemQuantity, Product } from "../../lib/types.ts";

export { PRODUCTS };

/**
 * テストで使う標準のカート（時計 2 種。数量は取り違えを見分けられるよう別の値にしてある）。
 * カートの seed と、決済で送られる本文の期待値に同じものを使う。
 */
export const CART_ITEMS: ItemQuantity[] = [
  { id: "1", quantity: 2 },
  { id: "2", quantity: 3 },
];

/** id の商品（カタログに無ければ、テストの前提が崩れているので例外にする） */
export function product(id: string): Product {
  const found = getProductById(id);
  if (!found) throw new Error(`カタログに id=${id} の商品がありません`);
  return found;
}

/** カテゴリの商品（カタログの並び順） */
export function productsIn(slug: string): Product[] {
  return PRODUCTS.filter((p) => p.category === slug);
}

/** slug のカテゴリ */
export function categoryOf(slug: string): Category {
  const found = CATEGORIES.find((c) => c.slug === slug);
  if (!found) throw new Error(`カタログに slug=${slug} のカテゴリがありません`);
  return found;
}

/** 品目の合計金額（カタログの単価 × 数量） */
export function totalPrice(items: ItemQuantity[]): number {
  return items.reduce(
    (sum, { id, quantity }) => sum + product(id).price * quantity,
    0,
  );
}

/** 品目の合計点数 */
export function totalQuantity(items: ItemQuantity[]): number {
  return items.reduce((sum, { quantity }) => sum + quantity, 0);
}

/** 画面に出る金額の表記（例: 1500 → "¥1,500"） */
export function yen(amount: number): string {
  return `¥${amount.toLocaleString("ja-JP")}`;
}

/**
 * 支払い済みの session から確認ルートが返す注文。サーバが使うのと同じ orderFromSession に
 * 購入した id と数量（metadata）を渡して作るので、単価・商品名・画像・カテゴリ・合計は実サーバの応答と同じ形になる。
 */
export function paidOrder(sessionId: string, items: ItemQuantity[]): PaidOrder {
  const result = orderFromSession({
    id: sessionId,
    payment_status: "paid",
    metadata: encodeOrderMetadata(items),
  });
  if (!result.ok) throw new Error(result.error);
  return result.order;
}

/**
 * 確認ルートが返す、DB に確定した注文。paidOrder（品目・単価・数量・合計）に、サーバが付ける注文番号を足した形。
 * 本物の確認ルートは品目を商品 id の順に並べて返すが、画面は並びを使わないので、ここは買った順のまま
 */
export function confirmedOrder(
  sessionId: string,
  items: ItemQuantity[],
  orderNo: string,
): ConfirmedOrder {
  return { ...paidOrder(sessionId, items), orderNo };
}
