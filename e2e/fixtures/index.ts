/**
 * E2E の test と expect
 * ---------------------------------------------------
 * 素の @playwright/test の test に、全テストで自動で効く 2 つの fixture を足したもの。
 * 各 spec はここから import する。
 *  - externalImages: 外部画像を 1×1 の PNG で返す（fixtures/images.ts）
 *  - closedStripe: Stripe 行きの通信を既定で閉じる（fixtures/stripe-mock.ts）。テストの最後に、
 *    モックされずに届いた通信が無いことを確かめる
 */
import { test as base, expect } from "@playwright/test";
import { STRIPE_TAG } from "../constants.ts";
import { stubExternalImages } from "./images.ts";
import { closeStripeRoutes } from "./stripe-mock.ts";

type AutoFixtures = {
  externalImages: void;
  closedStripe: void;
};

export const test = base.extend<AutoFixtures>({
  externalImages: [
    async ({ context }, provide) => {
      await stubExternalImages(context);
      await provide();
    },
    { auto: true },
  ],
  closedStripe: [
    async ({ context }, provide, testInfo) => {
      // @stripe は実際の Stripe に通信して確かめるテストなので閉じない
      if (testInfo.tags.includes(STRIPE_TAG)) {
        await provide();
        return;
      }
      const leaks = await closeStripeRoutes(context);
      await provide();
      expect(leaks, "モックされていない Stripe 行きの通信が出た").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
