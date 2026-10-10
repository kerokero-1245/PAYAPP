// 平坦な CSS の検査（scripts/check-flat-css.mjs）が、合格の見本を通し、違反の見本を 1 本ずつ落とすことを確かめる。
// なぜあるか: 検査が穴だらけでも green になっていた（:is() の中の結合子・規則の中の @media・ハイフンの無い
// uppercase! など 10 種を通していた）。さらに @media (hover: hover) の外の :hover でタッチ端末に色が残った。
// 見本: tests/fixtures/flat-css/ok/（合格）と bad/（1 ファイル 1 違反。先頭のコメント「expect: …」が出るはずの文言）
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = path.join(ROOT, "scripts/check-flat-css.mjs");
const FIX = path.join(ROOT, "tests/fixtures/flat-css");
const OK_DIR = path.join(FIX, "ok");
const BAD_DIR = path.join(FIX, "bad");

const run = (...dirs) => spawnSync(process.execPath, [SCRIPT, ...dirs], { encoding: "utf8" });

/** 合格の見本 + 違反の見本 1 本を一時ディレクトリに並べる（検査は .css と JS の両方が無いと失敗するため） */
function withBad(file) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "flat-css-"));
  for (const f of fs.readdirSync(OK_DIR)) fs.copyFileSync(path.join(OK_DIR, f), path.join(dir, f));
  fs.copyFileSync(path.join(BAD_DIR, file), path.join(dir, file));
  return dir;
}

const badFiles = fs.readdirSync(BAD_DIR).filter((f) => /\.(css|js)$/.test(f)).sort();

test("違反の見本が 1 本以上ある（見本が空で green にならない）", () => {
  assert.ok(badFiles.length >= 20, `bad の見本が ${badFiles.length} 本`);
});

test("合格の見本は exit 0", () => {
  const r = run(OK_DIR);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /check-flat-css: OK/);
});

test("対象が無いディレクトリは exit 1（空振りで green にしない）", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "flat-css-empty-"));
  try {
    assert.equal(run(dir).status, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

for (const file of badFiles) {
  test(`違反の見本 ${file} は exit 1 で、その違反を名指しする`, () => {
    const expect = fs.readFileSync(path.join(BAD_DIR, file), "utf8").match(/expect: (.+?)\s*(?:\*\/)?$/m)?.[1];
    assert.ok(expect, `${file} の先頭に expect: が無い`);
    const dir = withBad(file);
    try {
      const r = run(dir);
      assert.equal(r.status, 1, r.stdout + r.stderr);
      const lines = r.stdout.split("\n").filter((l) => l.includes(`${path.sep}${file}:`));
      assert.ok(lines.some((l) => l.includes(expect)), `「${expect}」が出ない:\n${r.stdout}`);
      // 合格の見本の側は名指しされない
      assert.ok(!/ok\.(css|js):/.test(r.stdout), r.stdout);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
}

test("app と components は違反 0", () => {
  const r = spawnSync(process.execPath, [SCRIPT, "app", "components"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});
