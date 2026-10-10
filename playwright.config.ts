/**
 * E2E（Playwright）の設定
 * ---------------------------------------------------
 * 本番ビルド済みの `next start` に対して回す（dev は 404 の HTML や初回コンパイルの遅さが本番と違う）。
 * 先に `npm run build` が要る（`npm run test:e2e` は build してから回す）。
 * サーバを立てる前に、専用の PGlite（.pglite-e2e/）にマイグレーションと seed を当てる。
 * ブラウザは Playwright の Chromium が既定。システムの Chrome で回すときは PW_CHANNEL=chrome。
 */
import { defineConfig, devices } from "@playwright/test";
import {
  BASE_URL,
  E2E_PGLITE_DIR,
  PORT,
  STRIPE_ENABLED,
  VIEWPORTS,
} from "./e2e/constants.ts";

const isCI = Boolean(process.env.CI);

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
  projects: [
    {
      name: "mobile-390",
      use: { ...devices["Desktop Chrome"], viewport: VIEWPORTS.mobile },
    },
    {
      name: "desktop-1280",
      use: { ...devices["Desktop Chrome"], viewport: VIEWPORTS.desktop },
    },
  ],
  webServer: {
    // DB を用意してから本番ビルドを立てる。PGlite の保存先を開けるのは 1 プロセスだけなので、&& で順に打つ
    // （migrate と seed は何度打っても同じ状態になる）
    command: `npm run db:migrate && npm run db:seed && npm run start -- -p ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !isCI,
    timeout: 120_000,
    env: {
      // サーバを Stripe から切り離す。空文字の環境変数は .env.local の値より優先される（getStripe は throw する）。
      // 実際の Stripe に通信する @stripe のテストを回すときだけ、キーを渡す
      STRIPE_SECRET_KEY: STRIPE_ENABLED
        ? (process.env.STRIPE_SECRET_KEY ?? "")
        : "",
      // Webhook の秘密も同じ（空 = 503 で何も受け付けない）。E2E は Webhook を送らない
      STRIPE_WEBHOOK_SECRET: "",
      // DB も開発の Neon（.env.local の DATABASE_URL）から切り離し、専用の PGlite にする。
      // 本番ビルド（next start）は接続先が無いと DB を開かないので、PGLITE_DATA_DIR で明示する
      DATABASE_URL: "",
      DATABASE_URL_UNPOOLED: "",
      PGLITE_DATA_DIR: E2E_PGLITE_DIR,
    },
  },
});
