/**
 * 404 の本文がサーバの HTML に入っていること。
 * Next 16.0.8 は、page の中で notFound() を投げる形だと 404 の本文をサーバの HTML に入れず、ブラウザ側でだけ描く
 * （app/product/[id]/page.tsx の dynamicParams = false の注記）。`next start` で確かめる（dev は挙動が違う）。
 */
import { test, expect } from "./fixtures/index.ts";

const NOT_FOUND_TITLE = "ページが見つかりませんでした";

/** カタログに無い商品と、存在しない URL */
const MISSING_PATHS = ["/product/999", "/zzz"];

test("notfound: 存在しない商品・URL は、サーバの HTML が 404 と本文を返す", async ({
  page,
}) => {
  for (const path of MISSING_PATHS) {
    await test.step(path, async () => {
      const response = await page.goto(path);
      if (!response) throw new Error(`${path} の応答がありません`);
      expect(response.status()).toBe(404);
      // JS を実行する前の HTML（ブラウザ側で描いたものではない）に見出しが入っている
      expect(await response.text()).toMatch(
        new RegExp(`<h1[^>]*>${NOT_FOUND_TITLE}</h1>`),
      );
      await expect(
        page.getByRole("heading", { level: 1, name: NOT_FOUND_TITLE }),
      ).toBeVisible();
    });
  }
});
