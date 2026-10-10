/**
 * 決済成功ページ（支払い済み）: 確認ルートが支払い済みと返したときだけ、その内容で注文を 1 件記録し、
 * 買った分だけをカートから外す。再読み込みしても二重に記録しない。
 * 確認ルートの応答はモックする（実際に支払った session の照会は実決済が要るため E2E では行わない）。
 */
import { test, expect } from "./fixtures/index.ts";
import { PATHS, SESSION_IDS } from "./constants.ts";
import { quantitiesOf, readCart, readOrders, seedStorage } from "./fixtures/storage.ts";
import { mockVerify } from "./fixtures/stripe-mock.ts";
import { CART_ITEMS, product, totalPrice, yen } from "./support/catalog.ts";
import { mainRegion, open, reload } from "./support/page.ts";
import type { ItemQuantity } from "../lib/types.ts";

test("success: 支払い済みなら注文を 1 件だけ記録し、買った分だけカートから外す", async ({ page, context }) => {
  // カートには 2 品。そのうち 1 つめを 1 点だけ買った（決済のあとにも残る分がある）
  const [first, second] = CART_ITEMS;
  const bought: ItemQuantity[] = [{ id: first.id, quantity: 1 }];
  const remaining: ItemQuantity[] = [{ id: first.id, quantity: first.quantity - 1 }, second];
  const main = mainRegion(page);
  const confirmed = main.getByRole("heading", { level: 1, name: "ご購入ありがとうございます" });

  await seedStorage(context, { cart: CART_ITEMS });
  const verify = await mockVerify(page, { kind: "paid", items: bought });
  await open(page, `${PATHS.success}?session_id=${SESSION_IDS.paid}`);

  await test.step("注文番号が出て、注文は 1 件だけ記録される（支払った内容・カタログの価格）", async () => {
    await expect(confirmed).toBeVisible();
    await expect.poll(async () => (await readOrders(page)).length).toBe(1);
    const [order] = await readOrders(page);
    expect(order).toMatchObject({ sessionId: SESSION_IDS.paid, total: totalPrice(bought) });
    expect(quantitiesOf(order.items)).toEqual(bought);
    await expect(main.getByText(/^ORD-[0-9A-Z]+$/)).toHaveText(order.id);
  });

  await test.step("カートからは買った分だけが外れる", async () => {
    expect(quantitiesOf(await readCart(page))).toEqual(remaining);
  });

  await test.step("再読み込みしても、注文は 1 件のまま・カートも変わらない（二重に記録しない）", async () => {
    await reload(page);
    await expect(confirmed).toBeVisible();
    expect(verify.calls).toHaveLength(2);
    expect(await readOrders(page)).toHaveLength(1);
    expect(quantitiesOf(await readCart(page))).toEqual(remaining);
  });

  await test.step("注文履歴に、その注文が 1 件ある", async () => {
    const [order] = await readOrders(page);
    await main.getByRole("link", { name: "注文履歴を見る" }).click();
    await expect(page).toHaveURL(PATHS.orders);
    const articles = main.getByRole("article");
    await expect(articles).toHaveCount(1);
    await expect(articles).toContainText(order.id);
    await expect(articles).toContainText(`${product(first.id).name} × ${bought[0].quantity}`);
    await expect(articles).toContainText(yen(order.total));
  });
});
