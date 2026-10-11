/**
 * ログイン後の行き先（?next=）の検査と、認証ページへのリンクの組み立て（純粋な関数）
 * ---------------------------------------------------
 * ログインが要るページ（/account・/orders）は、未ログインの人を /login?next=<そのページ> に転送する。ログインしたら next に戻す。
 * next は URL に書ける値（誰でも作れる）なので、そのまま移動先にすると、
 * 「https://evil.example/login?next=//evil.example」のような URL を踏ませて、ログインした直後に別のサイトへ飛ばせてしまう（オープンリダイレクト）。
 * safeNextPath は自サイトの中のパスだけを通し、それ以外は既定の行き先に落とす。
 */

export const LOGIN_PATH = "/login";
export const SIGNUP_PATH = "/signup";
export const ACCOUNT_PATH = "/account";
export const ORDERS_PATH = "/orders";

/** next が無い・安全でないときの行き先 */
export const DEFAULT_NEXT_PATH = ACCOUNT_PATH;

/** 受け付ける長さの上限（URL を長くして遊ばせない。通常のパスは数十文字） */
const MAX_NEXT_LENGTH = 2048;

/**
 * 制御文字と \ を含む値は通さない。
 * URL の解析は改行・タブを黙って取り除く（"/\t/evil.example" は "//evil.example" になる）ので、解析の前に弾く。
 * ブラウザは \ を / として扱う（"/\evil.example" は "//evil.example" と同じ）。
 */
const FORBIDDEN_CHARS = /[\u0000-\u001f\u007f\\]/;

/** 解析のための基準にだけ使う（実在しない名前。行き先には使わない） */
const PROBE_ORIGIN = "http://next-path.invalid";

/**
 * 自サイトの中のパス（"/" で始まり、検索語・ハッシュを含んでよい）だけを返す。
 * 別のサイト（https://…・//…・/\…）・スキームつき（javascript:…）・制御文字つき・文字列でない値・空・長すぎる値は、
 * 既定の行き先（DEFAULT_NEXT_PATH）にする。通した値は URL として解析し直した形（"/a/../b" → "/b"）で返す。
 */
export function safeNextPath(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_NEXT_PATH;
  if (value.length === 0 || value.length > MAX_NEXT_LENGTH)
    return DEFAULT_NEXT_PATH;
  // "/" で始まり、2 文字目が "/" でない（"//example.com" は別のサイトを指す）
  if (value[0] !== "/" || value[1] === "/") return DEFAULT_NEXT_PATH;
  if (FORBIDDEN_CHARS.test(value)) return DEFAULT_NEXT_PATH;

  let url: URL;
  try {
    url = new URL(value, PROBE_ORIGIN);
  } catch {
    return DEFAULT_NEXT_PATH;
  }
  // 解析したあとに別のサイトを指していないか。"/..//example.com" は "//example.com" に畳まれて、別のサイトになる
  if (url.origin !== PROBE_ORIGIN || url.pathname.startsWith("//"))
    return DEFAULT_NEXT_PATH;
  return url.pathname + url.search + url.hash;
}

/**
 * 認証ページ（/login・/signup）へのリンク。next があれば付ける（呼び出し側は safeNextPath を通した値を渡す）。
 * /login と /signup を行き来するときに、元の行き先を失わないために使う。
 */
export function authPageHref(path: string, next: string | undefined): string {
  return next === undefined ? path : `${path}?next=${encodeURIComponent(next)}`;
}

/** 未ログインの人を転送するログイン画面の URL（"/account" → "/login?next=%2Faccount"）。nextPath は safeNextPath を通す */
export function loginPathFor(nextPath: string): string {
  return authPageHref(LOGIN_PATH, safeNextPath(nextPath));
}
