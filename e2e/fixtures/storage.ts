/**
 * localStorage の形（カート）を知る唯一の場所
 * ---------------------------------------------------
 * zustand の persist は { state, version } の入れ物で書く（version は既定の 0）。形は store/ から拾った:
 *  - cart-storage = { state: { items: [{ id, quantity, … }] }, version: 0 }
 *      store/cartStore.ts。partialize で items だけを書き、戻すときに reconcileCart が価格・商品名・画像・カテゴリを
 *      カタログから id で引き直す。なので seed は id と数量だけでよい（読み戻すときはアプリが引き直した行が返る）
 * 注文はブラウザに持たない（サーバの DB。画面は /orders がサーバから読む）ので、seed しない。ログイン状態もサーバのセッションで
 * localStorage に持たない（cookie の HttpOnly の値で、画面の操作でだけ作る）。ブラウザに注文を記録していないことは、
 * readOrderKeys で、注文らしいキーが無いことを見て確かめる。
 * seed の入れ方と読み戻し方はここだけに置き、テストは入れ物の形を知らなくてよい。
 * Playwright に依存するのは型だけ（import type）なので、撮影スクリプトなど Node から直接 import してもよい。
 */
import type { BrowserContext, Page } from "@playwright/test";
import type { CartLine, ItemQuantity } from "../../lib/types.ts";

/** localStorage のキー（persist の name） */
export const STORAGE_KEYS = {
  cart: "cart-storage",
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
};

/** seed を localStorage に書く文字列にする（キー → JSON） */
export function seedEntries(seed: Seed): Record<string, string> {
  const entries: Record<string, string> = {};
  if (seed.cart)
    entries[STORAGE_KEYS.cart] = JSON.stringify(
      persisted({ items: seed.cart }),
    );
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

/**
 * localStorage のキーのうち、注文を記録していそうなもの（名前に order を含む）。注文はサーバの DB にあり、ブラウザには記録しないので、
 * 空であることを確かめるのに使う
 */
export async function readOrderKeys(page: Page): Promise<string[]> {
  const keys = await page.evaluate(() => Object.keys(window.localStorage));
  return keys.filter((key) => /order/i.test(key));
}

/** カートの行から id と数量だけを取り出す（価格などはカタログから引き直した値なので、比べるのは id と数量） */
export function quantitiesOf(lines: CartLine[]): ItemQuantity[] {
  return lines.map(({ id, quantity }) => ({ id, quantity }));
}
