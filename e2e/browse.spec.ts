/**
 * 商品一覧: トップから一覧へ進み、カテゴリで絞り込み、検索する。
 * 件数・商品名の期待値はカタログから組む。部分一致の網羅は単体（tests/graphql.test.ts）に任せる。
 */
import { test, expect } from "./fixtures/index.ts";
import { PATHS } from "./constants.ts";
import { PRODUCTS, categoryOf, productsIn } from "./support/catalog.ts";
import { isNarrow, mainRegion, open, searchProducts } from "./support/page.ts";

test("browse: トップから一覧へ進み、カテゴリの絞り込みと検索で件数が変わる", async ({
  page,
}) => {
  const main = mainRegion(page);
  const watches = categoryOf("watches");
  const leather = categoryOf("leather");

  await open(page, PATHS.home);
  await expect(
    page.getByRole("heading", { level: 1, name: /静かな贅沢/ }),
  ).toBeVisible();

  await test.step("「コレクションを見る」で一覧へ。件数はカタログの全商品", async () => {
    // トップには同じ文言のリンクが 2 つある（ヒーローと下の案内）。先に出てくるヒーローのほう
    await page
      .getByRole("link", { name: "コレクションを見る" })
      .first()
      .click();
    await expect(page).toHaveURL(PATHS.products);
    await expect(main.getByRole("heading", { level: 1 })).toHaveText(
      "すべての商品",
    );
    await expect(
      main.getByText(`${PRODUCTS.length} 件`, { exact: true }),
    ).toBeVisible();
  });

  await test.step("チップ（どの幅にもある）でカテゴリを絞ると、URL・商品・件数が変わる", async () => {
    await main
      .getByRole("button", { name: watches.label, exact: true })
      .click();
    await expect(page).toHaveURL(`${PATHS.products}?category=${watches.slug}`);
    await expect(main.getByRole("heading", { level: 3 })).toHaveText(
      productsIn(watches.slug).map((p) => p.name),
    );
    await expect(
      main.getByText(`${productsIn(watches.slug).length} 件`, { exact: true }),
    ).toBeVisible();
  });

  // サイドメニューは md 以上だけ。選んでいるカテゴリが aria-current="page"
  if (!isNarrow(page)) {
    await test.step("サイドメニューでカテゴリを替える", async () => {
      const side = page.getByRole("complementary");
      await expect(
        side.getByRole("link", { name: watches.label }),
      ).toHaveAttribute("aria-current", "page");
      await side.getByRole("link", { name: leather.label }).click();
      await expect(page).toHaveURL(
        `${PATHS.products}?category=${leather.slug}`,
      );
      await expect(
        side.getByRole("link", { name: leather.label }),
      ).toHaveAttribute("aria-current", "page");
      await expect(main.getByRole("heading", { level: 3 })).toHaveText(
        productsIn(leather.slug).map((p) => p.name),
      );
      await expect(
        main.getByText(`${productsIn(leather.slug).length} 件`, {
          exact: true,
        }),
      ).toBeVisible();
    });
  }

  await test.step("該当しない検索語は 0 件になり、空の案内が出る", async () => {
    await searchProducts(page, "zzz");
    await expect(page).toHaveURL(`${PATHS.products}?q=zzz`);
    await expect(main.getByRole("heading", { level: 1 })).toHaveText(
      "「zzz」の検索結果",
    );
    await expect(main.getByText("0 件", { exact: true })).toBeVisible();
    await expect(
      main.getByRole("heading", { name: "該当する商品がありません" }),
    ).toBeVisible();
  });

  await test.step("検索語を残したままカテゴリを選ぶと、カテゴリが注記に出る", async () => {
    await main
      .getByRole("button", { name: watches.label, exact: true })
      .click();
    await expect(page).toHaveURL(
      `${PATHS.products}?category=${watches.slug}&q=zzz`,
    );
    await expect(main.getByText(`カテゴリ: ${watches.label}`)).toBeVisible();
    await expect(main.getByText("0 件", { exact: true })).toBeVisible();
  });
});
