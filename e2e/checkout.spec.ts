/**
 * 購入手続き（カート → createCheckoutSession）: 送るのは id と数量だけで、返った決済ページの URL へ遷移する。
 * Stripe の決済ページ（カード入力・3DS・支払い完了）は E2E では触らない。createCheckoutSession と遷移先をモックする。
 */
import { test, expect } from "./fixtures/index.ts";
import { CART_ITEMS } from "./support/catalog.ts";
import { PATHS } from "./constants.ts";
import { seedStorage } from "./fixtures/storage.ts";
import { STRIPE_MOCK_HEADING, mockCheckout, mockStripeHost } from "./fixtures/stripe-mock.ts";
import { checkoutButton, mainRegion, open } from "./support/page.ts";

test("checkout: id と数量だけを送り、返った Stripe の決済ページへ遷移する", async ({ page, context }) => {
  await seedStorage(context, { cart: CART_ITEMS });
  const checkout = await mockCheckout(page, { kind: "url" });
  await mockStripeHost(page);
  const release = checkout.hold();
  await open(page, PATHS.cart);

  await test.step("応答を待っている間は、ボタンが「Stripeへ移動中…」で押せない", async () => {
    await checkoutButton(page).click();
    await expect(mainRegion(page).getByRole("button", { name: "Stripeへ移動中…" })).toBeDisabled();
  });

  await test.step("応答が返ると、決済ページ（モック）へ遷移する", async () => {
    release();
    await expect(page).toHaveURL(/^https:\/\/checkout\.stripe\.com\//);
    await expect(page.getByRole("heading", { level: 1, name: STRIPE_MOCK_HEADING })).toBeVisible();
  });

  await test.step("送った本文は createCheckoutSession で、items は id と数量だけ（price・name を含まない）", async () => {
    expect(checkout.requests).toHaveLength(1);
    const [request] = checkout.requests;
    expect(request.query).toContain("createCheckoutSession");
    expect(request.variables).toEqual({ items: CART_ITEMS });
  });
});
