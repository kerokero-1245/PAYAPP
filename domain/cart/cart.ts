import { Money } from "../shared/money";
import { Quantity } from "../shared/quantity";
import { CategorySlug, isCategorySlug } from "../catalog/category";
import { Product } from "../catalog/product";

/**
 * CartItem — カートの明細行（Cart アグリゲート内のエンティティ）
 *
 * カタログの全情報ではなく、カート表示・決済に必要な最小限だけを
 * 正規化して保持する。
 */
export class CartItem {
  constructor(
    readonly productId: string,
    readonly name: string,
    readonly price: Money,
    readonly quantity: Quantity,
    readonly image: string | null,
    readonly category: CategorySlug | null,
  ) {}

  /** 明細小計（単価 × 数量） */
  subtotal(): Money {
    return this.price.multiply(this.quantity.value);
  }

  withQuantity(quantity: Quantity): CartItem {
    return new CartItem(
      this.productId,
      this.name,
      this.price,
      quantity,
      this.image,
      this.category,
    );
  }
}

/** localStorage 永続化 / ストア連携で用いる直列化形 */
export interface CartItemDTO {
  id: string;
  name: string;
  price: number;
  image: string | null;
  category: string | null;
  quantity: number;
}

/**
 * Cart — カート（アグリゲートルート）
 *
 * カートに関する全ルール（追加時のマージ、数量の下限、合計の算出）の
 * 単一の真実。すべての操作は不変で、新しい Cart を返す。
 * Zustand ストアはこの Cart に委譲し、`toJSON()/fromJSON()` で永続化する。
 */
export class Cart {
  private constructor(private readonly _items: readonly CartItem[]) {}

  static empty(): Cart {
    return new Cart([]);
  }

  static fromItems(items: readonly CartItem[]): Cart {
    return new Cart([...items]);
  }

  /** ストア永続化データ（{items:[...]}）から復元 */
  static fromJSON(data: { items?: CartItemDTO[] } | null | undefined): Cart {
    const items = (data?.items ?? []).map(
      (i) =>
        new CartItem(
          String(i.id),
          i.name,
          Money.yen(i.price),
          Quantity.clamp(i.quantity),
          i.image ?? null,
          isCategorySlug(i.category) ? i.category : null,
        ),
    );
    return new Cart(items);
  }

  get items(): readonly CartItem[] {
    return this._items;
  }

  get isEmpty(): boolean {
    return this._items.length === 0;
  }

  /**
   * 商品を追加。既にカートにあれば数量を +1、無ければ数量 1 で新規行を追加。
   */
  addItem(product: Product): Cart {
    const existing = this._items.find((i) => i.productId === product.id);
    if (existing) {
      return new Cart(
        this._items.map((i) =>
          i.productId === product.id
            ? i.withQuantity(i.quantity.increment())
            : i,
        ),
      );
    }
    const line = new CartItem(
      product.id,
      product.name,
      product.price,
      Quantity.of(1),
      product.primaryImage,
      product.category,
    );
    return new Cart([...this._items, line]);
  }

  /** 明細を削除 */
  removeItem(productId: string): Cart {
    return new Cart(this._items.filter((i) => i.productId !== productId));
  }

  /** 数量を更新（1 未満・不正値は 1 に丸める）。該当が無ければ変化なし。 */
  updateQuantity(productId: string, quantity: unknown): Cart {
    return new Cart(
      this._items.map((i) =>
        i.productId === productId
          ? i.withQuantity(Quantity.clamp(quantity))
          : i,
      ),
    );
  }

  clear(): Cart {
    return Cart.empty();
  }

  /** 合計金額 */
  totalPrice(): Money {
    return this._items.reduce(
      (sum, item) => sum.add(item.subtotal()),
      Money.zero(),
    );
  }

  /** 合計点数 */
  totalItems(): number {
    return this._items.reduce((sum, item) => sum + item.quantity.value, 0);
  }

  /** ストア永続化用の直列化 */
  toJSON(): { items: CartItemDTO[] } {
    return {
      items: this._items.map((i) => ({
        id: i.productId,
        name: i.name,
        price: i.price.amount,
        image: i.image,
        category: i.category,
        quantity: i.quantity.value,
      })),
    };
  }
}
