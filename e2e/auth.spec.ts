/**
 * モック認証: メールだけでログインし、ログアウトで戻る。実際の認証は無い（パスワードも検証しない）。
 * 表示名は、入力が無ければメールのローカル部になる（store/authStore.ts）。
 */
import { test, expect } from "./fixtures/index.ts";
import { PATHS } from "./constants.ts";
import { readAuth } from "./fixtures/storage.ts";
import { accountLink, mainRegion, open } from "./support/page.ts";

const EMAIL = "demo@example.com";
/** メールのローカル部 */
const DISPLAY_NAME = "demo";

test("auth: メールだけでログインし、ヘッダーの導線が変わり、ログアウトで戻る", async ({ page }) => {
  const main = mainRegion(page);
  await open(page, PATHS.login);
  await expect(accountLink(page)).toHaveAttribute("href", PATHS.login);

  await test.step("メールだけを入れてログインすると、アカウントに表示名（ローカル部）が出る", async () => {
    await main.getByRole("textbox", { name: "メールアドレス" }).fill(EMAIL);
    await main.getByRole("button", { name: "ログイン", exact: true }).click();
    await expect(page).toHaveURL(PATHS.account);
    await expect(main.getByText(DISPLAY_NAME, { exact: true })).toBeVisible();
    await expect(main.getByText(EMAIL, { exact: true })).toBeVisible();
    await expect(accountLink(page)).toHaveAttribute("href", PATHS.account);
    expect(await readAuth(page)).toEqual({ email: EMAIL, name: DISPLAY_NAME });
  });

  await test.step("ログイン済みで /login を開くと「ログイン中です」", async () => {
    await open(page, PATHS.login);
    await expect(main.getByRole("heading", { name: "ログイン中です" })).toBeVisible();
  });

  await test.step("ログアウトすると / に戻り、ヘッダーはログインへ向き、/account はログインを求める", async () => {
    await open(page, PATHS.account);
    await main.getByRole("button", { name: "ログアウト" }).click();
    await expect(page).toHaveURL(PATHS.home);
    await expect(accountLink(page)).toHaveAttribute("href", PATHS.login);
    expect(await readAuth(page)).toBeNull();

    await open(page, PATHS.account);
    await expect(main.getByRole("heading", { name: "ログインが必要です" })).toBeVisible();
  });
});
