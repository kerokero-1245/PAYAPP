/**
 * E2E（Playwright）の設定
 * ---------------------------------------------------
 * 本番ビルド済みの `next start` に対して回す（dev は 404 の HTML や初回コンパイルの遅さが本番と違う）。
 * 先に `npm run build` が要る（`npm run test:e2e` は build してから回す）。
 * サーバを立てる前に、専用の PGlite（.pglite-e2e/）にマイグレーションと seed を当てる（商品と、注文履歴の利用者・注文。e2e/seed.ts）。
 * 認証（Better Auth）はこの DB に利用者とセッションを書く本物で、秘密は固定のダミー（e2e/constants.ts）を渡す。
 * 注文履歴（/orders）はこの DB の注文をサーバから読む。
 * 同じビルドを、DB が使えないサーバとしてもう 1 つ（DB_DOWN_PORT）立てる。DB に触れる画面が「ただいま表示できません」になることを
 * e2e/db-unavailable.spec.ts が確かめる。
 * ブラウザは Playwright の Chromium が既定。システムの Chrome で回すときは PW_CHANNEL=chrome。
 */
import { defineConfig, devices } from "@playwright/test";
import {
  BASE_URL,
  DB_DOWN_BASE_URL,
  DB_DOWN_PGLITE_DIR,
  DB_DOWN_PORT,
  E2E_AUTH_SECRET,
  E2E_CLIENT_IPS,
  E2E_PGLITE_DIR,
  PORT,
  STRIPE_ENABLED,
  VIEWPORTS,
} from "./e2e/constants.ts";

const isCI = Boolean(process.env.CI);

/**
 * サーバ（next start）に渡す環境変数。どちらのサーバも、.env.local の値に左右されないよう必ずここで上書きする。
 * pgliteDir は PGlite の保存先、baseUrl はサーバ自身の URL（認証の Origin の検査が信用する）
 */
function serverEnv(pgliteDir: string, baseUrl: string): Record<string, string> {
  return {
    // サーバを Stripe から切り離す。空文字の環境変数は .env.local の値より優先される（getStripe は throw する）。
    // 実際の Stripe に通信する @stripe のテストを回すときだけ、キーを渡す
    STRIPE_SECRET_KEY: STRIPE_ENABLED
      ? (process.env.STRIPE_SECRET_KEY ?? "")
      : "",
    // Webhook の秘密も同じ（空 = 503 で何も受け付けない）。E2E は Webhook を送らない
    STRIPE_WEBHOOK_SECRET: "",
    // DB も開発の Neon（.env.local の DATABASE_URL）から切り離し、PGlite にする。
    // 本番ビルド（next start）は接続先が無いと DB を開かないので、PGLITE_DATA_DIR で明示する
    DATABASE_URL: "",
    DATABASE_URL_UNPOOLED: "",
    PGLITE_DATA_DIR: pgliteDir,
    // 認証: 固定のダミーの秘密と、サーバ自身の URL（.env.local の値に左右されない。Origin の検査はこの URL を信用する）
    BETTER_AUTH_SECRET: E2E_AUTH_SECRET,
    BETTER_AUTH_URL: baseUrl,
  };
}

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  // test.only の消し忘れを CI で落とす
  forbidOnly: isCI,
  // 揺れを retry で隠さない。CI だけ 1 回。retry で通ったテストはレポートの flaky に出る
  retries: isCI ? 1 : 0,
  // CI の 2 vCPU に合わせる。ローカルも 2 本にして、ほかの作業と同居しても重くしない
  workers: 2,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: BASE_URL,
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
    // 動きを減らす設定にして、ヒーローの自動切り替えと CSS のアニメーションを止める
    contextOptions: { reducedMotion: "reduce" },
    // ローカルで Chrome に切り替えるときだけ指定する
    channel: process.env.PW_CHANNEL || undefined,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "off",
  },
  // 幅は撮影と同じ 390 / 1280。モバイル端末の模倣（isMobile・タッチ）はせず、幅だけを変える
  // x-forwarded-for は、本番ビルドの試行回数の制限が接続元を分けるための値（幅ごとに分ける。e2e/constants.ts の E2E_CLIENT_IPS）
  projects: [
    {
      name: "mobile-390",
      use: {
        ...devices["Desktop Chrome"],
        viewport: VIEWPORTS.mobile,
        extraHTTPHeaders: { "x-forwarded-for": E2E_CLIENT_IPS["mobile-390"] },
      },
    },
    {
      name: "desktop-1280",
      use: {
        ...devices["Desktop Chrome"],
        viewport: VIEWPORTS.desktop,
        extraHTTPHeaders: { "x-forwarded-for": E2E_CLIENT_IPS["desktop-1280"] },
      },
    },
  ],
  webServer: [
    {
      // DB を用意してから本番ビルドを立てる。PGlite の保存先を開けるのは 1 プロセスだけなので、&& で順に打つ
      // （migrate・商品の seed・e2e/seed.ts は何度打っても同じ状態になる）。e2e/seed.ts は注文履歴の利用者と注文を入れる
      command: `npm run db:migrate && npm run db:seed && node e2e/seed.ts && npm run start -- -p ${PORT}`,
      url: BASE_URL,
      reuseExistingServer: !isCI,
      // 負荷の高い環境では、PGlite の起動 3 回と seed（本物のパスワードのハッシュ計算を含む）だけで時間がかかる
      timeout: 240_000,
      // 専用の PGlite（.pglite-e2e/）
      env: serverEnv(E2E_PGLITE_DIR, BASE_URL),
    },
    {
      // DB が使えないサーバ。同じビルドを別のポートで立てる（準備する DB は無い）。PGlite の保存先を作れないので、DB に触れる要求は
      // 必ず失敗する。DB を使わない画面は動き、DB に触れる画面は「ただいま表示できません」になることを e2e/db-unavailable.spec.ts が確かめる
      command: `npm run start -- -p ${DB_DOWN_PORT}`,
      url: DB_DOWN_BASE_URL,
      reuseExistingServer: !isCI,
      timeout: 240_000,
      env: serverEnv(DB_DOWN_PGLITE_DIR, DB_DOWN_BASE_URL),
    },
  ],
});
