import { Money } from "../shared/money";
import { Cart, CartItem, CartItemDTO } from "../cart/cart";

/**
 * 副作用（現在時刻・ID 採番）を外部から注入するためのポート。
 * ドメインを純粋に保ち、テストで決定的に検証できるようにする。
 */
export interface OrderClock {
  /** 現在時刻 */
  now(): Date;
  /** 一意な注文 ID を採番 */
  nextId(): string;
}

/** 永続化 / 履歴表示で用いる直列化形（orderStore の形と一致） */
export interface OrderDTO {
  id: string;
  date: string;
  items: CartItemDTO[];
  total: number;
}

/**
 * Order — 注文（Ordering コンテキストのアグリゲートルート）
 *
 * カートを確定した時点のスナップショット。明細と合計は生成時に固定され、
 * 以後カートが変わっても注文は不変。空カートからは注文できない、という
 * 不変条件を保証する。
 */
export class Order {
  private constructor(
    readonly id: string,
    readonly date: string,
    readonly items: readonly CartItem[],
    readonly total: Money,
  ) {}

  /**
   * カートを確定して注文を生成する。
   * 時刻・ID は {@link OrderClock} 経由で注入するため純粋・決定的。
   */
  static place(cart: Cart, clock: OrderClock): Order {
    if (cart.isEmpty) {
      throw new Error("Order.place: 空のカートからは注文できません");
    }
    return new Order(
      clock.nextId(),
      clock.now().toISOString(),
      [...cart.items],
      cart.totalPrice(),
    );
  }

  toJSON(): OrderDTO {
    return {
      id: this.id,
      date: this.date,
      total: this.total.amount,
      items: this.items.map((i) => ({
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
