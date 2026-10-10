/**
 * 商品詳細: 数量を決めてカートに入れ、ヘッダーのバッジとカートの合計に反映される。
 */
import { test, expect } from "./fixtures/index.ts";
import { PATHS } from "./constants.ts";
import { product, totalPrice, yen } from "./support/catalog.ts";
import { cartBadge, mainRegion, open } from "./support/page.ts";

test("detail: 数量を増やしてカートに追加すると、バッジと合計に反映される", async ({
  page,
}) => {
  const watch = product("1");
  const quantity = 2;
  const main = mainRegion(page);

  await open(page, `${PATHS.products}/${watch.id}`);
  await expect(main.getByRole("heading", { level: 1 })).toHaveText(watch.name);

  await test.step("数量は 1 から始まり、増やすと 2。1 のときは「減らす」が押せない", async () => {
    const decrement = main.getByRole("button", { name: "数量を減らす" });
    await expect(decrement).toBeDisabled();
    await main.getByRole("button", { name: "数量を増やす" }).click();
    await expect(decrement).toBeEnabled();
  });

  await test.step("カートに追加すると、確認の表示とヘッダーのバッジ（点数）が出る", async () => {
    await expect(cartBadge(page, quantity)).toHaveCount(0);
    await main
      .getByRole("button", { name: "カートに追加", exact: true })
      .click();
    await expect(main.getByText("カートに追加しました")).toBeVisible();
    await expect(cartBadge(page, quantity)).toHaveText(String(quantity));
  });

  await test.step("カートでは点数と合計が、カタログの単価 × 数量になっている", async () => {
    await main.getByRole("link", { name: "カートを見る" }).click();
    await expect(page).toHaveURL(PATHS.cart);
    await expect(main.getByRole("heading", { level: 1 })).toContainText(
      `（${quantity}点）`,
    );
    const summary = main.getByRole("complementary");
    const total = yen(totalPrice([{ id: watch.id, quantity }]));
    await expect(summary.getByRole("term").first()).toHaveText(
      `小計（${quantity}点）`,
    );
    await expect(summary.getByRole("definition").first()).toHaveText(total);
    await expect(summary).toContainText(new RegExp(`合計\\s*${total}`));
  });
});
