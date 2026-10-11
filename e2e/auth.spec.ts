/**
 * 認証（本物の Better Auth）: 新規登録でログイン状態になり、ログアウトで戻り、同じパスワードで再ログインできる。
 * ログインが要るページ（/account）は未ログインだと /login?next=… へ転送され、ログイン後に元のページへ戻る。
 * 誤ったパスワードと、別のサイトを指す next は通らない。サーバの DB は E2E 専用の PGlite（.pglite-e2e。実行をまたいで残る）。
 * 利用者の名前・メール・パスワードの検証、cookie の属性、試行回数の制限、next の検査の網羅は単体テスト
 * （tests/auth.test.ts・tests/next-path.test.ts）が確かめる。ここでは実ブラウザで、画面の操作とサーバが噛み合うことを見る。
 */
import { SESSION_COOKIE_NAME } from "../lib/auth/constants.ts";
import { test, expect } from "./fixtures/index.ts";
import { BASE_URL, PATHS } from "./constants.ts";
import { accountLink, mainRegion, open } from "./support/page.ts";

/** E2E 専用の DB のダミーのパスワード（本物の秘密ではない） */
const PASSWORD = "e2e-correct-horse-battery-staple";
const DISPLAY_NAME = "E2E 花子";

test("auth: 新規登録でログイン状態になり、ログアウトで戻り、同じパスワードで再ログインできる。未ログインでは /account が転送され、誤ったパスワードと外部の next は通らない", async ({
  page,
  context,
}, testInfo) => {
  const main = mainRegion(page);
  // 実行・幅ごとに違うメール（E2E の DB は実行をまたいで残り、2 つの幅のテストが同時に動くので、重ならないようにする）
  const email = `e2e-${testInfo.project.name}-${crypto.randomUUID()}@example.com`;
  const login = main.getByRole("button", { name: "ログイン", exact: true });
  const fillCredentials = async (password: string) => {
    await main.getByRole("textbox", { name: "メールアドレス" }).fill(email);
    await main.getByLabel("パスワード", { exact: true }).fill(password);
  };

  await test.step("未ログインでは、ヘッダーはログインへ向き、/account は /login?next=%2Faccount へ転送される", async () => {
    await open(page, PATHS.home);
    await expect(accountLink(page)).toHaveAttribute("href", PATHS.login);

    await open(page, PATHS.account);
    await expect(page).toHaveURL(`${PATHS.login}?next=%2Faccount`);
    await expect(
      main.getByRole("heading", { level: 1, name: "サインイン" }),
    ).toBeVisible();
  });

  await test.step("ログイン画面の「新規登録」から、表示名・メール・パスワードで登録すると、行き先（/account）に着き、表示名とメールが出る", async () => {
    await main.getByRole("link", { name: "新規登録" }).click();
    await expect(page).toHaveURL(`${PATHS.signup}?next=%2Faccount`);
    await expect(
      main.getByRole("heading", { level: 1, name: "新規登録" }),
    ).toBeVisible();
    // 新しい画面でも、再設定が無いことが読める
    await expect(
      main.getByText(/パスワードの再設定には対応していません/),
    ).toBeVisible();

    await main
      .getByRole("textbox", { name: "表示名（任意）" })
      .fill(DISPLAY_NAME);
    await fillCredentials(PASSWORD);
    await main.getByRole("button", { name: "登録する", exact: true }).click();

    await expect(page).toHaveURL(PATHS.account);
    await expect(main.getByText(DISPLAY_NAME, { exact: true })).toBeVisible();
    await expect(main.getByText(email, { exact: true })).toBeVisible();
    await expect(accountLink(page)).toHaveAttribute("href", PATHS.account);
  });

  await test.step("ログイン状態はサーバのセッション: cookie は HttpOnly（スクリプトから読めない）・SameSite=Lax・Path=/・約 7 日で、localStorage には何も持たない", async () => {
    const cookies = await context.cookies(BASE_URL);
    const session = cookies.find((c) => c.name.endsWith(SESSION_COOKIE_NAME));
    expect(session, "セッションの cookie").toBeDefined();
    expect(session).toMatchObject({
      httpOnly: true,
      sameSite: "Lax",
      path: "/",
    });
    const days = (session!.expires - Date.now() / 1000) / 86_400;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThanOrEqual(7);

    expect(await page.evaluate(() => document.cookie)).not.toContain(
      SESSION_COOKIE_NAME,
    );
    expect(
      await page.evaluate(() => Object.keys(window.localStorage)),
    ).not.toContainEqual(expect.stringMatching(/auth/i));
  });

  await test.step("ログイン済みで /login を開くと「ログイン中です」、/signup を開くと /account へ送られる", async () => {
    await open(page, PATHS.login);
    await expect(
      main.getByRole("heading", { name: "ログイン中です" }),
    ).toBeVisible();
    await expect(main.getByText(DISPLAY_NAME, { exact: true })).toBeVisible();

    await open(page, PATHS.signup);
    await expect(page).toHaveURL(PATHS.account);
  });

  await test.step("ログアウトすると / に戻り、ヘッダーはログインへ向き、/account はまた /login へ転送される", async () => {
    await main.getByRole("button", { name: "ログアウト" }).click();
    await expect(page).toHaveURL(PATHS.home);
    await expect(accountLink(page)).toHaveAttribute("href", PATHS.login);

    await open(page, PATHS.account);
    await expect(page).toHaveURL(`${PATHS.login}?next=%2Faccount`);
  });

  await test.step("誤ったパスワードは「メールアドレスかパスワードが違います」の 1 文で断られ、ログイン画面に残る", async () => {
    await fillCredentials(`${PASSWORD}-wrong`);
    await login.click();
    await expect(main.getByRole("alert")).toHaveText(
      "メールアドレスかパスワードが違います",
    );
    await expect(page).toHaveURL(`${PATHS.login}?next=%2Faccount`);
    await expect(accountLink(page)).toHaveAttribute("href", PATHS.login);
  });

  await test.step("正しいパスワードでログインすると、行き先（/account）に着き、表示名が出る", async () => {
    await fillCredentials(PASSWORD);
    await login.click();
    await expect(page).toHaveURL(PATHS.account);
    await expect(main.getByText(DISPLAY_NAME, { exact: true })).toBeVisible();
    await expect(accountLink(page)).toHaveAttribute("href", PATHS.account);
  });

  await test.step("next に別のサイトの URL を入れても、ログイン後は自サイトのアカウントに着く", async () => {
    await main.getByRole("button", { name: "ログアウト" }).click();
    await expect(page).toHaveURL(PATHS.home);

    await open(
      page,
      `${PATHS.login}?next=${encodeURIComponent("//evil.example/phish")}`,
    );
    await fillCredentials(PASSWORD);
    await login.click();
    await expect(page).toHaveURL(PATHS.account);
    expect(new URL(page.url()).origin).toBe(BASE_URL);
  });
});
