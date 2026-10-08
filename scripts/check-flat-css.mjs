// 平坦な CSS の検査。実行: npm run check:css（= node scripts/check-flat-css.mjs app components）
//
// なぜあるか: ページごとに Tailwind の見た目クラスを直書きし、`!` 接尾辞（= !important）や
// group-hover・space-y（子孫・子セレクタを生む）で上書きを重ねた結果、同じ部品の見た目が
// ページごとにずれていた。部品の見た目は app/styles/components/*.css の単一クラスの足し算で表し、
// 上書きの連鎖を作る書き方をここで機械的に止める。
//
// 検査すること
//  .css: 入れ子のスタイル規則 / 子孫・子・兄弟の結合子 / & / ID セレクタ / :deep / !important / @apply
//  .js .jsx .ts .tsx（コメントを除いた本文）: !important / :deep / Tailwind の ! 接尾辞・接頭辞 /
//    group-*: peer-*: / space-x・space-y / divide- / 任意値 [...]
//  対象ファイルが 0 件なら失敗（検査が空振りして green になるのを防ぐ）
//
// 穴: 文字列を組み立ててクラス名を作る書き方（"space-" + "y-2" など）は見つけられない。
import fs from "node:fs";
import path from "node:path";

const GROUP_AT = /^@(layer|media|supports|container|theme)\b/;
const CSS_EXT = /\.css$/;
const JS_EXT = /\.(js|jsx|ts|tsx|mjs)$/;

const dirs = process.argv.slice(2);
if (dirs.length === 0) {
  console.error("usage: node scripts/check-flat-css.mjs <dir...>");
  process.exit(2);
}

const cssFiles = [];
const jsFiles = [];
function walk(d) {
  if (!fs.existsSync(d)) return;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) {
      if (e.name !== "node_modules" && e.name !== ".next" && e.name !== "__generated__") walk(p);
    } else if (CSS_EXT.test(e.name)) cssFiles.push(p);
    else if (JS_EXT.test(e.name)) jsFiles.push(p);
  }
}
for (const d of dirs) walk(d);

if (cssFiles.length === 0 || jsFiles.length === 0) {
  console.error(`check-flat-css: 対象が足りません（.css ${cssFiles.length} 件 / JS ${jsFiles.length} 件）`);
  process.exit(1);
}

/** コメントを同じ長さの空白に置き換える（行番号を保つ） */
const blank = (m) => m.replace(/[^\n]/g, " ");

const bad = [];
const lineOf = (src, i) => src.slice(0, i).split("\n").length;

for (const f of cssFiles) {
  const src = fs.readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, blank);
  for (const m of src.matchAll(/!important|@apply\b|:deep\b/g)) {
    bad.push(`${f}:${lineOf(src, m.index)} ${m[0]}`);
  }
  const stack = []; // "style" | "group" | "keyframes" | "other"
  let start = 0;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === "{") {
      const prelude = src.slice(start, i).split(";").pop().trim();
      let kind;
      if (stack.includes("keyframes")) kind = "other";
      else if (/^@keyframes\b/.test(prelude)) kind = "keyframes";
      else if (GROUP_AT.test(prelude)) kind = "group";
      else if (prelude.startsWith("@")) kind = "other";
      else {
        kind = "style";
        const at = `${f}:${lineOf(src, i)}`;
        if (stack.includes("style")) bad.push(`${at} 入れ子: ${prelude}`);
        if (prelude.includes("&")) bad.push(`${at} &: ${prelude}`);
        for (const sel of prelude.split(",")) {
          let s = sel.trim();
          // 括弧と属性の中身は見ない（:where(a, b) / [data-x="a b"]）
          let prev;
          do {
            prev = s;
            s = s.replace(/\([^()]*\)/g, "()");
          } while (s !== prev);
          s = s.replace(/\[[^\]]*\]/g, "[]");
          if (/\S\s+\S|[>+~]/.test(s)) bad.push(`${at} 結合子: ${sel.trim()}`);
          if (s.includes("#")) bad.push(`${at} ID セレクタ: ${sel.trim()}`);
        }
      }
      stack.push(kind);
      start = i + 1;
    } else if (c === "}") {
      stack.pop();
      start = i + 1;
    }
  }
}

// クラス名の区切り（空白・引用符・バッククォート・波括弧）の直後から始まる語だけを見る
const D = "(?<=^|[\\s\"'`{}])";
const JS_RULES = [
  [/!important/g, "!important"],
  [/:deep\b/g, ":deep"],
  [new RegExp(`${D}[a-z][a-z0-9:./%\\[\\]-]*-[a-z0-9./%\\[\\]-]*!(?=$|[\\s"'\`])`, "gm"), "Tailwind の ! 接尾辞"],
  [new RegExp(`${D}![a-z][a-z0-9]*-[a-z0-9./%-]+(?=$|[\\s"'\`])`, "gm"), "Tailwind の ! 接頭辞"],
  [new RegExp(`${D}(?:[a-z0-9-]+:)*(?:group|peer)-[a-z-]+:`, "gm"), "group-*/peer-*（子孫・兄弟セレクタ）"],
  [new RegExp(`${D}(?:[a-z0-9-]+:)*-?space-[xy]-`, "gm"), "space-x/space-y（子セレクタ）"],
  [new RegExp(`${D}(?:[a-z0-9-]+:)*divide-`, "gm"), "divide-（子セレクタ）"],
  [new RegExp(`${D}(?:[a-z0-9-]+:)*-?[a-z][a-z0-9-]*-\\[[^\\]\\s]+\\]`, "gm"), "任意値 [...]"],
  // [&>*]: や [@media…]: の形だけを見る（JS の計算されたキー { [field]: v } は対象外）
  [new RegExp(`${D}\\[[&@][^\\]\\s]*\\]:`, "gm"), "任意の変種 [&…]:"],
];

for (const f of jsFiles) {
  const src = fs
    .readFileSync(f, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/(^|[^:"'`])\/\/[^\n]*/g, (m, p1) => p1 + blank(m.slice(p1.length)));
  for (const [re, label] of JS_RULES) {
    for (const m of src.matchAll(re)) {
      bad.push(`${f}:${lineOf(src, m.index)} ${label}: ${m[0]}`);
    }
  }
}

const summary = `.css ${cssFiles.length} 件 / JS ${jsFiles.length} 件`;
if (bad.length) {
  console.log(bad.join("\n"));
  console.log(`check-flat-css: ${bad.length} 件の違反（${summary}）`);
  process.exit(1);
}
console.log(`check-flat-css: OK（${summary}）`);
