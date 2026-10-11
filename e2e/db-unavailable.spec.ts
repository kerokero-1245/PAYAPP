/**
 * DB が使えないとき（Neon の無料枠の超過・冷えた起動の失敗など）: DB に触れる画面は Next の既定のエラー画面ではなく、
 * 「ただいま表示できません」（app/error.tsx）になる。DB を使わない画面（ホーム・商品・カート）と、cookie を持たない人のログイン画面は、
 * ふだんどおり動く。
 * DB の使えないサーバは、同じビルドを別のポート（DB_DOWN_PORT）で立てる（playwright.config.ts。PGlite の保存先を作れないので、
 * DB に触れる要求は必ず失敗する）。セッションの cookie を持つ人（ログイン済みのつもり）の要求だけが DB を引くので、
 * ダミーの cookie を持たせて /orders・/account・/login を開く。
 */
import { SESSION_COOKIE_NAME } from "../lib/auth/constants.ts";
import { test, expect as baseExpect } from "./fixtures/index.ts";
import { DB_DOWN_BASE_URL, PATHS } from "./constants.ts";
import { mainRegion, open } from "./support/page.ts";

test.use({ baseURL: DB_DOWN_BASE_URL });

/**
 * auth.spec.ts と同じ理由（負荷の高い環境で、全 E2E を 2 本の worker で回すと 1 本が 30 秒を超えることがある）で、
 * assertion の待ち時間と、テストの制限時間を長くする（期待は変えない）。DB の使えないサーバは、画面を開くたびに DB を開こうとして失敗し、
 * 1 本目は 4 つの画面・読み直し・ホームへの移動を続けるので、特に長い
 */
const expect = baseExpect.configure({ timeout: 30_000 });
const TEST_TIMEOUT_MS = 120_000;

const UNAVAILABLE = "ただいま表示できません";

test("DB が使えない: セッションの cookie を持つ人の /orders・/account・/login は「ただいま表示できません」になり、ヘッダーとフッターは出たまま。「もう一度読み込む」で読み直しても同じ画面で、「トップへ戻る」でホームへ戻れる", async ({
  page,
  context,
}) => {
  test.setTimeout(TEST_TIMEOUT_MS);
  await context.addCookies([
    { name: SESSION_COOKIE_NAME, value: "dummy.dummy", url: DB_DOWN_BASE_URL },
  ]);
  const main = mainRegion(page);
  const heading = main.getByRole("heading", { level: 1, name: UNAVAILABLE });

  await test.step("注文履歴を開くと、既定のエラー画面ではなく「ただいま表示できません」が出る。ヘッダーとフッターはそのまま", async () => {
    await page.goto(PATHS.orders);
    await expect(heading).toBeVisible();
    await expect(page.getByRole("banner")).toBeVisible();
    await expect(page.getByRole("contentinfo")).toBeVisible();
    await expect(
      main.getByRole("button", { name: "もう一度読み込む" }),
    ).toBeVisible();
    // 注文履歴の見出しや、Next の既定のエラー画面の文言は出ていない
    await expect(
      main.getByRole("heading", { level: 1, name: "注文履歴" }),
    ).toHaveCount(0);
    await expect(page.getByText(/Application error/i)).toHaveCount(0);
  });

  await test.step("アカウント・ログイン・新規登録も同じ（cookie を持つ人は、これらもセッションを DB で引く）", async () => {
    for (const path of [PATHS.account, PATHS.login, PATHS.signup]) {
      await page.goto(path);
      await expect(heading, path).toBeVisible();
    }
  });

  await test.step("「もう一度読み込む」を押すと読み直す（DB はまだ使えないので、同じ画面）", async () => {
    // hydration が終わる前に押すと、onClick がまだ付いておらず何も起きない
    await open(page, PATHS.orders);
    await expect(heading).toBeVisible();
    const reloaded = page.waitForEvent("load");
    await main.getByRole("button", { name: "もう一度読み込む" }).click();
    await reloaded;
    await expect(heading).toBeVisible();
  });

  await test.step("「トップへ戻る」でホームへ戻れる（ホームは DB を使わない）", async () => {
    await main.getByRole("link", { name: "トップへ戻る" }).click();
    await expect(page).toHaveURL(PATHS.home);
    await expect(heading).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "すべての商品" }).first(),
    ).toBeVisible();
  });
});

test("DB が使えない: cookie を持たない人は、DB を使わない画面（ホーム・商品・カート・ログイン）がふだんどおり動き、/orders は何も壊さずログインへ転送される", async ({
  page,
}) => {
  test.setTimeout(TEST_TIMEOUT_MS);
  const main = mainRegion(page);
  const unavailable = main.getByRole("heading", { name: UNAVAILABLE });

  await test.step("ホーム・商品一覧・カートは開ける", async () => {
    for (const path of [PATHS.home, PATHS.products, PATHS.cart]) {
      await page.goto(path);
      await expect(page.getByRole("banner"), path).toBeVisible();
      await expect(unavailable, path).toHaveCount(0);
    }
    await expect(
      main.getByRole("heading", { name: "カートは空です" }),
    ).toBeVisible();
  });

  await test.step("ログイン画面はフォームが出て（cookie が無ければセッションを引かない）、/orders はログインへ転送される", async () => {
    await page.goto(PATHS.login);
    await expect(
      main.getByRole("heading", { level: 1, name: "サインイン" }),
    ).toBeVisible();
    await expect(unavailable).toHaveCount(0);

    await page.goto(PATHS.orders);
    await expect(page).toHaveURL(`${PATHS.login}?next=%2Forders`);
    await expect(unavailable).toHaveCount(0);
  });
});
