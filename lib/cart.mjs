/**
 * カートの中身をカタログに合わせる純粋な関数
 * ---------------------------------------------------
 * - 価格・商品名・画像・カテゴリは保存した値ではなく、カタログから id で引き直す
 * - カタログに無い id の行は外す
 * - 数量は 1 行あたり 1〜MAX_QUANTITY。同じ id の行は数量を合算してから上限を当てる
 *
 * store/cartStore.js（localStorage から戻すとき・追加するとき）と、
 * 決済後に購入した分だけをカートから取り除く処理で使う。
 */
import { getProductById } from "./catalog.mjs";

/** 1 行あたりの数量の上限 */
export const MAX_QUANTITY = 99;

/** 数量を 1〜MAX_QUANTITY の整数に丸める（数でなければ 1） */
export function clampQuantity(quantity) {
  const n = Number(quantity);
  if (!Number.isFinite(n)) return 1;
  return Math.min(MAX_QUANTITY, Math.max(1, Math.floor(n)));
}

/** カタログの商品から、カートに保持する 1 行を作る */
function toCartLine(product, quantity) {
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
export function reconcileCart(items, lookup = getProductById) {
  if (!Array.isArray(items)) return [];
  const merged = new Map();
  for (const item of items) {
    const id = item?.id;
    if (typeof id !== "string" || !lookup(id)) continue;
    const sum = (merged.get(id) ?? 0) + clampQuantity(item.quantity);
    merged.set(id, Math.min(MAX_QUANTITY, sum));
  }
  return [...merged].map(([id, quantity]) => toCartLine(lookup(id), quantity));
}

/**
 * 決済が済んだ品目と数量だけをカートから取り除く。
 * 決済の後にカートへ足した品や、買った数より多く入っている分は残す。
 */
export function removePurchasedFromCart(cartItems, purchasedItems) {
  if (!Array.isArray(cartItems)) return [];
  const bought = new Map();
  for (const p of Array.isArray(purchasedItems) ? purchasedItems : []) {
    if (typeof p?.id !== "string" || !Number.isInteger(p?.quantity)) continue;
    bought.set(p.id, (bought.get(p.id) ?? 0) + p.quantity);
  }
  return cartItems
    .map((item) => ({ ...item, quantity: item.quantity - (bought.get(item.id) ?? 0) }))
    .filter((item) => item.quantity > 0);
}
