/**
 * 画面を開く・hydration を待つ・何度も使うロケータ
 * ---------------------------------------------------
 * ロケータは役割（role）とアクセシブルネームで取る。クラス名には頼らない。
 */
import type { Locator, Page } from "@playwright/test";
import { MD_MIN_WIDTH } from "../constants.ts";

/** Next の app router は hydration を終えると window.next.router を入れる */
type NextWindow = Window & { next?: { router?: unknown } };

/**
 * hydration が終わるまで待つ。終わる前にフォームを送ると、React の onSubmit ではなくブラウザの素の送信
 * （同じ URL への GET）になって画面が作り直されるため。
 */
export async function waitForHydration(page: Page): Promise<void> {
  await page.waitForFunction(() => Boolean((window as NextWindow).next?.router));
}

/** 画面を開き、hydration を待つ */
export async function open(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await waitForHydration(page);
}

/** 再読み込みし、hydration を待つ */
export async function reload(page: Page): Promise<void> {
  await page.reload();
  await waitForHydration(page);
}

/** md（768px）未満か。ヘッダーの検索欄がメニューの中に入り、サイドメニューが出ない幅 */
export function isNarrow(page: Page): boolean {
  return (page.viewportSize()?.width ?? 0) < MD_MIN_WIDTH;
}

/** ページ本体（ヘッダー・フッターを除く） */
export function mainRegion(page: Page): Locator {
  return page.getByRole("main");
}

/**
 * ヘッダーのカート点数バッジ。リンクの aria-label="カート" の子は名前に入らないので、
 * バッジ自身の読み上げ名（role="img" の aria-label）で取る。
 */
export function cartBadge(page: Page, count: number): Locator {
  return page.getByRole("banner").getByRole("img", { name: `カート内 ${count} 点`, exact: true });
}

/** ヘッダーのアカウントのリンク（aria-label="アカウント"。ログイン前は /login、ログイン後は /account） */
export function accountLink(page: Page): Locator {
  return page.getByRole("banner").getByRole("link", { name: "アカウント", exact: true });
}

/** カートの「購入手続きへ」 */
export function checkoutButton(page: Page): Locator {
  return mainRegion(page).getByRole("button", { name: "購入手続きへ", exact: true });
}

/** ヘッダーの検索欄に入力して送る（md 未満ではメニューの中にあるので先に開く） */
export async function searchProducts(page: Page, query: string): Promise<void> {
  if (isNarrow(page)) await page.getByRole("button", { name: "メニュー" }).click();
  const box = page.getByRole("textbox", { name: "商品を検索" });
  await box.fill(query);
  await box.press("Enter");
}
