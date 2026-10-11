// 認証（Better Auth + 認証の表）のテスト。サーバは起動せず、DB は PGlite をテストごとにメモリ上に立てる。実行: npm test
//
// なぜあるか: 認証は「誰でも好きなメールでログインできる」モックから、パスワード・セッション・cookie を持つ本物に変わった。
// 本物の Better Auth（lib/auth/config.ts の createAuth）に /api/auth/* を送って、次を固定する。
//  - 登録 → ログイン → セッションが取れ、ログアウトで切れる。cookie は HttpOnly・SameSite=Lax・Path=/・7 日
//  - パスワードは DB に平文で残らない（scrypt のハッシュ）。ログインの失敗はメールの有無を言い分けない
//  - 試行回数の制限・送信元（Origin）の検査・cookie の改ざん・セッションの期限と延長が効いている
//  - 認証の表が Better Auth の要求と食い違わない（Better Auth を上げたときに気付く）
// 採用した既定値の一覧は README の「認証」節。ここで確かめた値がその根拠。
import assert from "node:assert/strict";
import { test } from "node:test";
import { getAuthTables } from "better-auth/db";
import { Column, eq, is } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import type { PgTable } from "drizzle-orm/pg-core";

import {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  SESSION_COOKIE_NAME,
  SESSION_EXPIRES_IN_SECONDS,
} from "../lib/auth/constants.ts";
import { viewerFromHeaders } from "../lib/auth/viewer.ts";
import type { Db } from "../lib/db/connect.ts";
import * as schema from "../lib/db/schema.ts";
import { account, session, user, verification } from "../lib/db/schema.ts";
import { withTestDb } from "../lib/db/test-helpers.ts";
import {
  SAMPLE_USER,
  TEST_ORIGIN,
  authRequest,
  createTestAuth,
  findSetCookie,
  readJson,
  setCookies,
  signIn,
  signUp,
} from "./support/auth.ts";

const SESSION_COOKIE = SESSION_COOKIE_NAME;

/** Better Auth のエラー応答の本文（{ message, code }） */
async function errorOf(response: Response) {
  const body = (await readJson(response)) as {
    message?: string;
    code?: string;
  } | null;
  return { status: response.status, code: body?.code, message: body?.message };
}

/** cookie の値から、セッションの識別子（token。署名の前の部分）を取り出す */
function tokenOf(cookie: string): string {
  const value = decodeURIComponent(cookie.split("; ")[0]!.split("=")[1]!);
  return value.split(".")[0]!;
}

/** user 表の行数 */
async function countUsers(db: Db): Promise<number> {
  return (await db.select().from(user)).length;
}

// ---------- 認証の表 ----------

test("認証の表: Better Auth が要求する表・列・型・必須・一意・外部キー・索引と、lib/db/schema.ts が食い違わない（Better Auth を上げたときの検出）", () =>
  withTestDb(async ({ db }) => {
    const auth = createTestAuth(db);
    const expected = getAuthTables(auth.options);
    // lib/db/schema.ts のうち、Better Auth の表（モデル名 → Drizzle の表）
    const actual: Record<string, PgTable> = {
      user,
      session,
      account,
      verification,
    };

    assert.deepEqual(
      Object.keys(expected).sort(),
      Object.keys(actual).sort(),
      "Better Auth が要求する表が、user・session・account・verification の 4 つと食い違う",
    );

    for (const [model, table] of Object.entries(actual)) {
      const want = expected[model]!;
      const config = getTableConfig(table);
      assert.equal(config.name, want.modelName, `${model} の表の名前`);

      // Drizzle の表のプロパティ名 → 列（アダプタは Better Auth のフィールド名で、このプロパティ名の列を引く）
      const columns = new Map<string, Column>(
        Object.entries(table).filter((entry): entry is [string, Column] =>
          is(entry[1], Column),
        ),
      );
      assert.deepEqual(
        [...columns.keys()].sort(),
        ["id", ...Object.keys(want.fields)].sort(),
        `${model} の列の過不足`,
      );

      const id = columns.get("id")!;
      assert.ok(id.primary && id.notNull, `${model}.id は主キー`);
      assert.equal(id.dataType, "string", `${model}.id は文字列`);

      for (const [field, attribute] of Object.entries(want.fields)) {
        const column = columns.get(field)!;
        const label = `${model}.${field}`;
        assert.equal(
          column.notNull,
          attribute.required !== false,
          `${label} の必須`,
        );
        assert.equal(
          column.isUnique,
          attribute.unique === true,
          `${label} の一意`,
        );
        const dataType = { string: "string", boolean: "boolean", date: "date" }[
          String(attribute.type)
        ];
        assert.equal(
          column.dataType,
          dataType,
          `${label} の型（${String(attribute.type)}）`,
        );

        // 外部キー
        const foreignKeys = config.foreignKeys.filter(
          (fk) => fk.reference().columns[0] === column,
        );
        if (attribute.references) {
          assert.equal(foreignKeys.length, 1, `${label} の外部キー`);
          const fk = foreignKeys[0]!;
          assert.equal(
            getTableConfig(fk.reference().foreignTable).name,
            attribute.references.model,
          );
          assert.equal(
            fk.reference().foreignColumns[0]!.name,
            attribute.references.field,
          );
          assert.equal(
            fk.onDelete,
            attribute.references.onDelete ?? "cascade",
            `${label} の削除時の動作`,
          );
        } else {
          assert.equal(foreignKeys.length, 0, `${label} に余計な外部キー`);
        }

        // 索引（Better Auth が index: true とした列には、その列の索引がある）
        // （索引の列は、表の定義とは別のオブジェクトなので、列の名前で比べる）
        const indexed = config.indexes.some((index) =>
          index.config.columns.some(
            (c) => "name" in c && c.name === column.name,
          ),
        );
        assert.equal(indexed, attribute.index === true, `${label} の索引`);
      }
      // 外部キーも索引も、Better Auth の表に余計なものは無い
      const wantedForeignKeys = Object.values(want.fields).filter(
        (f) => f.references,
      ).length;
      assert.equal(
        config.foreignKeys.length,
        wantedForeignKeys,
        `${model} の外部キーの数`,
      );
    }

    // Better Auth の表のほかに、アプリの表（schema.ts のほかの表）は、認証の表を要求に加えない
    assert.ok(
      !("rateLimit" in expected),
      "試行回数の制限の表は使わない（メモリで数える）",
    );
    assert.ok(schema.orders && schema.products, "アプリの表は別にある");
  }));

// ---------- 登録・ログイン・ログアウト ----------

test("認証: 登録すると、そのままログイン状態になり、セッションが取れる。cookie は HttpOnly・SameSite=Lax・Path=/・7 日で、http の URL では Secure を付けない", () =>
  withTestDb(async ({ db }) => {
    const auth = createTestAuth(db);
    const { response, cookie } = await signUp(
      auth,
      { ...SAMPLE_USER, email: "Hanako@Example.COM" },
      {
        headers: {
          "x-forwarded-for": "203.0.113.5",
          "user-agent": "Mozilla/5.0 (Test)",
        },
      },
    );

    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      user: { id: string; email: string; name: string };
    };
    assert.equal(
      body.user.email,
      "hanako@example.com",
      "メールは小文字にして保存する",
    );
    assert.equal(body.user.name, SAMPLE_USER.name);

    // cookie の属性（採否の根拠）
    const line = findSetCookie(response, SESSION_COOKIE);
    assert.ok(line, "セッションの cookie が発行される");
    const attributes = line
      .split(";")
      .slice(1)
      .map((a) => a.trim());
    assert.ok(attributes.includes("HttpOnly"), `HttpOnly: ${line}`);
    assert.ok(attributes.includes("SameSite=Lax"), `SameSite=Lax: ${line}`);
    assert.ok(attributes.includes("Path=/"), `Path=/: ${line}`);
    assert.ok(
      attributes.includes(`Max-Age=${SESSION_EXPIRES_IN_SECONDS}`),
      `Max-Age=7 日: ${line}`,
    );
    assert.ok(
      !attributes.includes("Secure"),
      `http の URL では Secure なし: ${line}`,
    );
    assert.ok(
      !line.startsWith("__Secure-"),
      "http の URL では __Secure- の接頭辞なし",
    );
    assert.equal(
      setCookies(response).length,
      1,
      "発行する cookie はセッションの 1 つだけ",
    );

    // cookie でセッションが取れ、DB のセッションの行と一致する
    const current = await auth.api.getSession({
      headers: new Headers({ cookie }),
    });
    assert.equal(current?.user.id, body.user.id);
    assert.equal(current?.user.email, "hanako@example.com");
    const [row] = await db.select().from(session);
    assert.equal(row?.userId, body.user.id);
    assert.equal(row?.token, tokenOf(cookie));
    // セッションの行に残る接続元の情報（プライバシーポリシーの「ログインの記録」の根拠）: IP アドレスとブラウザの種類
    assert.equal(row?.ipAddress, "203.0.113.5");
    assert.equal(row?.userAgent, "Mozilla/5.0 (Test)");
    const days7 = SESSION_EXPIRES_IN_SECONDS * 1000;
    assert.ok(
      Math.abs(row!.expiresAt.getTime() - (Date.now() + days7)) < 60_000,
      "期限は 7 日先",
    );
  }));

test("認証: 登録 → ログアウト → ログインで、ログアウトしたセッションは無効になり、ログインのたびに新しいセッションの識別子ができる", () =>
  withTestDb(async ({ db }) => {
    const auth = createTestAuth(db);
    const first = await signUp(auth);
    const firstToken = tokenOf(first.cookie);
    const headers = (cookie: string) => new Headers({ cookie });
    assert.ok(await auth.api.getSession({ headers: headers(first.cookie) }));

    // ログアウト: セッションの行を消し、cookie を消す指示を返す
    const out = await auth.handler(
      authRequest("/sign-out", {
        method: "POST",
        body: {},
        headers: { cookie: first.cookie },
      }),
    );
    assert.equal(out.status, 200);
    const cleared = findSetCookie(out, SESSION_COOKIE);
    assert.match(cleared ?? "", /Max-Age=0/, "cookie を消す");
    assert.equal(
      (await db.select().from(session)).length,
      0,
      "セッションの行が消える",
    );
    assert.equal(
      await auth.api.getSession({ headers: headers(first.cookie) }),
      null,
      "ログアウト前の cookie ではもう入れない",
    );

    // ログイン: 新しいセッション。cookie に載る識別子は毎回違う
    const second = await signIn(auth);
    assert.equal(second.response.status, 200);
    const secondToken = tokenOf(second.cookie);
    assert.notEqual(secondToken, firstToken);
    assert.ok(await auth.api.getSession({ headers: headers(second.cookie) }));

    // すでにセッションの cookie を持った状態でログインしても、その識別子を引き継がない（セッションの固定）
    const third = await signIn(auth, SAMPLE_USER, {
      headers: { cookie: second.cookie },
    });
    assert.equal(third.response.status, 200);
    assert.notEqual(tokenOf(third.cookie), secondToken);
    // ログインは、ほかのセッションを無効にしない（別の端末のログインは続く。Better Auth の既定）
    assert.ok(await auth.api.getSession({ headers: headers(second.cookie) }));
    assert.equal((await db.select().from(session)).length, 2);
  }));

test("パスワード: DB に平文で残らない（account の password は salt:scrypt のハッシュで、全ての表のどの値にも入力した文字列が含まれず、同じパスワードでもハッシュは利用者ごとに違う）", () =>
  withTestDb(async ({ db, client }) => {
    const auth = createTestAuth(db);
    const { password } = SAMPLE_USER;
    const other = { name: "別の人", email: "other@example.com", password };
    await signUp(auth);
    await signUp(auth, other);

    const accounts = await db.select().from(account);
    assert.equal(accounts.length, 2);
    for (const row of accounts) {
      assert.equal(row.providerId, "credential");
      assert.ok(row.password, "ハッシュが入っている");
      assert.notEqual(row.password, password);
      assert.ok(!row.password.includes(password), "入力した文字列を含まない");
      // scrypt: 16 バイトの salt と 64 バイトの鍵の 16 進を ":" でつないだもの
      assert.match(row.password, /^[0-9a-f]{32}:[0-9a-f]{128}$/);
    }
    assert.notEqual(
      accounts[0]!.password,
      accounts[1]!.password,
      "同じパスワードでも、salt が違うのでハッシュは違う",
    );

    // どの表にも、入力したパスワードの文字列は無い（ハッシュの列だけでなく、すべての行・列を文字にして探す）
    const everything = await client.query<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema = 'public'",
    );
    for (const { table_name } of everything.rows) {
      const rows = await client.query(`select * from "${table_name}"`);
      assert.ok(
        !JSON.stringify(rows.rows).includes(password),
        `${table_name} に入力したパスワードが含まれている`,
      );
    }

    // 陽性の対照: このパスワードでログインできる（ハッシュが本物の検証に使われている）
    assert.equal(
      (await signIn(auth, { email: SAMPLE_USER.email, password })).response
        .status,
      200,
    );
    assert.equal(
      (
        await signIn(auth, {
          email: SAMPLE_USER.email,
          password: password + "x",
        })
      ).response.status,
      401,
    );
  }));

test("ログインの失敗: 誤ったパスワードと未登録のメールは、同じ応答（401・INVALID_EMAIL_OR_PASSWORD・同じ文）で、cookie もセッションも作らない", () =>
  withTestDb(async ({ db }) => {
    const auth = createTestAuth(db);
    await signUp(auth);
    const sessionsBefore = (await db.select().from(session)).length;

    const wrongPassword = await signIn(auth, {
      email: SAMPLE_USER.email,
      password: "wrong-password-0000",
    });
    const unknownEmail = await signIn(auth, {
      email: "nobody@example.com",
      password: SAMPLE_USER.password,
    });

    for (const attempt of [wrongPassword, unknownEmail]) {
      assert.equal(attempt.response.status, 401);
      assert.equal(
        setCookies(attempt.response).length,
        0,
        "cookie を発行しない",
      );
    }
    const [a, b] = [
      await errorOf(wrongPassword.response),
      await errorOf(unknownEmail.response),
    ];
    assert.deepEqual(a, b, "どちらが違うかを応答から読み取れない");
    assert.equal(a.code, "INVALID_EMAIL_OR_PASSWORD");
    assert.equal(
      (await db.select().from(session)).length,
      sessionsBefore,
      "セッションを増やさない",
    );
  }));

test("パスワードの長さ: 8 文字未満・128 文字超は登録できず利用者も残らない。8 文字と 128 文字ちょうどは登録できる", () =>
  withTestDb(async ({ db }) => {
    const auth = createTestAuth(db);
    const attempt = (n: number, password: string) =>
      signUp(auth, { name: "n", email: `user${n}@example.com`, password });

    const tooShort = await attempt(1, "a".repeat(MIN_PASSWORD_LENGTH - 1));
    assert.equal(tooShort.response.status, 400);
    assert.equal((await errorOf(tooShort.response)).code, "PASSWORD_TOO_SHORT");
    const tooLong = await attempt(2, "a".repeat(MAX_PASSWORD_LENGTH + 1));
    assert.equal(tooLong.response.status, 400);
    assert.equal((await errorOf(tooLong.response)).code, "PASSWORD_TOO_LONG");
    assert.equal(await countUsers(db), 0, "失敗した登録は利用者を残さない");

    // 文字数は見た目の 1 文字を 1 と数える（日本語のパスワードも 8 文字あれば足りる）
    assert.equal(
      (await attempt(3, "a".repeat(MIN_PASSWORD_LENGTH))).response.status,
      200,
    );
    assert.equal(
      (await attempt(4, "あ".repeat(MIN_PASSWORD_LENGTH))).response.status,
      200,
    );
    assert.equal(
      (await attempt(5, "a".repeat(MAX_PASSWORD_LENGTH))).response.status,
      200,
    );
    assert.equal(await countUsers(db), 3);
    // ログイン側も長すぎるパスワードは調べずに断る（巨大な文字列でハッシュ計算をさせない）
    const huge = await signIn(auth, {
      email: "user3@example.com",
      password: "a".repeat(MAX_PASSWORD_LENGTH + 1),
    });
    assert.equal(huge.response.status, 400);
  }));

test("メールアドレス: 大文字小文字を区別せず一意で、登録済みのメールの再登録は 422（利用者を増やさない）。ログインは大文字小文字を問わない", () =>
  withTestDb(async ({ db }) => {
    const auth = createTestAuth(db);
    await signUp(auth);

    const again = await signUp(auth, {
      ...SAMPLE_USER,
      email: "HANAKO@example.com",
    });
    assert.equal(again.response.status, 422);
    assert.equal(
      (await errorOf(again.response)).code,
      "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL",
    );
    assert.equal(setCookies(again.response).length, 0);
    assert.equal(await countUsers(db), 1);

    const upper = await signIn(auth, {
      email: "HANAKO@EXAMPLE.COM",
      password: SAMPLE_USER.password,
    });
    assert.equal(upper.response.status, 200);

    // メールの形でない値は登録できない
    const invalid = await signUp(auth, {
      ...SAMPLE_USER,
      email: "not-an-email",
    });
    assert.equal(invalid.response.status, 400);
    assert.equal(await countUsers(db), 1);
  }));

test("登録の途中で失敗しても、ログインできない利用者を残さない（user・account・session は 1 つのトランザクション）", () =>
  withTestDb(async ({ db, client }) => {
    const auth = createTestAuth(db);
    // account の行を作れなくする（user を作ったあとの手順で失敗させる）
    await client.exec(
      'alter table "account" add constraint account_always_fails check (false)',
    );

    const failed = await signUp(auth);
    assert.ok(!failed.response.ok, `登録は失敗する: ${failed.response.status}`);
    assert.equal(setCookies(failed.response).length, 0);
    assert.equal(await countUsers(db), 0, "user の行だけが残らない");
    assert.equal((await db.select().from(session)).length, 0);
  }));

// ---------- セッションの期限・延長・改ざん ----------

test("セッションの期限: 期限切れのセッションは無効で、行も消える", () =>
  withTestDb(async ({ db }) => {
    const auth = createTestAuth(db);
    const { cookie } = await signUp(auth);
    const headers = new Headers({ cookie });
    assert.ok(await auth.api.getSession({ headers }));

    await db.update(session).set({ expiresAt: new Date(Date.now() - 1000) });
    assert.equal(await auth.api.getSession({ headers }), null);
    assert.equal(
      (await db.select().from(session)).length,
      0,
      "期限切れの行は消える",
    );
  }));

test("セッションの延長: 最後の更新から 1 日以上たってから /api/auth/get-session を通ったときだけ、期限を 7 日先に延ばして cookie も更新する。viewer の取得では延ばさない", () =>
  withTestDb(async ({ db }) => {
    const auth = createTestAuth(db);
    const { cookie } = await signUp(auth);
    const days = (n: number) => new Date(Date.now() + n * 24 * 60 * 60 * 1000);
    const expiresAt = async () =>
      (await db.select().from(session))[0]!.expiresAt;
    const getSession = () =>
      auth.handler(authRequest("/get-session", { headers: { cookie } }));

    // 更新から 1 日たっていない（残り 6.5 日）: 延ばさず、cookie も更新しない
    const fresh = days(6.5);
    await db.update(session).set({ expiresAt: fresh });
    const untouched = await getSession();
    assert.equal(untouched.status, 200);
    assert.equal((await expiresAt()).getTime(), fresh.getTime());
    assert.equal(findSetCookie(untouched, SESSION_COOKIE), undefined);

    // 更新から 2 日たった（残り 5 日）。viewer の取得（disableRefresh）は、使えるが延ばさない
    const stale = days(5);
    await db.update(session).set({ expiresAt: stale });
    const viewer = await viewerFromHeaders(
      async () => auth,
      new Headers({ cookie }),
    );
    assert.equal(viewer?.email, SAMPLE_USER.email);
    assert.equal(
      (await expiresAt()).getTime(),
      stale.getTime(),
      "viewer の取得では延ばさない",
    );

    // /get-session を通ると、7 日先に延び、cookie の期限も 7 日に更新される
    const refreshed = await getSession();
    assert.equal(refreshed.status, 200);
    assert.ok(
      Math.abs((await expiresAt()).getTime() - days(7).getTime()) < 60_000,
      "期限が 7 日先に延びる",
    );
    const line = findSetCookie(refreshed, SESSION_COOKIE);
    assert.match(
      line ?? "",
      new RegExp(`Max-Age=${SESSION_EXPIRES_IN_SECONDS}`),
    );
  }));

test("cookie の改ざん: 署名が合わない・別の秘密で署名した・識別子だけ・存在しない識別子の cookie では、ログインできない", () =>
  withTestDb(async ({ db }) => {
    const auth = createTestAuth(db);
    const { cookie } = await signUp(auth);
    const headers = (value: string) => new Headers({ cookie: value });
    assert.ok(await auth.api.getSession({ headers: headers(cookie) }));

    const [name, value = ""] = cookie.split("=") as [string, string];
    const decoded = decodeURIComponent(value);
    const token = decoded.split(".")[0]!;
    const signature = decoded.split(".")[1]!;
    const forged = [
      // 署名の 1 文字を変える
      `${name}=${encodeURIComponent(`${token}.${signature.slice(0, -2)}AA`)}`,
      // 署名なし（識別子だけ。DB に実在する識別子でも通らない）
      `${name}=${token}`,
      `${name}=${encodeURIComponent(`${token}.`)}`,
      // 存在しない識別子
      `${name}=${encodeURIComponent(`${"x".repeat(32)}.${signature}`)}`,
      // 空
      `${name}=`,
    ];
    for (const cookieValue of forged) {
      assert.equal(
        await auth.api.getSession({ headers: headers(cookieValue) }),
        null,
        cookieValue,
      );
    }

    // 別の秘密で署名された cookie（同じ識別子）は通らない
    const other = createTestAuth(db, {
      secret: "another-secret-0123456789abcdef0123456789",
    });
    const otherCookie = (await signIn(other)).cookie;
    assert.equal(
      await auth.api.getSession({ headers: headers(otherCookie) }),
      null,
    );
  }));

// ---------- cookie の Secure・プレビューの URL ----------

test("cookie（https の URL）: Secure と __Secure- の接頭辞が付き、その cookie でセッションが取れる", () =>
  withTestDb(async ({ db }) => {
    const origin = "https://shop.example";
    const auth = createTestAuth(db, { baseURL: origin });
    const { response, cookie } = await signUp(auth, SAMPLE_USER, {
      base: origin,
    });
    assert.equal(response.status, 200);
    const line = findSetCookie(response, SESSION_COOKIE);
    assert.ok(line?.startsWith(`__Secure-${SESSION_COOKIE}=`), line);
    assert.ok(
      line
        ?.split(";")
        .map((a) => a.trim())
        .includes("Secure"),
      line,
    );
    assert.ok(await auth.api.getSession({ headers: new Headers({ cookie }) }));
  }));

test("送信元の検査（CSRF）: 自サイト以外の Origin からの POST は 403。cross-site の画面遷移でのログインも拒む。Origin の無い要求（ブラウザ以外）は通る", () =>
  withTestDb(async ({ db }) => {
    const auth = createTestAuth(db);
    const { cookie } = await signUp(auth);
    const body = { email: SAMPLE_USER.email, password: SAMPLE_USER.password };
    const post = (path: string, init: Parameters<typeof authRequest>[1]) =>
      auth.handler(authRequest(path, { method: "POST", ...init }));

    // 別のサイトの画面から、利用者の知らないうちにログインさせる（ログイン CSRF）
    const evil = await post("/sign-in/email", {
      body,
      origin: "https://evil.example",
    });
    assert.equal(evil.status, 403);
    assert.equal((await errorOf(evil)).code, "INVALID_ORIGIN");
    assert.equal(setCookies(evil).length, 0);

    // Fetch Metadata: cross-site からの画面遷移（フォーム送信）は、Origin が無くても断る
    const navigate = await post("/sign-in/email", {
      body,
      origin: null,
      headers: { "sec-fetch-site": "cross-site", "sec-fetch-mode": "navigate" },
    });
    assert.equal(navigate.status, 403);
    assert.equal(
      (await errorOf(navigate)).code,
      "CROSS_SITE_NAVIGATION_LOGIN_BLOCKED",
    );

    // ログイン中（cookie あり）の要求は、別の Origin ならログアウトさせられない
    const logoutFromEvil = await post("/sign-out", {
      body: {},
      origin: "https://evil.example",
      headers: { cookie },
    });
    assert.equal(logoutFromEvil.status, 403);
    assert.equal(
      (await db.select().from(session)).length,
      1,
      "セッションは消えない",
    );

    // ログイン後の行き先（callbackURL）も、自サイトのパスだけ
    const external = await post("/sign-in/email", {
      body: { ...body, callbackURL: "https://evil.example/phish" },
    });
    assert.equal(external.status, 403);
    assert.equal((await errorOf(external)).code, "INVALID_CALLBACK_URL");
    const relative = await post("/sign-in/email", {
      body: { ...body, callbackURL: "/account" },
    });
    assert.equal(relative.status, 200);

    // 自サイトの Origin・Origin も Fetch Metadata も無い要求（curl など。cookie を勝手に送られる心配が無い）は通る
    assert.equal((await post("/sign-in/email", { body })).status, 200);
    assert.equal(
      (await post("/sign-in/email", { body, origin: null })).status,
      200,
    );
  }));

test("BETTER_AUTH_URL が無いとき（プレビュー環境）は、リクエスト自身のオリジンだけを信用し、ほかのオリジンは断る。ある場合は、別のホストからの要求を断る", () =>
  withTestDb(async ({ db }) => {
    const preview = "https://shop-git-feature-x.vercel.app";
    const noBase = createTestAuth(db, { baseURL: undefined });
    // 自分自身のオリジン: 登録・ログインできる
    const own = await signUp(noBase, SAMPLE_USER, { base: preview });
    assert.equal(own.response.status, 200);
    // 別のオリジン（本番のドメインや攻撃者のサイト）からの要求は断る
    const foreign = await signIn(noBase, SAMPLE_USER, {
      base: preview,
      origin: "https://evil.example",
    });
    assert.equal(foreign.response.status, 403);

    // BETTER_AUTH_URL がある: そのオリジンだけを信用する（プレビューの URL からの要求は断られる）
    const pinned = createTestAuth(db, { baseURL: "https://shop.example" });
    const fromPreview = await signIn(pinned, SAMPLE_USER, {
      base: "https://shop.example",
      origin: preview,
    });
    assert.equal(fromPreview.response.status, 403);
    assert.equal(
      (await signIn(pinned, SAMPLE_USER, { base: "https://shop.example" }))
        .response.status,
      200,
    );
  }));

// ---------- 試行回数の制限 ----------

test("試行回数の制限: ログインは同じ IP から 10 秒に 3 回まで（4 回目は 429 で、正しいパスワードでも通らない）。IP ごとに数える", () =>
  withTestDb(async ({ db }) => {
    const auth = createTestAuth(db, { rateLimit: true });
    await signUp(auth, SAMPLE_USER, {
      headers: { "x-forwarded-for": "203.0.113.1" },
    });
    const wrong = { email: SAMPLE_USER.email, password: "wrong-password-0000" };
    const from = (ip: string, credentials = wrong) =>
      signIn(auth, credentials, { headers: { "x-forwarded-for": ip } });

    // 同じ IP: 3 回は通常どおり 401。4 回目は 429（Retry-After つき）
    for (let n = 0; n < 3; n++)
      assert.equal((await from("198.51.100.7")).response.status, 401);
    const limited = await from("198.51.100.7");
    assert.equal(limited.response.status, 429);
    assert.ok(Number(limited.response.headers.get("x-retry-after")) > 0);
    // 制限中は、正しいパスワードでも通らない（総当たりで当たりを引かせない）
    const correct = await from("198.51.100.7", SAMPLE_USER);
    assert.equal(correct.response.status, 429);
    assert.equal(setCookies(correct.response).length, 0);

    // 別の IP は数え直し
    assert.equal(
      (await from("198.51.100.8", SAMPLE_USER)).response.status,
      200,
    );
  }));

test("試行回数の制限: 既定では本番（NODE_ENV=production）だけ有効で、それ以外（開発・テスト）では制限しない", () =>
  withTestDb(async ({ db }) => {
    const auth = createTestAuth(db);
    await signUp(auth);
    const wrong = { email: SAMPLE_USER.email, password: "wrong-password-0000" };
    for (let n = 0; n < 6; n++) {
      const { response } = await signIn(auth, wrong, {
        headers: { "x-forwarded-for": "198.51.100.9" },
      });
      assert.equal(response.status, 401, `${n + 1} 回目`);
    }
  }));

// ---------- 表と DB の整合 ----------

test("利用者を消すと、そのセッションと口座も消える（外部キーの cascade）", () =>
  withTestDb(async ({ db }) => {
    const auth = createTestAuth(db);
    await signUp(auth);
    await signUp(auth, {
      name: "別の人",
      email: "other@example.com",
      password: SAMPLE_USER.password,
    });
    assert.equal((await db.select().from(session)).length, 2);

    await db.delete(user).where(eq(user.email, SAMPLE_USER.email));
    assert.equal((await db.select().from(user)).length, 1);
    assert.equal((await db.select().from(session)).length, 1);
    assert.equal((await db.select().from(account)).length, 1);
    assert.equal((await db.select().from(verification)).length, 0);
  }));

test("認証の URL: Better Auth は /api/auth/* だけを受け、それ以外のパスは 404", () =>
  withTestDb(async ({ db }) => {
    const auth = createTestAuth(db);
    const miss = await auth.handler(new Request(`${TEST_ORIGIN}/api/other`));
    assert.equal(miss.status, 404);
    // パスワードの再設定・メールの確認は付けていないので、その入口は使えない
    for (const path of [
      "/request-password-reset",
      "/send-verification-email",
      "/reset-password",
    ]) {
      const response = await auth.handler(
        authRequest(path, {
          method: "POST",
          body: { email: SAMPLE_USER.email },
        }),
      );
      assert.ok(response.status >= 400, `${path}: ${response.status}`);
    }
  }));
