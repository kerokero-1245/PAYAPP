/**
 * カート: 数量の増減と削除が点数・合計に反映され、再読み込みしても残る（localStorage に永続化される）。
 * 価格の改ざん対策は単体（reconcileCart・buildLineItems）に任せる。
 */
import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures/index.ts";
import { PATHS } from "./constants.ts";
import { quantitiesOf, readCart, seedStorage } from "./fixtures/storage.ts";
import { CART_ITEMS, product, totalPrice, totalQuantity, yen } from "./support/catalog.ts";
import { cartBadge, mainRegion, open, reload } from "./support/page.ts";
import type { ItemQuantity } from "../lib/types.ts";

/** カートの表示（見出し・注文サマリー・ヘッダーのバッジ・行の数）が lines と一致する */
async function expectCart(page: Page, lines: ItemQuantity[]): Promise<void> {
  const main = mainRegion(page);
  const points = totalQuantity(lines);
  const total = yen(totalPrice(lines));
  await expect(main.getByRole("heading", { level: 1 })).toContainText(`（${points}点）`);
  const summary = main.getByRole("complementary");
  await expect(summary.getByRole("term").first()).toHaveText(`小計（${points}点）`);
  await expect(summary.getByRole("definition").first()).toHaveText(total);
  await expect(summary).toContainText(new RegExp(`合計\\s*${total}`));
  await expect(cartBadge(page, points)).toHaveText(String(points));
  await expect(main.getByRole("button", { name: /を削除$/ })).toHaveCount(lines.length);
}

test("cart: 増減・削除が合計に反映され、再読み込みしても残る", async ({ page, context }) => {
  const [first, second] = CART_ITEMS;
  const main = mainRegion(page);

  await seedStorage(context, { cart: CART_ITEMS });
  await open(page, PATHS.cart);
  await expectCart(page, CART_ITEMS);

  await test.step("1 つめの数量を増やす", async () => {
    await main.getByRole("button", { name: `${product(first.id).name} の数量を増やす` }).click();
    await expectCart(page, [{ id: first.id, quantity: first.quantity + 1 }, second]);
  });

  await test.step("2 つめを削除する", async () => {
    await main.getByRole("button", { name: `${product(second.id).name} を削除` }).click();
    await expectCart(page, [{ id: first.id, quantity: first.quantity + 1 }]);
  });

  await test.step("再読み込みしても、変えたあとの状態が残る", async () => {
    await reload(page);
    const remaining = [{ id: first.id, quantity: first.quantity + 1 }];
    await expectCart(page, remaining);
    expect(quantitiesOf(await readCart(page))).toEqual(remaining);
  });

  await test.step("最後の 1 つを削除すると、カートは空になる", async () => {
    await main.getByRole("button", { name: `${product(first.id).name} を削除` }).click();
    await expect(main.getByRole("heading", { level: 1, name: "カートは空です" })).toBeVisible();
    await expect(page.getByRole("banner").getByRole("img", { name: /^カート内/ })).toHaveCount(0);
    await expect.poll(() => readCart(page)).toEqual([]);
  });
});
