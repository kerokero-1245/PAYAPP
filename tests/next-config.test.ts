// next.config.ts の設定のテスト。実行: npm test
//
// なぜあるか: ログイン・新規登録・ログアウトの画面を、他のサイトの <iframe> に透明にかぶせて押させる（クリックジャッキング）ことができた
// （X-Frame-Options も CSP の frame-ancestors も付いていなかった）。全ページに、iframe に入れさせないヘッダーを付ける。
// Next の headers() は設定のまま、`source` に当たる全部のパスへ付ける。ここでは設定そのものを読む
// （実サーバに curl したときの確認は、検収の記録にある）。
import assert from "node:assert/strict";
import { test } from "node:test";

import nextConfig from "../next.config.ts";

test("next.config: 全ページ（/:path*）に X-Frame-Options: DENY と CSP の frame-ancestors 'none' を付ける", async () => {
  assert.equal(typeof nextConfig.headers, "function");
  const rules = await nextConfig.headers!();
  assert.equal(rules.length, 1);
  const [rule] = rules;
  // /:path* は / も /login も /api/... も、すべてのパスに当たる
  assert.equal(rule!.source, "/:path*");
  const headers = Object.fromEntries(
    rule!.headers.map(({ key, value }) => [key.toLowerCase(), value]),
  );
  assert.equal(headers["x-frame-options"], "DENY");
  assert.equal(headers["content-security-policy"], "frame-ancestors 'none'");
});
