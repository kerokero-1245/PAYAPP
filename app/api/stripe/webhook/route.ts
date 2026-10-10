import Stripe from "stripe";
import { getDb } from "@/lib/db/client";
import { getStripe } from "@/lib/stripe";
import { handleStripeWebhook } from "@/lib/stripe-webhook";

// Node ランタイムで動かす（署名の検証は node:crypto、DB の接続は Neon の Pool / PGlite）
export const runtime = "nodejs";

/**
 * Stripe の Webhook: POST /api/stripe/webhook
 * checkout.session.completed と checkout.session.async_payment_succeeded を受け、支払い済みの Checkout Session から
 * 注文を DB に確定する（成功ページの確認と同じ fulfillCheckout。どちらが先でも注文は 1 件）。
 *
 *  - 200  受け取って片付いた（確定した・既に確定していた・処理済みだった・未払いだった・対象外のイベントだった）
 *  - 400  署名が無い・通らない・イベントの形が不正（DB は変えない）
 *  - 503  STRIPE_WEBHOOK_SECRET が未設定（DB は変えない）
 *  - 5xx 等  確定できなかった（Stripe が再送する）
 *
 * 本体は lib/stripe-webhook.ts の handleStripeWebhook。署名の検証は、加工していない本文（Request の生のテキスト）と
 * Stripe-Signature ヘッダー、STRIPE_WEBHOOK_SECRET を Stripe のライブラリの constructEvent に渡して行う。
 */
export async function POST(request: Request) {
  return handleStripeWebhook(request, {
    // constructEvent は this を使うので、メソッドのまま呼ぶ（関数だけを取り出して渡すと検証が常に失敗する）
    constructEvent: (payload, signature, secret) =>
      Stripe.webhooks.constructEvent(payload, signature, secret),
    secret: process.env.STRIPE_WEBHOOK_SECRET,
    getDb,
    getStripe,
  });
}
