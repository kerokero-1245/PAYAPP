/**
 * 決済成功ページ（支払いを確認できない場合）: 注文の確定も、カートの更新も、履歴への書き込みもしない。
 *  - session_id が無い・形が不正（実サーバの 400）・未払い {paid:false} → 「決済を確認できませんでした」（買い直してよい）
 *  - 確認できなかった（502 など）→ 「決済の確認が取れていません」と「もう一度確認する」（二重購入を避けるため買い直しは促さない）
 * サーバが DB に注文を作らないこと（未払い・存在しない session）は単体テスト（tests/fulfillment.test.ts ほか）が確かめる。
 * ここで確かめるのは画面の側: ブラウザに注文を記録するキーを作らず、カートも変えない。
 */
import { test, expect } from "./fixtures/index.ts";
import { PATHS, SESSION_IDS } from "./constants.ts";
import {
  quantitiesOf,
  readCart,
  readOrderKeys,
  seedStorage,
} from "./fixtures/storage.ts";
import { mockVerify } from "./fixtures/stripe-mock.ts";
import { CART_ITEMS } from "./support/catalog.ts";
import { mainRegion, open } from "./support/page.ts";

test("success: 支払いを確認できないときは何も記録せず、通信の失敗なら再確認できる", async ({
  page,
  context,
}) => {
  await seedStorage(context, { cart: CART_ITEMS });
  const verify = await mockVerify(page, { kind: "unpaid" });
  const main = mainRegion(page);
  const unpaid = main.getByRole("heading", {
    level: 1,
    name: "決済を確認できませんでした",
  });
  const unverified = main.getByRole("heading", {
    level: 1,
    name: "決済の確認が取れていません",
  });

  await test.step("session_id が無い: 確認ルートに問い合わせず、未払いとして扱う", async () => {
    await open(page, PATHS.success);
    await expect(unpaid).toBeVisible();
    expect(verify.calls).toEqual([]);
  });

  await test.step("session_id の形が不正: 実サーバが Stripe を呼ばずに 400 を返し、未払いとして扱う", async () => {
    verify.reply({ kind: "real-server" });
    await open(page, `${PATHS.success}?session_id=${SESSION_IDS.malformed}`);
    await expect(unpaid).toBeVisible();
    expect(verify.calls).toEqual([
      { sessionId: SESSION_IDS.malformed, realStatus: 400 },
    ]);
  });

  await test.step("未払い { paid: false }", async () => {
    verify.reply({ kind: "unpaid" });
    await open(page, `${PATHS.success}?session_id=${SESSION_IDS.unpaid}`);
    await expect(unpaid).toBeVisible();
  });

  await test.step("確認できなかった（502）: 「もう一度確認する」で確認ルートにもう一度問い合わせる", async () => {
    verify.reply({ kind: "error", status: 502 });
    await open(page, `${PATHS.success}?session_id=${SESSION_IDS.unverified}`);
    await expect(unverified).toBeVisible();
    const askedBefore = verify.calls.length;

    // 再確認では未払いと確認できた、という応答にして、結果の画面に切り替わることも見る
    verify.reply({ kind: "unpaid" });
    await main.getByRole("button", { name: "もう一度確認する" }).click();
    await expect(unpaid).toBeVisible();
    expect(verify.calls).toHaveLength(askedBefore + 1);
    expect(verify.calls.at(-1)?.sessionId).toBe(SESSION_IDS.unverified);
  });

  await test.step("どの場合も、注文を記録するキーは作られず、カートも変わらない", async () => {
    expect(await readOrderKeys(page)).toEqual([]);
    expect(quantitiesOf(await readCart(page))).toEqual(CART_ITEMS);
  });
});
