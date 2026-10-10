/**
 * products 表への seed（カタログの商品を upsert する）
 * ---------------------------------------------------
 * 商品の正本は lib/catalog.ts。ここは外部キー（order_items.product_id）と在庫のために、同じ id の行を DB に置くだけ。
 * - 冪等: 何度打っても同じ状態になる。価格が変わった商品だけ更新し（updated_at もそのときだけ変わる）、変わらない行は触らない
 * - 在庫（stock）は DB が正本（段 7 から）なので、再実行しても上書きしない。新しい行は null（= 在庫を管理しない）で入る
 * - カタログから消えた商品は消さない（注文の明細が外部キーで参照している）
 */
import { sql } from "drizzle-orm";
import { PRODUCTS } from "../catalog.ts";
import type { Product } from "../types.ts";
import type { Db } from "./connect.ts";
import { products } from "./schema.ts";

/** 追加または更新した行の数を返す（変更が無ければ 0） */
export async function seedProducts(
  db: Db,
  catalog: readonly Pick<Product, "id" | "price">[] = PRODUCTS,
): Promise<number> {
  if (catalog.length === 0) return 0;
  const changed = await db
    .insert(products)
    .values(catalog.map(({ id, price }) => ({ id, price })))
    .onConflictDoUpdate({
      target: products.id,
      set: { price: sql`excluded.price`, updatedAt: sql`now()` },
      setWhere: sql`${products.price} is distinct from excluded.price`,
    })
    .returning({ id: products.id });
  return changed.length;
}
