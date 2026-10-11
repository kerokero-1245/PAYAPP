/**
 * 決済成功ページ（支払い済み）: 確認ルートが「支払い済み」と、サーバが DB に確定した注文（注文番号つき）を返したときだけ、
 * その注文番号を出し、買った分だけをカートから外す。再読み込みしても二重に外さない。
 * 注文の記録先はサーバの DB で、ブラウザの localStorage には何も記録しない（注文を記録するキーが無い）。
 * 注文履歴（/orders）に出ることは、orders.spec.ts が確かめる。
 * 確認ルートの応答はモックする（実際に支払った session の照会は実決済が要るため E2E では行わない）。
 * DB への確定そのもの（冪等・Webhook と成功ページの競合・未払いは作らない）は、単体テスト
 * （tests/fulfillment.test.ts・webhook.test.ts・checkout-verify.test.ts）が PGlite で確かめる。
 */
import { test, expect } from "./fixtures/index.ts";
import { ORDER_NO, PATHS, SESSION_IDS } from "./constants.ts";
import {
  quantitiesOf,
  readCart,
  readOrderKeys,
  seedStorage,
} from "./fixtures/storage.ts";
import { mockVerify } from "./fixtures/stripe-mock.ts";
import { CART_ITEMS } from "./support/catalog.ts";
import { mainRegion, open, reload } from "./support/page.ts";
import type { ItemQuantity } from "../lib/types.ts";

test("success: 支払い済みなら確認ルートが返した注文番号を出し、買った分だけカートから外す。再読み込みしても二重に外さず、ブラウザには注文を記録しない", async ({
  page,
  context,
}) => {
  // カートには 2 品。そのうち 1 つめを 1 点だけ買った（決済のあとにも残る分がある）
  const [first, second] = CART_ITEMS;
  const bought: ItemQuantity[] = [{ id: first.id, quantity: 1 }];
  const remaining: ItemQuantity[] = [
    { id: first.id, quantity: first.quantity - 1 },
    second,
  ];
  const main = mainRegion(page);
  const confirmed = main.getByRole("heading", {
    level: 1,
    name: "ご購入ありがとうございます",
  });
  const orderNo = main.getByText(/^ORD-[0-9A-Z]+$/);

  await seedStorage(context, { cart: CART_ITEMS });
  const verify = await mockVerify(page, {
    kind: "paid",
    items: bought,
    orderNo: ORDER_NO,
  });
  await open(page, `${PATHS.success}?session_id=${SESSION_IDS.paid}`);

  await test.step("確認ルートが返した注文番号が出る（ブラウザは番号を作らない）", async () => {
    await expect(confirmed).toBeVisible();
    await expect(orderNo).toHaveText(ORDER_NO);
    expect(verify.calls).toEqual([
      { sessionId: SESSION_IDS.paid, realStatus: null },
    ]);
  });

  await test.step("カートからは買った分だけが外れる", async () => {
    expect(quantitiesOf(await readCart(page))).toEqual(remaining);
  });

  await test.step("注文はブラウザに記録しない（localStorage に注文を記録するキーが無い）", async () => {
    expect(await readOrderKeys(page)).toEqual([]);
  });

  await test.step("再読み込みしても、同じ注文番号が出て、カートも変わらない（買った分を二重に外さない）", async () => {
    await reload(page);
    await expect(confirmed).toBeVisible();
    await expect(orderNo).toHaveText(ORDER_NO);
    expect(verify.calls).toHaveLength(2);
    expect(quantitiesOf(await readCart(page))).toEqual(remaining);
    expect(await readOrderKeys(page)).toEqual([]);
  });

  await test.step("「注文履歴を見る」は /orders へ進む。ログインしていない（この注文はゲストの買い物）ので、ログインして戻れる /login?next=%2Forders に着く", async () => {
    await main.getByRole("link", { name: "注文履歴を見る" }).click();
    await expect(page).toHaveURL(`${PATHS.login}?next=%2Forders`);
  });
});
