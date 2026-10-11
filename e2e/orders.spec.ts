/**
 * 注文履歴（/orders）: ログイン中の自分の注文だけが、サーバの DB から新しい順に出る。
 *  - 未ログインは /login?next=%2Forders へ転送される。新規登録すると /orders に戻り、まだ注文が無いので空の表示が出る
 *    （DB には別の利用者の注文とゲストの注文があるが、どれも出ない）
 *  - 注文を持つ利用者でログインすると、その人の注文が新しい順に出る（ゲストの注文は出ない）。成功ページ（実サーバの確認）が返す注文番号は
 *    履歴の番号と同じで、別の端末（別の context。localStorage が空）でログインしても同じ履歴が出る
 * 買う操作（Stripe の決済）は E2E では行えない（Stripe に通信しない）ので、注文は seed（e2e/seed.ts。サーバを立てる前に打つ）が
 * E2E 専用の DB に入れておく。注文の確定そのもの・持ち主ごとの絞り込み・ページ送りは単体テスト（PGlite）が網羅する。
 * 本物のパスワードのハッシュ計算が重いので、auth.spec.ts と同じく待ち時間を長くしてある（期待は変えない）。
 */
import type { Browser, Locator, Page, TestInfo } from "@playwright/test";
import { test, expect as baseExpect } from "./fixtures/index.ts";
import { stubExternalImages } from "./fixtures/images.ts";
import { readOrderKeys } from "./fixtures/storage.ts";
import { mockVerify } from "./fixtures/stripe-mock.ts";
import { BASE_URL, E2E_ORDERS_CLIENT_IPS, PATHS } from "./constants.ts";
import { product, totalPrice, yen } from "./support/catalog.ts";
import { BUYER_ORDERS, GUEST_ORDER, HISTORY_BUYER } from "./support/history.ts";
import type { SeededOrder } from "./support/history.ts";
import { mainRegion, open } from "./support/page.ts";

/** auth.spec.ts と同じ理由（登録・ログインのたびに本物の scrypt を計算する）で、assertion の待ち時間と制限時間を長くする */
const expect = baseExpect.configure({ timeout: 30_000 });
const TEST_TIMEOUT_MS = 180_000;

/** E2E 専用の DB のダミーのパスワード（本物の秘密ではない） */
const PASSWORD = "e2e-orders-correct-horse-battery-staple";

/** このテストの接続元の IP。auth.spec.ts と同じ幅のテストが同時に動いても、ログインの枠（10 秒に 3 回）を取り合わない */
function clientIp(testInfo: TestInfo): string {
  return E2E_ORDERS_CLIENT_IPS[
    testInfo.project.name as keyof typeof E2E_ORDERS_CLIENT_IPS
  ];
}

/** /orders を開き、転送されたログイン画面で資格情報を入れて送る。着いた先は /orders */
async function loginToOrders(
  page: Page,
  credentials: { email: string; password: string },
): Promise<void> {
  const main = mainRegion(page);
  await open(page, PATHS.orders);
  await expect(page).toHaveURL(`${PATHS.login}?next=%2Forders`);
  await main
    .getByRole("textbox", { name: "メールアドレス" })
    .fill(credentials.email);
  await main
    .getByLabel("パスワード", { exact: true })
    .fill(credentials.password);
  await main.getByRole("button", { name: "ログイン", exact: true }).click();
  await expect(page).toHaveURL(PATHS.orders);
  await expect(
    main.getByRole("heading", { level: 1, name: "注文履歴" }),
  ).toBeVisible();
}

/** 注文の 1 枚のカードが、seed した注文（注文番号・日付・品目と数量・金額）を出している */
async function expectOrderCard(
  card: Locator,
  order: SeededOrder,
): Promise<void> {
  await expect(card).toContainText(order.orderNo);
  await expect(card).toContainText(order.dateText);
  await expect(card).toContainText(yen(totalPrice(order.items)));
  // 品目の行は、品目の数と同じだけある。名前と数量・小計は、カタログから組んだ値
  await expect(card.getByRole("listitem")).toHaveCount(order.items.length);
  for (const { id, quantity } of order.items) {
    await expect(card).toContainText(`${product(id).name} × ${quantity}`);
    await expect(card).toContainText(yen(product(id).price * quantity));
  }
}

/** 履歴のカードが、seed した 2 件（新しい順）だけで、ゲストの注文は出ていない */
async function expectBuyerHistory(page: Page): Promise<void> {
  const cards = mainRegion(page).getByRole("article");
  await expect(cards).toHaveCount(2);
  await expectOrderCard(cards.nth(0), BUYER_ORDERS.newer);
  await expectOrderCard(cards.nth(1), BUYER_ORDERS.older);
  await expect(mainRegion(page)).not.toContainText(GUEST_ORDER.orderNo);
}

/** 別の端末のつもりの、まっさらなブラウザの context（cookie も localStorage も空）。閉じるのは呼び出し側 */
function newDevice(browser: Browser, page: Page, ip: string) {
  return browser.newContext({
    baseURL: BASE_URL,
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
    reducedMotion: "reduce",
    viewport: page.viewportSize() ?? undefined,
    extraHTTPHeaders: { "x-forwarded-for": ip },
  });
}

test("orders: 未ログインはログインへ転送され、新規登録した直後は注文が無く、ほかの人の注文もゲストの注文も出ない", async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(TEST_TIMEOUT_MS);
  await context.setExtraHTTPHeaders({ "x-forwarded-for": clientIp(testInfo) });
  const main = mainRegion(page);
  // 実行・幅ごとに違うメール（E2E の DB は実行をまたいで残り、2 つの幅のテストが同時に動くので、重ならないようにする）
  const email = `e2e-orders-${testInfo.project.name}-${crypto.randomUUID()}@example.com`;

  await test.step("未ログインで /orders を開くと、ログイン画面（ログイン後に /orders へ戻る）へ転送される", async () => {
    await open(page, PATHS.orders);
    await expect(page).toHaveURL(`${PATHS.login}?next=%2Forders`);
    await expect(
      main.getByRole("heading", { level: 1, name: "サインイン" }),
    ).toBeVisible();
  });

  await test.step("「新規登録」で登録すると、行き先の /orders に着き、空の表示が出る（DB にある別の人の注文・ゲストの注文は出ない）", async () => {
    await main.getByRole("link", { name: "新規登録" }).click();
    await expect(page).toHaveURL(`${PATHS.signup}?next=%2Forders`);
    await main.getByRole("textbox", { name: "メールアドレス" }).fill(email);
    await main.getByLabel("パスワード", { exact: true }).fill(PASSWORD);
    await main.getByRole("button", { name: "登録する", exact: true }).click();

    await expect(page).toHaveURL(PATHS.orders);
    await expect(
      main.getByRole("heading", { level: 1, name: "注文履歴" }),
    ).toBeVisible();
    await expect(
      main.getByRole("heading", { name: "まだご注文はありません" }),
    ).toBeVisible();
    await expect(
      main.getByRole("link", { name: "商品を見る" }),
    ).toHaveAttribute("href", PATHS.products);
    await expect(main.getByRole("article")).toHaveCount(0);
    await expect(main).not.toContainText(BUYER_ORDERS.newer.orderNo);
    await expect(main).not.toContainText(GUEST_ORDER.orderNo);
    expect(await readOrderKeys(page)).toEqual([]);
  });
});

test("orders: 注文を持つ利用者でログインすると、その人の注文が新しい順に出る。成功ページの注文番号と同じで、別の端末でも同じ履歴が出る", async ({
  page,
  context,
  browser,
}, testInfo) => {
  test.setTimeout(TEST_TIMEOUT_MS);
  const ip = clientIp(testInfo);
  await context.setExtraHTTPHeaders({ "x-forwarded-for": ip });
  const main = mainRegion(page);

  await test.step("ログインすると、その人の 2 件が新しい順に出る（品目と数量・金額・日付つき）。ゲストの注文は出ない", async () => {
    await loginToOrders(page, HISTORY_BUYER);
    await expectBuyerHistory(page);
    expect(await readOrderKeys(page)).toEqual([]);
  });

  await test.step("成功ページ（実サーバの確認。確定済みの注文は Stripe に問い合わせずに返る）の注文番号は、履歴の番号と同じ", async () => {
    const verify = await mockVerify(page, { kind: "real-server" });
    await open(
      page,
      `${PATHS.success}?session_id=${BUYER_ORDERS.newer.sessionId}`,
    );
    await expect(
      main.getByRole("heading", {
        level: 1,
        name: "ご購入ありがとうございます",
      }),
    ).toBeVisible();
    await expect(main.getByText(/^ORD-[0-9A-Z]+$/)).toHaveText(
      BUYER_ORDERS.newer.orderNo,
    );
    expect(verify.calls).toEqual([
      { sessionId: BUYER_ORDERS.newer.sessionId, realStatus: 200 },
    ]);

    await main.getByRole("link", { name: "注文履歴を見る" }).click();
    await expect(page).toHaveURL(PATHS.orders);
    await expectBuyerHistory(page);
  });

  await test.step("別の端末（cookie も localStorage も空の別の context）でログインしても、同じ履歴が出る", async () => {
    const otherDevice = await newDevice(browser, page, ip);
    try {
      await stubExternalImages(otherDevice);
      const otherPage = await otherDevice.newPage();
      await loginToOrders(otherPage, HISTORY_BUYER);
      await expectBuyerHistory(otherPage);
      expect(await readOrderKeys(otherPage)).toEqual([]);
    } finally {
      await otherDevice.close();
    }
  });
});
