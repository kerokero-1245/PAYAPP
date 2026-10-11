// 日付と金額の整形（lib/format.ts）のテスト。実行: npm test
//
// なぜあるか: 注文履歴 /orders は、サーバ（Vercel は UTC で動く）で日付を整える。サーバの時間帯で整えると、
// 日本時間の早朝に買った注文が前の日の日付で出る（日本時間の 0 時〜9 時は UTC では前の日）。
// 日付は、動く環境の時間帯によらず日本時間で整える。
import assert from "node:assert/strict";
import { test } from "node:test";

import { formatDate, formatYen } from "../lib/format.ts";

/** 環境の時間帯（TZ）を一時的に変えて run を実行する（Node は実行中の TZ の変更を Date と Intl に反映する） */
function inTimeZone<T>(timeZone: string, run: () => T): T {
  const saved = process.env.TZ;
  process.env.TZ = timeZone;
  try {
    return run();
  } finally {
    if (saved === undefined) delete process.env.TZ;
    else process.env.TZ = saved;
  }
}

/** [UTC の時刻, 日本時間の日付] */
const CASES: [string, string][] = [
  // 日本時間の昼
  ["2026-03-20T03:00:00.000Z", "2026年3月20日"],
  // UTC では 10/11 の 23:00 = 日本時間では 10/12 の 8:00
  ["2026-10-11T23:00:00.000Z", "2026年10月12日"],
  // UTC の 14:59:59 までは日本でも同じ日、15:00:00 から翌日
  ["2026-10-11T14:59:59.999Z", "2026年10月11日"],
  ["2026-10-11T15:00:00.000Z", "2026年10月12日"],
  // 年またぎ
  ["2025-12-31T15:00:00.000Z", "2026年1月1日"],
];

test("formatDate: 日本時間の日付で整える。UTC の 15:00 以降は日本では翌日で、環境の時間帯（UTC・米国・日本・ニュージーランド）に左右されない", () => {
  for (const timeZone of [
    "UTC",
    "America/Los_Angeles",
    "Asia/Tokyo",
    "Pacific/Auckland",
  ]) {
    for (const [iso, expected] of CASES) {
      assert.equal(
        inTimeZone(timeZone, () => formatDate(iso)),
        expected,
        `${iso}（環境の時間帯: ${timeZone}）`,
      );
    }
  }
});

test("formatDate: 日付として読めない値は「—」", () => {
  for (const bad of ["", "not a date", "2026-13-40"]) {
    assert.equal(formatDate(bad), "—", bad);
  }
});

test("formatYen: 円の表記（桁区切りつき。数でない値は 0）", () => {
  assert.equal(formatYen(248000), "¥248,000");
  assert.equal(formatYen(0), "¥0");
  assert.equal(formatYen(Number.NaN), "¥0");
});
