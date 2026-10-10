/**
 * 購入手続きの失敗: 理由に応じた文言を role="alert" に出し、ボタンを「購入手続きへ」に戻す。
 *  - 利用者に見せてよい理由（GraphQL の UserError）はその文言
 *  - GraphQL の隠された例外・検証エラーは既定の文言（理由は見せない）
 *  - 通信そのものの失敗は「通信に失敗しました」
 */
import { test, expect } from "./fixtures/index.ts";
import { PATHS } from "./constants.ts";
import { seedStorage } from "./fixtures/storage.ts";
import { mockCheckout } from "./fixtures/stripe-mock.ts";
import type { CheckoutReply } from "./fixtures/stripe-mock.ts";
import { CART_ITEMS } from "./support/catalog.ts";
import { checkoutButton, mainRegion, open } from "./support/page.ts";
import { CHECKOUT_ERRORS } from "../lib/checkout.ts";

const FAILURES: { title: string; reply: CheckoutReply; message: string }[] = [
  {
    title: "利用者に見せてよい理由（UserError）はその文言",
    reply: {
      kind: "user-error",
      code: "UNKNOWN_ITEM",
      message: CHECKOUT_ERRORS.unknownItem,
    },
    message: CHECKOUT_ERRORS.unknownItem,
  },
  {
    title: "隠された例外は既定の文言",
    reply: { kind: "masked-error" },
    message: "決済処理に失敗しました。時間をおいてもう一度お試しください",
  },
  {
    title: "通信の失敗",
    reply: { kind: "network-error" },
    message: "通信に失敗しました。時間をおいてもう一度お試しください",
  },
];

test("checkout: 失敗は理由に応じた文言を出し、ボタンを元に戻す", async ({
  page,
  context,
}) => {
  await seedStorage(context, { cart: CART_ITEMS });
  const checkout = await mockCheckout(page, FAILURES[0].reply);
  await open(page, PATHS.cart);
  const alert = mainRegion(page).getByRole("alert");

  for (const { title, reply, message } of FAILURES) {
    await test.step(title, async () => {
      checkout.reply(reply);
      await checkoutButton(page).click();
      await expect(alert).toHaveText(message);
      // 失敗のあとは押し直せる（「Stripeへ移動中…」のまま固まらない）
      await expect(checkoutButton(page)).toBeEnabled();
    });
  }
  expect(checkout.requests).toHaveLength(FAILURES.length);
});
