/**
 * お問い合わせ（デモ）: 検証・先頭の欄へのフォーカス・成功表示。送信も保存もしないので、POST は 1 件も出ない。
 * 文言の網羅は単体（tests/contact.test.ts）に任せ、ここでは画面の振る舞いを確かめる。
 */
import { test, expect } from "./fixtures/index.ts";
import { PATHS } from "./constants.ts";
import { mainRegion, open } from "./support/page.ts";

const INPUT = {
  name: "山田 花子",
  email: "hanako@example.com",
  topic: "ご注文について",
  /** 小文字で入れても、確認の表示は大文字になる */
  orderId: "ord-e2e01",
  message: "注文した商品の配送状況を教えてください。",
};

test("contact: 検証エラーと先頭の欄へのフォーカス、成功表示。POST は出ない", async ({ page }) => {
  const posts: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST") posts.push(request.url());
  });
  await open(page, PATHS.contact);

  const main = mainRegion(page);
  const name = main.getByRole("textbox", { name: "お名前" });
  const email = main.getByRole("textbox", { name: "メールアドレス" });
  const message = main.getByRole("textbox", { name: "お問い合わせ内容" });

  await test.step("空で送ると、必須の欄にエラーが出て、先頭の欄（お名前）にフォーカスが移る", async () => {
    await main.getByRole("button", { name: "送信する（デモ）" }).click();
    await expect(name).toHaveAccessibleDescription("お名前を入力してください");
    await expect(email).toHaveAccessibleDescription("メールアドレスを入力してください");
    await expect(message).toHaveAccessibleDescription(/お問い合わせ内容を入力してください/);
    for (const field of [name, email, message]) await expect(field).toHaveAttribute("aria-invalid", "true");
    await expect(name).toBeFocused();
  });

  await test.step("送信を試みたあとは、欄を離れるたびに再検証される", async () => {
    await email.fill("abc");
    await email.blur();
    await expect(email).toHaveAccessibleDescription("メールアドレスの形式が正しくありません");
    await email.fill(INPUT.email);
    await email.blur();
    await expect(email).not.toHaveAttribute("aria-invalid", "true");
    await expect(main.getByText("メールアドレスの形式が正しくありません")).toHaveCount(0);
  });

  await test.step("正しく入力して送ると、受け付けた内容の写しが出る（フォーカスは見出しへ）", async () => {
    await name.fill(INPUT.name);
    await main.getByRole("combobox", { name: "種別" }).selectOption({ label: INPUT.topic });
    await main.getByRole("textbox", { name: "注文番号（任意）" }).fill(INPUT.orderId);
    await message.fill(INPUT.message);
    // 欄を離れてエラーを消してから押す。エラーが残ったまま押すと、blur で文言が消えて送信ボタンが上にずれ、クリックが空振りする
    await message.blur();
    await main.getByRole("button", { name: "送信する（デモ）" }).click();

    const thanks = main.getByRole("heading", { name: "送信内容を受け付けました（デモ）" });
    await expect(thanks).toBeVisible();
    await expect(thanks).toBeFocused();
    await expect(main.getByRole("definition")).toHaveText([
      INPUT.name,
      INPUT.email,
      INPUT.topic,
      INPUT.orderId.toUpperCase(),
      INPUT.message,
    ]);
  });

  expect(posts, "お問い合わせは送信しない（POST が出ていない）").toEqual([]);
});
