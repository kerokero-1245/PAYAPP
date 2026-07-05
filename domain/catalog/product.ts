import { Money } from "../shared/money";
import { CategorySlug, isCategorySlug } from "./category";

/**
 * Product — 商品（Catalog コンテキストのエンティティ）
 *
 * 商品はカタログの中核。価格は Money 値オブジェクトで保持し、
 * 生成時に不変条件（id/name 非空・価格の妥当性・カテゴリ所属）を検証する。
 */
export interface ProductProps {
  id: string;
  name: string;
  price: number | Money;
  category: string;
  tagline?: string;
  description?: string;
  badge?: string;
  images?: string[];
}

export class Product {
  private constructor(
    readonly id: string,
    readonly name: string,
    readonly price: Money,
    readonly category: CategorySlug,
    readonly tagline: string | null,
    readonly description: string | null,
    readonly badge: string | null,
    readonly images: readonly string[],
  ) {}

  static create(props: ProductProps): Product {
    const id = String(props.id ?? "").trim();
    if (!id) {
      throw new Error("Product.create: id は必須です");
    }
    const name = String(props.name ?? "").trim();
    if (!name) {
      throw new Error("Product.create: name は必須です");
    }
    if (!isCategorySlug(props.category)) {
      throw new Error(`Product.create: 未知のカテゴリです: ${props.category}`);
    }
    const price =
      props.price instanceof Money ? props.price : Money.yen(props.price);

    return new Product(
      id,
      name,
      price,
      props.category,
      props.tagline?.trim() || null,
      props.description?.trim() || null,
      props.badge?.trim() || null,
      Object.freeze([...(props.images ?? [])]),
    );
  }

  /** カード・カート行で使う代表画像（先頭画像、無ければ null） */
  get primaryImage(): string | null {
    return this.images[0] ?? null;
  }
}
