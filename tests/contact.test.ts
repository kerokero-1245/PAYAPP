// お問い合わせフォームの検証のテスト。実行: npm test
//
// なぜあるか: お問い合わせはバックエンドを持たないデモで、検証だけが入力を止める唯一の仕組み。
// 必須・メールの形式・文字数のどれかが外れると、空や壊れた内容でも「送信済み」と表示されてしまう。
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  countChars,
  CONTACT_FIELDS,
  CONTACT_LIMITS,
  EMPTY_CONTACT,
  validateContact,
  validateContactField,
} from "../lib/contact.ts";

const valid = {
  name: "山田 花子",
  email: "hanako@example.com",
  topic: "shipping",
  orderId: "",
  message: "配送日の指定について教えてください。",
};

test("すべて正しければ ok でエラーなし", () => {
  assert.deepEqual(validateContact(valid), { ok: true, errors: {} });
});

test("初期値のままでは必須 3 項目（お名前・メール・内容）がエラー", () => {
  const { ok, errors } = validateContact(EMPTY_CONTACT);
  assert.equal(ok, false);
  assert.deepEqual(Object.keys(errors).sort(), ["email", "message", "name"]);
});

test("必須: 空白だけのお名前・メール・内容はエラー", () => {
  for (const field of ["name", "email", "message"] as const) {
    const { ok, errors } = validateContact({ ...valid, [field]: "   " });
    assert.equal(ok, false, field);
    assert.ok(errors[field], field);
  }
});

test("メールの形式: @ やドメインの無いもの・空白を含むものはエラー", () => {
  for (const email of [
    "hanako",
    "hanako@",
    "@example.com",
    "hanako@example",
    "han ako@example.com",
    "a@b@c.com",
  ]) {
    assert.match(validateContactField("email", { email }) ?? "", /形式/, email);
  }
  for (const email of [
    "hanako@example.com",
    "a.b+c@sub.example.co.jp",
    "  hanako@example.com  ",
  ]) {
    assert.equal(validateContactField("email", { email }), undefined, email);
  }
});

test("メールの長さ: 254 文字を超えるとエラー", () => {
  const local = "a".repeat(CONTACT_LIMITS.emailMax - "@example.com".length + 1);
  assert.ok(validateContactField("email", { email: `${local}@example.com` }));
});

test("文字数: お名前は 50 文字まで", () => {
  assert.equal(
    validateContactField("name", { name: "あ".repeat(CONTACT_LIMITS.nameMax) }),
    undefined,
  );
  assert.match(
    validateContactField("name", {
      name: "あ".repeat(CONTACT_LIMITS.nameMax + 1),
    }) ?? "",
    /50 文字以内/,
  );
});

test("文字数: お問い合わせ内容は 10〜1000 文字（前後の空白は数えない）", () => {
  const msg = (n: number) => ({ message: "あ".repeat(n) });
  assert.match(
    validateContactField("message", msg(CONTACT_LIMITS.messageMin - 1)) ?? "",
    /10 文字以上/,
  );
  assert.equal(
    validateContactField("message", msg(CONTACT_LIMITS.messageMin)),
    undefined,
  );
  assert.equal(
    validateContactField("message", msg(CONTACT_LIMITS.messageMax)),
    undefined,
  );
  assert.match(
    validateContactField("message", msg(CONTACT_LIMITS.messageMax + 1)) ?? "",
    /1000 文字以内/,
  );
  assert.match(
    validateContactField("message", { message: `   ${"あ".repeat(9)}   ` }) ??
      "",
    /10 文字以上/,
  );
});

test("文字数は見た目の 1 文字で数える（絵文字 10 個は 10 文字）", () => {
  assert.equal(
    validateContactField("message", { message: "😀".repeat(10) }),
    undefined,
  );
});

test("結合した絵文字（👨‍👩‍👧）も 1 文字に数える", () => {
  const family = "👨‍👩‍👧";
  assert.equal(countChars(family), 1);
  assert.equal(countChars(family.repeat(2)), 2);
  // コードポイントでは 10 個になる 2 文字は、下限 10 文字に届かない
  assert.equal([...family.repeat(2)].length, 10);
  assert.match(
    validateContactField("message", { message: family.repeat(2) }) ?? "",
    /10 文字以上/,
  );
  assert.equal(
    validateContactField("message", { message: family.repeat(10) }),
    undefined,
  );
  assert.equal(countChars("か\u3099"), 1); // 結合文字（か + 濁点の結合文字）
});

test("種別は選択肢の値だけを受け付ける", () => {
  assert.equal(validateContactField("topic", { topic: "order" }), undefined);
  assert.ok(validateContactField("topic", { topic: "" }));
  assert.ok(validateContactField("topic", { topic: "spam" }));
});

test("注文番号は任意。入れたときは ORD- で始まる形式だけ", () => {
  assert.equal(validateContactField("orderId", { orderId: "" }), undefined);
  assert.equal(
    validateContactField("orderId", { orderId: "ORD-MF3K2A" }),
    undefined,
  );
  assert.equal(
    validateContactField("orderId", { orderId: "ord-mf3k2a" }),
    undefined,
  );
  assert.ok(validateContactField("orderId", { orderId: "12345" }));
  assert.ok(validateContactField("orderId", { orderId: "ORD-" }));
});

test("エラーの並びは画面の入力欄の順（先頭のエラー欄へフォーカスを移すため）", () => {
  const { errors } = validateContact({
    ...EMPTY_CONTACT,
    topic: "x",
    orderId: "x",
  });
  assert.deepEqual(Object.keys(errors), CONTACT_FIELDS);
});
