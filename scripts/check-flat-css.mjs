// 平坦な CSS の検査。実行: npm run check:css（= node scripts/check-flat-css.mjs app components）
//
// なぜあるか: ページごとに Tailwind の見た目クラスを直書きし、`!` 接尾辞（= !important）や
// group-hover・space-y（子孫・子セレクタを生む）で上書きを重ねた結果、同じ部品の見た目が
// ページごとにずれていた。部品の見た目は app/styles/components/*.css の単一クラスの足し算で表し、
// 上書きの連鎖を作る書き方をここで機械的に止める。
// また、Tailwind の hover: は @media (hover: hover) の中に出るが、部品 CSS へ移した :hover が素のまま
// だったため、タッチ端末でタップした後に hover の色が残った（数量の + が金色のまま）。
//
// 検査すること
//  .css:
//    入れ子のスタイル規則 / 規則の中の @media など / 子孫・子・兄弟の結合子（:is() :where() :has() :not()
//    の中も見る）/ & / ID セレクタ / :deep / !important / @apply /
//    @layer components の中で @media (hover: hover) の外にある :hover
//  .js .jsx .ts .tsx .mjs（コメントを除いた本文）:
//    !important / :deep / Tailwind の ! 接尾辞・接頭辞（ハイフンの無い uppercase! !italic も）/
//    group-*: peer-*:（group-hover/card: のような名前付きも）/ *: **: in-*: has-*:（子・子孫の変種）/
//    space-x・space-y / divide- / 任意値 [...] / 変数の省略記法 bg-(--x) / 任意の変種 [&…]: /
//    禁止の接頭辞で終わる文字列の組み立て（"space-" + …、`group-${…}`）/ style 属性の直書き
//  対象ファイルが 0 件なら失敗（検査が空振りして green になるのを防ぐ）
//
// 穴（見つけられないもの）:
//  - 禁止の接頭辞の途中で切った組み立て（"spa" + "ce-y-2"）や、変数に入れたクラス名の組み立て
//  - ページの className に書いた色・文字などの見た目のユーティリティ（text-cream など）そのもの
//  - 文字列の中の英文で ! が語の直後に来るもの（"wow!"）は ! 接尾辞として誤検出する（今の app と components には無い）
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

/** 括弧の外にあるカンマで分ける */
function splitTop(s) {
  const parts = [];
  let depth = 0;
  let cur = "";
  for (const c of s) {
    if (c === "(") depth++;
    else if (c === ")") depth--;
    if (c === "," && depth === 0) {
      parts.push(cur);
      cur = "";
    } else cur += c;
  }
  parts.push(cur);
  return parts;
}

/** 選択子 1 つ（カンマ区切りの 1 項）に結合子があるか。:is() :where() :has() :not() の中も見る */
function hasCombinator(sel) {
  const s = sel.trim().replace(/\[[^\]]*\]/g, "[]");
  // 論理の擬似クラスの中身を取り出して、項ごとに同じ検査をする
  const LOGICAL = /:(is|where|has|not|matches)\(/g;
  let m;
  while ((m = LOGICAL.exec(s))) {
    let depth = 1;
    let j = m.index + m[0].length;
    const start = j;
    for (; j < s.length && depth > 0; j++) {
      if (s[j] === "(") depth++;
      else if (s[j] === ")") depth--;
    }
    const inner = s.slice(start, j - 1);
    if (splitTop(inner).some((p) => /^\s*[>+~]/.test(p) || hasCombinator(p))) return true;
  }
  // 外側: 括弧の中身は見ない（:nth-child(2n + 1) の + を結合子と取らない）
  let outer = s;
  let prev;
  do {
    prev = outer;
    outer = outer.replace(/\([^()]*\)/g, "()");
  } while (outer !== prev);
  return /\S\s+\S|[>+~]/.test(outer);
}

for (const f of cssFiles) {
  const src = fs.readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, blank);
  for (const m of src.matchAll(/!important|@apply\b|:deep\b/g)) {
    bad.push(`${f}:${lineOf(src, m.index)} ${m[0]}`);
  }
  const stack = []; // { kind: "style" | "group" | "keyframes" | "other", prelude }
  const kinds = () => stack.map((e) => e.kind);
  let start = 0;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === "{") {
      const prelude = src.slice(start, i).split(";").pop().trim();
      const at = `${f}:${lineOf(src, i)}`;
      let kind;
      if (kinds().includes("keyframes")) kind = "other";
      else if (/^@keyframes\b/.test(prelude)) kind = "keyframes";
      else if (GROUP_AT.test(prelude)) kind = "group";
      else if (prelude.startsWith("@")) kind = "other";
      else kind = "style";
      if (kind !== "style" && kinds().includes("style")) bad.push(`${at} 規則の中の @規則: ${prelude}`);
      if (kind === "style") {
        if (kinds().includes("style")) bad.push(`${at} 入れ子: ${prelude}`);
        if (prelude.includes("&")) bad.push(`${at} &: ${prelude}`);
        for (const sel of splitTop(prelude)) {
          if (hasCombinator(sel)) bad.push(`${at} 結合子: ${sel.trim()}`);
          if (sel.replace(/\[[^\]]*\]/g, "[]").includes("#")) bad.push(`${at} ID セレクタ: ${sel.trim()}`);
        }
        const inComponents = stack.some((e) => /^@layer\s+components\b/.test(e.prelude));
        const inHoverMedia = stack.some((e) => /^@media\b.*\(\s*hover\s*:\s*hover\s*\)/.test(e.prelude));
        if (/:hover\b/.test(prelude) && inComponents && !inHoverMedia) {
          bad.push(`${at} @media (hover: hover) の外の :hover: ${prelude}`);
        }
      }
      stack.push({ kind, prelude });
      start = i + 1;
    } else if (c === "}") {
      stack.pop();
      start = i + 1;
    }
  }
}

// クラス名の区切り（空白・引用符・バッククォート・波括弧）の直後から始まる語だけを見る
const D = "(?<=^|[\\s\"'`{}])";
const V = "(?:[a-z0-9-]+:)*"; // 前に付く変種（md: hover: など）
const JS_RULES = [
  [/!important/g, "!important"],
  [/:deep\b/g, ":deep"],
  [new RegExp(`${D}[a-z][a-z0-9:./%\\[\\]-]*-[a-z0-9./%\\[\\]-]*!(?=$|[\\s"'\`])`, "gm"), "Tailwind の ! 接尾辞"],
  [new RegExp(`${D}![a-z][a-z0-9]*-[a-z0-9./%-]+(?=$|[\\s"'\`])`, "gm"), "Tailwind の ! 接頭辞"],
  [new RegExp(`${D}${V}(?:group|peer)-[a-z-]+(?:/[a-z0-9_-]+)?:`, "gm"), "group-*/peer-*（子孫・兄弟セレクタ）"],
  [new RegExp(`${D}${V}(?:\\*\\*?|in-[a-z0-9-]+|has-[a-z0-9-]+):`, "gm"), "*: / in-*: / has-*:（子・子孫セレクタ）"],
  [new RegExp(`${D}${V}-?space-[xy]-`, "gm"), "space-x/space-y（子セレクタ）"],
  [new RegExp(`${D}${V}divide-`, "gm"), "divide-（子セレクタ）"],
  [new RegExp(`${D}${V}-?[a-z][a-z0-9-]*-\\[[^\\]\\s]+\\]`, "gm"), "任意値 [...]"],
  [new RegExp(`${D}${V}-?[a-z][a-z0-9-]*-\\((?:[a-z-]+:)?--[a-z0-9-]+\\)`, "gm"), "任意値（変数の省略記法 -(--x)）"],
  // [&>*]: や [@media…]: の形だけを見る（JS の計算されたキー { [field]: v } は対象外）
  [new RegExp(`${D}\\[[&@][^\\]\\s]*\\]:`, "gm"), "任意の変種 [&…]:"],
  [/\bstyle=\{/g, "style 属性の直書き"],
];

/** 文字列リテラルの中の語ごとの検査（コードの !x を ! 接頭辞と取らないよう、文字列の中だけを見る） */
const STRING_RE = /"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g;
const TOKEN_RULES = [
  [/^![a-z][a-z0-9-]*$/, "Tailwind の ! 接頭辞"],
  [/^(?:[a-z0-9-]+:)*-?[a-z][a-z0-9-]*!$/, "Tailwind の ! 接尾辞"],
];
const BUILT_PREFIX = /(?:^|[\s"'`])(?:[a-z0-9-]+:)*-?(?:space|divide|group|peer)(?:-[a-z]*)?-?$/;

for (const f of jsFiles) {
  const src = fs
    .readFileSync(f, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, (m, p1) => p1 + blank(m.slice(p1.length)));
  for (const [re, label] of JS_RULES) {
    for (const m of src.matchAll(re)) {
      bad.push(`${f}:${lineOf(src, m.index)} ${label}: ${m[0]}`);
    }
  }
  for (const m of src.matchAll(STRING_RE)) {
    const body = m[0].slice(1, -1);
    const line = lineOf(src, m.index);
    // テンプレートの ${…} の中はコードなので語の検査から外す
    const text = m[0][0] === "`" ? body.replace(/\$\{[^}]*\}/g, " ") : body;
    for (const tok of text.split(/\s+/).filter(Boolean)) {
      for (const [re, label] of TOKEN_RULES) if (re.test(tok)) bad.push(`${f}:${line} ${label}: ${tok}`);
    }
    // 組み立て: "space-" + …（文字列の末尾）/ `space-${…}`（${ の直前）
    const tails = m[0][0] === "`" ? body.split(/\$\{[^}]*\}/).slice(0, -1) : [];
    const followedByPlus = /^\s*\+/.test(src.slice(m.index + m[0].length));
    if (followedByPlus) tails.push(body);
    for (const t of tails) {
      if (BUILT_PREFIX.test(t)) bad.push(`${f}:${line} 文字列の組み立て（禁止の接頭辞）: ${m[0].slice(0, 40)}`);
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
