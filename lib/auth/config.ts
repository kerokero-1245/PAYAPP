/**
 * 認証（Better Auth）の設定
 * ---------------------------------------------------
 * メール + パスワードで登録・ログインし、セッションは DB（session 表）に置く。cookie は HttpOnly・SameSite=Lax・Path=/
 * （https の URL では Secure）で、cookie の中身は署名つきのセッションの識別子だけ。
 * ログイン・ログアウト・登録は GraphQL ではなく Better Auth の /api/auth/*（app/api/auth/[...all]/route.ts）が受ける
 * （cookie の発行と削除・試行回数の制限・送信元（Origin）の検査をまとめて持っているため）。
 *
 * 付けないもの: メール確認・パスワードの再設定（メールを送る基盤が無い）・外部サービスでのログイン（GitHub は後の段）。
 * 採用した既定値と、変えた値・理由は README の「認証」節の表にある（Better Auth 1.7.6 のコードで確かめた値）。
 * Better Auth を上げるときは、その表と tests/auth.test.ts を読み直す。
 *
 * DB と設定は引数で受け取る（lib/db/client.ts の getDb() は server-only でテストから読めない。getStripe と同じ流儀）。
 * アプリは lib/auth/server.ts の getAuth() から受け取り、テストは lib/db/test-helpers.ts の PGlite を差し込む。
 */
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import type { Db } from "../db/connect.ts";
import { account, session, user, verification } from "../db/schema.ts";
import {
  AUTH_BASE_PATH,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  SESSION_EXPIRES_IN_SECONDS,
  SESSION_UPDATE_AGE_SECONDS,
} from "./constants.ts";

/** 環境変数（process.env を渡す。テストは値を直接渡す） */
export type AuthEnv = Readonly<Record<string, string | undefined>>;

/** createAuth に渡す設定。resolveAuthSettings が環境変数から作る */
export type AuthSettings = {
  /** セッションの cookie の署名と、Better Auth が暗号化する値の鍵 */
  secret: string;
  /** 認証の基準の URL（オリジンだけ）。無ければ、リクエストの URL のオリジンになる（プレビュー環境） */
  baseURL?: string;
  /**
   * 試行回数の制限を有効にするか。無ければ Better Auth の既定（本番（NODE_ENV=production）だけ有効）。
   * テストが、本番以外で制限の効きを確かめるために true を渡す
   */
  rateLimit?: boolean;
};

/**
 * 開発・テストで BETTER_AUTH_SECRET が無いときに使う固定の秘密。公開された値なので、これで署名したものは信用できない。
 * 本番では使えない（resolveAuthSettings が例外にする）
 */
export const DEV_AUTH_SECRET =
  "dev-only-secret-never-use-in-production-0123456789abcdef";

/** 本番の秘密の最小の長さ（Better Auth は 32 文字未満を警告するだけ。ここでは例外にする） */
export const MIN_PRODUCTION_SECRET_LENGTH = 32;

/** 空文字・空白だけは未設定として扱う（.env に `BETTER_AUTH_URL=` と書いてあるだけの場合） */
function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/** BETTER_AUTH_URL を検査して、オリジン（"https://example.com"）にする。パスやクエリがあれば例外 */
function parseBaseURL(value: string | undefined): string | undefined {
  const text = nonEmpty(value);
  if (text === undefined) return undefined;
  let url: URL | undefined;
  try {
    url = new URL(text);
  } catch {
    url = undefined;
  }
  if (
    url === undefined ||
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.pathname.replace(/\/+$/, "") !== "" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new Error(
      "BETTER_AUTH_URL は、http:// か https:// で始まる、サイトのオリジンだけの URL にしてください（例: https://example.com。パスやクエリは付けません）",
    );
  }
  return url.origin;
}

/**
 * 環境変数から認証の設定を作る。
 *  - BETTER_AUTH_SECRET: 本番（NODE_ENV=production）では必須で、32 文字以上のランダムな値。無い・短い・開発用の固定の値なら例外にする
 *    （認証が黙って弱い鍵で動かないように）。開発・テストでは無ければ開発用の固定の値（DEV_AUTH_SECRET）を使う
 *  - BETTER_AUTH_URL: 認証の基準の URL。Production には本番の URL を置き、Preview には置かない
 *    （置くと、プレビューの URL からの要求が「信用できない送信元」として断られる）。無ければリクエストの URL から決まる
 * 秘密の値はエラー文に入れない。
 */
export function resolveAuthSettings(env: AuthEnv): AuthSettings {
  const configured = nonEmpty(env.BETTER_AUTH_SECRET);
  if (
    env.NODE_ENV === "production" &&
    (configured === undefined ||
      configured === DEV_AUTH_SECRET ||
      configured.length < MIN_PRODUCTION_SECRET_LENGTH)
  ) {
    throw new Error(
      `本番（NODE_ENV=production）では、${MIN_PRODUCTION_SECRET_LENGTH} 文字以上のランダムな BETTER_AUTH_SECRET が必要です（例: openssl rand -base64 32 で作る）`,
    );
  }
  return {
    secret: configured ?? DEV_AUTH_SECRET,
    baseURL: parseBaseURL(env.BETTER_AUTH_URL),
  };
}

/**
 * Better Auth を作る（アプリで 1 つ。作り方は lib/auth/server.ts の getAuth）。
 * 表は lib/db/schema.ts の認証の表。ここで決めている値（パスワードの長さ・セッションの期限）は lib/auth/constants.ts にある。
 */
export function createAuth(db: Db, settings: AuthSettings) {
  return betterAuth({
    secret: settings.secret,
    baseURL: settings.baseURL,
    basePath: AUTH_BASE_PATH,
    database: drizzleAdapter(db, {
      provider: "pg",
      // Better Auth に渡すのは認証の表だけ（アプリの表は見せない）
      schema: { user, session, account, verification },
      // 登録は user・account・session を順に作る。途中で失敗したときに、ログインできない利用者を残さない（既定は false）
      transaction: true,
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: MIN_PASSWORD_LENGTH,
      maxPasswordLength: MAX_PASSWORD_LENGTH,
      // requireEmailVerification と sendResetPassword は設定しない（メール確認と再設定を付けない）。
      // 登録のあとは、そのままログイン状態になる（autoSignIn の既定）
    },
    session: {
      expiresIn: SESSION_EXPIRES_IN_SECONDS,
      updateAge: SESSION_UPDATE_AGE_SECONDS,
    },
    ...(settings.rateLimit === undefined
      ? {}
      : { rateLimit: { enabled: settings.rateLimit } }),
    // 利用状況の送信は、既定でも無効。外へ通信しないことを明示しておく
    telemetry: { enabled: false },
  });
}

/** createAuth が返す、Better Auth の本体（handler と api を持つ） */
export type Auth = ReturnType<typeof createAuth>;
