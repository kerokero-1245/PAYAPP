/**
 * カートの中身をカタログに合わせる純粋な関数
 * ---------------------------------------------------
 * - 価格・商品名・画像・カテゴリは保存した値ではなく、カタログから id で引き直す
 * - カタログに無い id の行は外す
 * - 数量は 1 行あたり MIN_QUANTITY〜MAX_QUANTITY。同じ id の行は数量を合算してから上限を当てる
 *
 * store/cartStore.js（localStorage から戻すとき・追加するとき）と、
 * 決済後に購入した分だけをカートから取り除く処理で使う。
 */
import { getProductById } from "./catalog.ts";
import type { CartLine, Product, ProductLookup, RawItem } from "./types.ts";

/** 1 行あたりの数量の下限と上限（数量の増減ボタン・商品詳細・カートで共有する） */
export const MIN_QUANTITY = 1;
export const MAX_QUANTITY = 99;

/** 数量を MIN_QUANTITY〜MAX_QUANTITY の整数に丸める（数でなければ MIN_QUANTITY） */
export function clampQuantity(quantity: unknown): number {
  const n = Number(quantity);
  if (!Number.isFinite(n)) return MIN_QUANTITY;
  return Math.min(MAX_QUANTITY, Math.max(MIN_QUANTITY, Math.floor(n)));
}

/** カタログの商品から、カートに保持する 1 行を作る */
function toCartLine(product: Product, quantity: number): CartLine {
  return {
    id: product.id,
    name: product.name,
    price: product.price,
    image: product.images?.[0] ?? null,
    category: product.category ?? null,
    quantity,
  };
}

/**
 * 保存されていた（または追加しようとしている）カートの行を、カタログに合わせて作り直す。
 * 行の順番は最初に現れた順を保つ。
 */
export function reconcileCart(items: unknown, lookup: ProductLookup = getProductById): CartLine[] {
  if (!Array.isArray(items)) return [];
  const merged = new Map<string, number>();
  for (const item of items as RawItem[]) {
    const id = item?.id;
    if (typeof id !== "string" || !lookup(id)) continue;
    const sum = (merged.get(id) ?? 0) + clampQuantity(item.quantity);
    merged.set(id, Math.min(MAX_QUANTITY, sum));
  }
  // 上の continue で lookup(id) が引けた id だけが merged に入っている
  return [...merged].map(([id, quantity]) => toCartLine(lookup(id)!, quantity));
}

/**
 * 決済が済んだ品目と数量だけをカートから取り除く。
 * 決済の後にカートへ足した品や、買った数より多く入っている分は残す。
 */
export function removePurchasedFromCart(cartItems: CartLine[], purchasedItems: unknown): CartLine[] {
  if (!Array.isArray(cartItems)) return [];
  const bought = new Map<string, number>();
  for (const p of (Array.isArray(purchasedItems) ? purchasedItems : []) as RawItem[]) {
    if (typeof p?.id !== "string" || typeof p.quantity !== "number" || !Number.isInteger(p.quantity)) continue;
    bought.set(p.id, (bought.get(p.id) ?? 0) + p.quantity);
  }
  return cartItems
    .map((item) => ({ ...item, quantity: item.quantity - (bought.get(item.id) ?? 0) }))
    .filter((item) => item.quantity > 0);
}
