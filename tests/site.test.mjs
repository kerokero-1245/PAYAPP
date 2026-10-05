// URL の決め方のテスト。実行: npm test
//
// なぜあるか: 以前は決済後の戻り先をリクエストの Origin ヘッダーから作っており、
// 他サイトから送られた要求の戻り先がそのサイトになりえた。また NEXT_PUBLIC_BASE_URL が
// 不正な値だと new URL() の例外で全ページが落ちた。
import { test } from "node:test";
import assert from "node:assert/strict";

import { parseBaseUrl, resolveMetadataBase, resolveReturnOrigin } from "../lib/site.mjs";

const evilHeaders = new Headers({ origin: "https://evil.example", host: "evil.example" });

test("戻り先は Origin ヘッダーを使わず、リクエスト URL の origin にする", () => {
  assert.equal(
    resolveReturnOrigin({ requestUrl: "http://localhost:3101/checkout", headers: evilHeaders }),
    "http://localhost:3101"
  );
});

test("NEXT_PUBLIC_BASE_URL があればそれを使う（パスは落とす）", () => {
  assert.equal(
    resolveReturnOrigin({ requestUrl: "http://localhost:3101/checkout", headers: evilHeaders, baseUrl: "https://shop.example/some/path" }),
    "https://shop.example"
  );
});

test("NEXT_PUBLIC_BASE_URL が不正ならリクエスト URL の origin に戻す", () => {
  for (const baseUrl of [undefined, "", "   ", "not a url", "javascript:alert(1)", "ftp://shop.example", "//shop.example"]) {
    assert.equal(
      resolveReturnOrigin({ requestUrl: "https://payapp.example/checkout", headers: evilHeaders, baseUrl }),
      "https://payapp.example",
      String(baseUrl)
    );
  }
});

test("metadataBase: 未設定・不正な値でも例外にせず undefined", () => {
  for (const v of [undefined, null, "", "not a url", "javascript:alert(1)", "http://"]) {
    assert.doesNotThrow(() => resolveMetadataBase(v));
    assert.equal(resolveMetadataBase(v), undefined, String(v));
  }
  assert.equal(resolveMetadataBase("https://shop.example/x").href, "https://shop.example/");
  assert.equal(parseBaseUrl("http://localhost:3000").origin, "http://localhost:3000");
});
