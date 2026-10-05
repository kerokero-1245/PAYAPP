import "server-only";
import Stripe from "stripe";

/**
 * サーバ専用: リクエストごとに Stripe クライアントを生成する
 * （キー未設定を分かりやすく検知する）。
 * "server-only" により、クライアントのコードから import するとビルドが失敗する
 * （このパッケージは Next.js に同梱されているので依存の追加は不要）。
 *
 * 成功ページはブラウザ側で 10 秒待つので、Stripe への 1 回の要求は 4 秒で打ち切り、
 * 通信エラー時の再試行は 1 回までにする。
 */
export function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY が設定されていません");
  return new Stripe(key, {
    apiVersion: "2023-10-16",
    timeout: 4000,
    maxNetworkRetries: 1,
  });
}
