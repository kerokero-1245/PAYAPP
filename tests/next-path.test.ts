// ログイン後の行き先（?next=）の検査 lib/auth/next-path.ts のテスト。実行: npm test
//
// なぜあるか: ログインが要るページは、未ログインの人を /login?next=<そのページ> に転送し、ログインしたら next へ戻す。
// next は URL に書ける値（誰でも作れる）なので、そのまま移動先にすると、ログインした直後に別のサイトへ飛ばせてしまう（オープンリダイレクト）。
// ここでは次を固定する。
//  - 自サイトの中のパスだけを通し、別のサイトを指しうる値（//・\・スキームつき・制御文字つき）は既定の行き先に落とす
//  - 通した値は URL として解析し直した形で返し、解析で別のサイトに化ける値（"/..//evil.example"）も落とす
//  - どんな入力でも、返す値は必ず自サイトのパス（短い文字列の総当たりで確かめる）
//  - ログイン画面への転送先は next を符号化して付け、受け取った側が safeNextPath を通して元のパスに戻せる
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ACCOUNT_PATH,
  DEFAULT_NEXT_PATH,
  LOGIN_PATH,
  SIGNUP_PATH,
  authPageHref,
  loginPathFor,
  safeNextPath,
} from "../lib/auth/next-path.ts";

/** 自サイトのつもりの基準（実在しないホスト）。返す値をこの基準で解くと、同じオリジンのままでなければならない */
const SITE = "https://site.example";

/** 返す値が自サイトの中のパスか（"/" で始まり、"//" で始まらず、基準で解いても別のオリジンにならない） */
function staysOnSite(path: string): boolean {
  return (
    path.startsWith("/") &&
    !path.startsWith("//") &&
    new URL(path, SITE).origin === SITE
  );
}

test("safeNextPath: 自サイトのパス（検索語・ハッシュつきを含む）はそのまま通す", () => {
  for (const path of [
    "/account",
    "/orders",
    "/",
    "/product?category=watches&q=a",
    "/product/1#details",
    "/account?x=1",
    // "//" を含んでも、先頭でなければ自サイトのパスのまま（"?" 以降は検索語）
    "/?next=//evil.example",
    "/a//b",
    // % 符号化された斜線は、パスの一部として残る（別のサイトにはならない）
    "/%2F%2Fevil.example",
    "/%5Cevil.example",
    "/@evil.example",
  ]) {
    assert.equal(safeNextPath(path), path, path);
  }
  // URL として解析し直した形で返す（. と .. を畳み、日本語は % 符号化する）
  assert.equal(safeNextPath("/a/../b"), "/b");
  assert.equal(safeNextPath("/a/./b"), "/a/b");
  assert.equal(safeNextPath("/日本語"), "/%E6%97%A5%E6%9C%AC%E8%AA%9E");
});

test("safeNextPath: 別のサイトを指しうる値・パスでない値は、既定の行き先（/account）に落とす", () => {
  const unsafe: unknown[] = [
    // 文字列でない
    undefined,
    null,
    123,
    true,
    {},
    [],
    ["/orders"],
    // 空・パスでない（"/" で始まらない）
    "",
    " ",
    " /account",
    "account",
    "./account",
    "../account",
    "?next=/account",
    // プロトコル相対（//host は別のサイト）
    "//evil.example",
    "//evil.example/account",
    "///evil.example",
    "////",
    // バックスラッシュ（ブラウザは / として扱う）
    "/\\evil.example",
    "\\\\evil.example",
    "\\/evil.example",
    "/\\/evil.example",
    "/account\\evil",
    // 絶対 URL・スキームつき
    "https://evil.example",
    "http://evil.example/account",
    "HTTPS://EVIL.EXAMPLE",
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "mailto:a@example.com",
    "file:///etc/passwd",
    "ftp://evil.example",
    // 制御文字（URL の解析が黙って取り除く改行・タブで "//" に化ける）
    "/\t/evil.example",
    "/\n/evil.example",
    "/\r/evil.example",
    "/\r\nLocation: https://evil.example",
    "/\u0000/evil.example",
    "/\u007f",
    "/account\u0001",
    // 解析すると "//host" に畳まれて別のサイトになる
    "/..//evil.example",
    "/.//evil.example",
    "/a/..//evil.example",
    "/a/../..//evil.example",
    // 長すぎる
    "/" + "a".repeat(2048),
  ];
  for (const value of unsafe) {
    assert.equal(safeNextPath(value), DEFAULT_NEXT_PATH, JSON.stringify(value));
  }
  assert.equal(DEFAULT_NEXT_PATH, ACCOUNT_PATH);
});

test("safeNextPath: 長さの上限ちょうど（2048 文字）は通す", () => {
  const edge = "/" + "a".repeat(2047);
  assert.equal(edge.length, 2048);
  assert.equal(safeNextPath(edge), edge);
});

test("safeNextPath: どんな入力でも、返す値は自サイトのパス（短い文字列の総当たり）", () => {
  // 斜線・バックスラッシュ・ドット・% 符号・コロン・タブ・改行・? # @ 空白・文字を、長さ 4 まで全部の並びで試す
  const alphabet = [
    "/",
    "\\",
    ".",
    "a",
    "%",
    ":",
    "\t",
    "\n",
    "?",
    "#",
    "@",
    " ",
  ];
  let tried = 0;
  const visit = (prefix: string, depth: number) => {
    const result = safeNextPath(prefix);
    assert.ok(
      staysOnSite(result),
      `${JSON.stringify(prefix)} → ${JSON.stringify(result)}`,
    );
    tried += 1;
    if (depth === 0) return;
    for (const char of alphabet) visit(prefix + char, depth - 1);
  };
  visit("", 4);
  assert.ok(tried > 20_000, `総当たりの件数: ${tried}`);
});

test("loginPathFor: 未ログインの転送先は /login?next=<符号化した行き先>。受け取った側が safeNextPath を通して元のパスに戻せる", () => {
  assert.equal(loginPathFor("/account"), "/login?next=%2Faccount");
  assert.equal(
    loginPathFor("/orders?page=2"),
    "/login?next=%2Forders%3Fpage%3D2",
  );

  for (const path of ["/account", "/orders?page=2&x=a b", "/product/1#top"]) {
    const url = new URL(loginPathFor(path), SITE);
    assert.equal(url.pathname, LOGIN_PATH);
    assert.equal(
      safeNextPath(url.searchParams.get("next")),
      safeNextPath(path),
    );
  }

  // 安全でない行き先は、転送先の URL に載せる前に既定の行き先へ落ちる
  assert.equal(loginPathFor("//evil.example"), "/login?next=%2Faccount");
  assert.equal(loginPathFor("https://evil.example"), "/login?next=%2Faccount");
});

test("authPageHref: /login と /signup を行き来するとき、行き先があれば符号化して引き継ぎ、無ければ付けない", () => {
  assert.equal(authPageHref(SIGNUP_PATH, undefined), "/signup");
  assert.equal(authPageHref(SIGNUP_PATH, "/orders"), "/signup?next=%2Forders");
  assert.equal(
    authPageHref(LOGIN_PATH, "/product?q=a&b=c"),
    "/login?next=%2Fproduct%3Fq%3Da%26b%3Dc",
  );
});
