/**
 * localStorage の形（カート・注文履歴・ログイン状態）を知る唯一の場所
 * ---------------------------------------------------
 * zustand の persist は { state, version } の入れ物で書く（version は既定の 0）。形は store/ から拾った:
 *  - cart-storage  = { state: { items: [{ id, quantity, … }] }, version: 0 }
 *      store/cartStore.ts。partialize で items だけを書き、戻すときに reconcileCart が価格・商品名・画像・カテゴリを
 *      カタログから id で引き直す。なので seed は id と数量だけでよい（読み戻すときはアプリが引き直した行が返る）
 *  - order-storage = { state: { orders: [{ id, date, items, total, sessionId? }] }, version: 0 }   store/orderStore.ts
 *  - auth-storage  = { state: { user: { email, name } }, version: 0 }                              store/authStore.ts
 * seed の入れ方と読み戻し方はここだけに置き、テストは入れ物の形を知らなくてよい。
 * Playwright に依存するのは型だけ（import type）なので、撮影スクリプトなど Node から直接 import してもよい。
 */
import type { BrowserContext, Page } from "@playwright/test";
import { paidOrder } from "../support/catalog.ts";
import type { CartLine, ItemQuantity, Order, User } from "../../lib/types.ts";

/** localStorage のキー（persist の name） */
export const STORAGE_KEYS = {
  cart: "cart-storage",
  orders: "order-storage",
  auth: "auth-storage",
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];

/** persist の既定の version */
const PERSIST_VERSION = 0;

/** persist が書く入れ物 */
type Persisted<State> = { state: State; version: number };

function persisted<State>(state: State): Persisted<State> {
  return { state, version: PERSIST_VERSION };
}

/** あらかじめ入れておく状態（書いたものだけが入る） */
export type Seed = {
  cart?: ItemQuantity[];
  orders?: Order[];
  auth?: User;
};

/** seed を localStorage に書く文字列にする（キー → JSON） */
export function seedEntries(seed: Seed): Record<string, string> {
  const entries: Record<string, string> = {};
  if (seed.cart)
    entries[STORAGE_KEYS.cart] = JSON.stringify(
      persisted({ items: seed.cart }),
    );
  if (seed.orders)
    entries[STORAGE_KEYS.orders] = JSON.stringify(
      persisted({ orders: seed.orders }),
    );
  if (seed.auth)
    entries[STORAGE_KEYS.auth] = JSON.stringify(persisted({ user: seed.auth }));
  return entries;
}

/**
 * ページのスクリプトより先に、seed を localStorage へ入れる（context.addInitScript）。
 * ストアが localStorage から戻す前に入るので、hydration と食い違わない。
 * 読み込みのたびに走るため、キーが無いときだけ書く。書き直すと、画面で変えた状態（数量の変更・削除）が
 * 再読み込みで seed に戻ってしまい、永続化を確かめられなくなる。
 */
export async function seedStorage(
  context: BrowserContext,
  seed: Seed,
): Promise<void> {
  await context.addInitScript((entries: Record<string, string>) => {
    // 最初の about:blank など、localStorage に触れない文書では何もしない
    if (!location.origin.startsWith("http")) return;
    for (const [key, value] of Object.entries(entries)) {
      if (window.localStorage.getItem(key) === null)
        window.localStorage.setItem(key, value);
    }
  }, seedEntries(seed));
}

/** 固定の注文番号・日時（seed の注文を見分けるためだけの値） */
const SEED_ORDER_ID = "ORD-E2ESEED";
const SEED_ORDER_DATE = "2026-01-15T03:00:00.000Z";

/**
 * カタログから組んだ注文履歴の 1 件。確認ルートが返す注文（品目・単価・数量・合計）に、
 * 注文番号と日時を足した形。
 */
export function orderFor(
  items: ItemQuantity[],
  options: { sessionId: string; id?: string; date?: string },
): Order {
  const { items: lines, total } = paidOrder(options.sessionId, items);
  return {
    id: options.id ?? SEED_ORDER_ID,
    date: options.date ?? SEED_ORDER_DATE,
    items: lines,
    total,
    sessionId: options.sessionId,
  };
}

/** localStorage の値を JSON として読む（キーが無ければ null） */
export async function readStorage(
  page: Page,
  key: StorageKey,
): Promise<unknown> {
  const raw = await page.evaluate((k) => window.localStorage.getItem(k), key);
  return raw === null ? null : (JSON.parse(raw) as unknown);
}

/** persist の入れ物から state を取り出す（キーが無い・形が違うときは空のオブジェクト） */
function stateOf(stored: unknown): Record<string, unknown> {
  const state = (stored as { state?: unknown } | null)?.state;
  return typeof state === "object" && state !== null
    ? (state as Record<string, unknown>)
    : {};
}

/** カートの行（アプリが書いた形。キーが無ければ空） */
export async function readCart(page: Page): Promise<CartLine[]> {
  const { items } = stateOf(await readStorage(page, STORAGE_KEYS.cart));
  return Array.isArray(items) ? (items as CartLine[]) : [];
}

/** 注文履歴（新しい順。キーが無ければ空） */
export async function readOrders(page: Page): Promise<Order[]> {
  const { orders } = stateOf(await readStorage(page, STORAGE_KEYS.orders));
  return Array.isArray(orders) ? (orders as Order[]) : [];
}

/** ログイン中の利用者（未ログイン・キーが無ければ null） */
export async function readAuth(page: Page): Promise<User | null> {
  const { user } = stateOf(await readStorage(page, STORAGE_KEYS.auth));
  return user ? (user as User) : null;
}

/** カートの行から id と数量だけを取り出す（価格などはカタログから引き直した値なので、比べるのは id と数量） */
export function quantitiesOf(lines: CartLine[]): ItemQuantity[] {
  return lines.map(({ id, quantity }) => ({ id, quantity }));
}
