/**
 * 実際の Stripe に通信して確かめる 1 本（@stripe）。
 * STRIPE_SECRET_KEY と E2E_STRIPE=1 の両方があるときだけ動く（キーを CI に置かない方針なので、CI では skip になる）。
 * サーバが sessions.create を受け付け、https://checkout.stripe.com/… の URL を返して遷移するところまで。
 * Stripe の画面（カード入力・3DS・支払い完了）には何もしない。実行: E2E_STRIPE=1 npx playwright test --grep @stripe
 */
import { test, expect } from "./fixtures/index.ts";
import { PATHS, STRIPE_ENABLED, STRIPE_TAG } from "./constants.ts";
import { seedStorage } from "./fixtures/storage.ts";
import { checkoutButton, open } from "./support/page.ts";

test.describe("決済ページへの遷移（実際の Stripe）", { tag: STRIPE_TAG }, () => {
  test.skip(!STRIPE_ENABLED, "STRIPE_SECRET_KEY と E2E_STRIPE=1 の両方があるときだけ動かす（実際の Stripe に通信する）");
  // Stripe のレート制限に当たらないよう、retry で叩き直さない
  test.describe.configure({ retries: 0 });

  test("購入手続きで Stripe の決済ページの URL が返り、そこへ遷移する", async ({ page, context }) => {
    await seedStorage(context, { cart: [{ id: "1", quantity: 1 }] });
    await open(page, PATHS.cart);
    await checkoutButton(page).click();
    await expect(page).toHaveURL(/^https:\/\/checkout\.stripe\.com\//, { timeout: 30_000 });
  });
});
