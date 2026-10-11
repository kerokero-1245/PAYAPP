// 構造化ログ（lib/log.ts）のテスト。実行: npm test
//
// なぜあるか: ログに出す出来事は、1 行 1 JSON の「名前 + 識別子」だけにして、例外の本体（Drizzle の例外は SQL の引数を持つ）や
// 利用者の値を書かない。logEvent と describeError がその約束を守ることを固定する。
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MAX_LOG_STRING_LENGTH,
  describeError,
  firstLine,
  logEvent,
} from "../lib/log.ts";
import { captureConsole } from "./support/console.ts";

test("logEvent: 1 行の JSON にして、level に合わせた console に出す。undefined の項目は出さず、level と event は上書きさせない", () => {
  const capture = captureConsole();
  try {
    logEvent("info", "a.info", { sessionId: "cs_test_1", count: 2, ok: true });
    logEvent("warn", "a.warn", { note: null, skipped: undefined });
    logEvent("error", "a.error", { level: "info", event: "forged" });
  } finally {
    capture.restore();
  }
  assert.deepEqual(
    capture.lines.map((line) => line.name),
    ["log", "warn", "error"],
  );
  assert.deepEqual(capture.events(), [
    {
      level: "info",
      event: "a.info",
      sessionId: "cs_test_1",
      count: 2,
      ok: true,
    },
    { level: "warn", event: "a.warn", note: null },
    { level: "error", event: "a.error" },
  ]);
  for (const line of capture.lines) assert.ok(!line.text.includes("\n"));
});

test("logEvent: 長い文字列の値は上限の長さで切る（外から来る文でログを埋められない）。firstLine は先頭 1 行だけを返す", () => {
  const capture = captureConsole();
  try {
    logEvent("info", "a.long", { origin: "x".repeat(10_000) });
  } finally {
    capture.restore();
  }
  const [entry] = capture.events();
  assert.equal(entry?.origin, `${"x".repeat(MAX_LOG_STRING_LENGTH)}…`);

  assert.equal(firstLine("one\ntwo\nthree"), "one");
  assert.equal(firstLine(""), "");
  assert.equal(firstLine("y".repeat(500)).length, MAX_LOG_STRING_LENGTH + 1);
});

test("describeError: 例外の名前とコード（cause をたどった SQLSTATE を含む）だけを返し、message・SQL の引数・スタックは返さない", () => {
  const dbError = Object.assign(
    new Error('Failed query: insert into "user"\nparams: a@example.com,hash'),
    {
      query: 'insert into "user"',
      params: ["a@example.com", "hash"],
      cause: Object.assign(new Error("new row violates check"), {
        code: "23514",
      }),
    },
  );
  assert.deepEqual(describeError(dbError), {
    errorName: "Error",
    errorCode: "23514",
  });
  assert.ok(!JSON.stringify(describeError(dbError)).includes("a@example.com"));

  // Node のシステムエラーのコード
  assert.deepEqual(
    describeError(
      Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:5432"), {
        code: "ECONNREFUSED",
      }),
    ),
    { errorName: "Error", errorCode: "ECONNREFUSED" },
  );
  // 名前・コードとして出せない形（空白や記号を含む）は捨てる
  assert.deepEqual(
    describeError(
      Object.assign(new Error("x"), { name: "bad name!", code: "a b; drop" }),
    ),
    { errorName: undefined, errorCode: undefined },
  );
  // 例外でない値は型の名前だけ
  assert.deepEqual(describeError("a@example.com"), { errorType: "string" });
  assert.deepEqual(describeError(null), { errorType: "null" });
  assert.deepEqual(describeError(undefined), { errorType: "undefined" });
});
