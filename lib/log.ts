/**
 * 構造化ログ（1 行 1 JSON）
 * ---------------------------------------------------
 * サーバのログ（Vercel Hobby の実行時ログは 1 時間で消える）に残す出来事は、ここを通して「出来事の名前 + 識別子」だけを書く。
 * 例外の本体・メールアドレス・パスワードのハッシュ・SQL の引数は書かない: Drizzle の例外は message と params に
 * SQL の引数をそのまま持つので、例外を console に渡すと、INSERT の引数（ハッシュ・メール）がログに残る。
 *  - logEvent: { level, event, ...fields } を 1 行の JSON にして console に出す。fields の値は文字列・数・真偽・null だけ
 *    （オブジェクトや例外を渡せない型にして、丸ごと出力する事故を防ぐ）。長い文字列は切り詰める
 *  - describeError: 例外から、名前と SQLSTATE などのコードだけを取り出す（message・stack・params は取り出さない）
 *  - firstLine: 長い文（Drizzle の "Failed query: …\nparams: …" など）の先頭 1 行だけを、上限の長さまでで返す
 */

export type LogLevel = "info" | "warn" | "error";

/** ログの項目。値は文字列・数・真偽・null だけ（undefined の項目は出さない） */
export type LogFields = Readonly<
  Record<string, string | number | boolean | null | undefined>
>;

/** 文字列の値 1 つの長さの上限。外から来る文（Origin ヘッダーなど）でログを埋められないようにする */
export const MAX_LOG_STRING_LENGTH = 300;

/** logEvent が自分で付ける項目の名前（fields で上書きさせない） */
const RESERVED_KEYS = new Set(["level", "event"]);

function clip(text: string): string {
  return text.length > MAX_LOG_STRING_LENGTH
    ? `${text.slice(0, MAX_LOG_STRING_LENGTH)}…`
    : text;
}

/** 文の先頭 1 行を、上限の長さまでで返す（2 行目以降は捨てる） */
export function firstLine(text: string): string {
  return clip(text.split("\n", 1)[0] ?? "");
}

/** 出来事を 1 行の JSON にして、level に合わせた console に出す */
export function logEvent(
  level: LogLevel,
  event: string,
  fields: LogFields = {},
): void {
  const entry: Record<string, string | number | boolean | null> = {
    level,
    event,
  };
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || RESERVED_KEYS.has(key)) continue;
    entry[key] = typeof value === "string" ? clip(value) : value;
  }
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

/** 名前・コードとして出してよい形（英数字とアンダースコアだけ。短い識別子） */
const IDENTIFIER = /^[0-9A-Za-z_]{1,40}$/;

function identifierOf(value: unknown): string | undefined {
  return typeof value === "string" && IDENTIFIER.test(value)
    ? value
    : undefined;
}

/**
 * 例外から、ログに出してよい 2 項目だけを取り出す。
 *  - errorName: 例外の名前（"Error"・"DrizzleQueryError" など）
 *  - errorCode: コード。Postgres の SQLSTATE（"23505" など）や Node のシステムエラー（"ECONNREFUSED"）。
 *    Drizzle は元の例外を cause に入れて包むので、cause をたどって最初に見つかったものを使う
 * message・stack・SQL の引数（params）は取り出さない。例外でない値は型の名前だけ。
 */
export function describeError(error: unknown): LogFields {
  if (typeof error !== "object" || error === null) {
    return { errorType: error === null ? "null" : typeof error };
  }
  let errorCode: string | undefined;
  let current: unknown = error;
  for (
    let depth = 0;
    depth < 5 && typeof current === "object" && current !== null;
    depth += 1
  ) {
    const { code, cause } = current as { code?: unknown; cause?: unknown };
    errorCode = identifierOf(code);
    if (errorCode !== undefined) break;
    current = cause;
  }
  return {
    errorName: identifierOf((error as { name?: unknown }).name),
    errorCode,
  };
}
