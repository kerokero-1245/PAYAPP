"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCartStore } from "@/store/cartStore";
import { useOrderStore } from "@/store/orderStore";
import {
  VERIFY_TIMEOUT_MS,
  decideVerifyOutcome,
  findOrderBySession,
} from "@/lib/checkout.mjs";

/**
 * 確認ルートに問い合わせる。応答が無ければ VERIFY_TIMEOUT_MS で打ち切る。
 * @returns {Promise<Parameters<typeof decideVerifyOutcome>[0]>}
 */
async function fetchVerifyResult(sessionId, signal) {
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), VERIFY_TIMEOUT_MS);
  const onAbort = () => timeout.abort();
  signal.addEventListener("abort", onAbort);
  try {
    const res = await fetch(
      `/api/checkout/session?session_id=${encodeURIComponent(sessionId)}`,
      { cache: "no-store", signal: timeout.signal }
    );
    let body = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    return { kind: "response", status: res.status, body };
  } catch {
    return { kind: timeout.signal.aborted && !signal.aborted ? "timeout" : "network-error" };
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", onAbort);
  }
}

/**
 * 支払い済みの注文を記録する。品目と金額は確認ルートが session から作ったもの。
 * 同じ session_id の注文が記録済みなら新しく記録せず、その注文番号を返す。
 * カートからは購入した品目と数量だけを取り除く（決済後に足した品は残す）。
 */
function recordPaidOrder(sessionId, order) {
  const existing = findOrderBySession(useOrderStore.getState().orders, sessionId);
  if (existing) return existing.id;

  const id = `ORD-${Date.now().toString(36).toUpperCase()}`;
  useOrderStore.getState().addOrder({
    id,
    items: order.items,
    total: order.total,
    sessionId,
  });
  useCartStore.getState().removePurchased(order.items);
  return id;
}

/** 読み上げ用の文言（role="status" の要素に入れる） */
const STATUS_MESSAGES = {
  checking: "決済を確認しています",
  paid: "ご注文を承りました",
  unpaid: "決済を確認できませんでした。ご注文は確定していません",
  unverified: "決済の確認が取れていません。二重に購入しないでください",
};

/**
 * 決済成功ページ
 * ---------------------------------------------------
 * Stripe から戻ってきた ?session_id= を /api/checkout/session で確認し、
 *  - 支払い済み: session の内容で注文を記録し、購入した分をカートから取り除く
 *  - 未払いと確認できた（session_id なしを含む）: 何も記録しない
 *  - 確認できなかった（通信失敗・サーバエラー・時間切れ・記録時の例外）:
 *    何も記録せず「もう一度確認する」を出す（二重購入を避けるため買い直しは促さない）
 */
function SuccessInner() {
  const sessionId = useSearchParams().get("session_id");
  const [attempt, setAttempt] = useState(0);
  // { key, state: "paid" | "unpaid" | "unverified", orderId }
  const [result, setResult] = useState(null);
  const key = `${sessionId}#${attempt}`;

  useEffect(() => {
    if (!sessionId) return;
    const controller = new AbortController();

    (async () => {
      const raw = await fetchVerifyResult(sessionId, controller.signal);
      if (controller.signal.aborted) return;
      const outcome = decideVerifyOutcome(raw);
      if (outcome.state !== "paid") {
        setResult({ key, state: outcome.state, orderId: null });
        return;
      }
      try {
        const orderId = recordPaidOrder(sessionId, outcome.order);
        setResult({ key, state: "paid", orderId });
      } catch {
        setResult({ key, state: "unverified", orderId: null });
      }
    })();

    return () => controller.abort();
  }, [sessionId, attempt, key]);

  const state = !sessionId
    ? decideVerifyOutcome({ kind: "missing-session" }).state
    : result?.key === key
      ? result.state
      : "checking";

  let content;
  if (state === "checking") content = <SuccessChecking />;
  else if (state === "unpaid") content = <PaymentUnpaid />;
  else if (state === "unverified")
    content = <PaymentUnverified onRetry={() => setAttempt((a) => a + 1)} />;
  else content = <OrderConfirmed orderId={result.orderId} />;

  return (
    <>
      <p role="status" className="sr-only">
        {STATUS_MESSAGES[state]}
      </p>
      {content}
    </>
  );
}

/** 確認中 */
function SuccessChecking() {
  return (
    <div className="container-lux py-24 text-center max-w-xl animate-fade-in">
      <p className="eyebrow">MAISON</p>
      <p className="text-muted mt-6">決済を確認しています…</p>
    </div>
  );
}

/** 円 + 「!」のマーク */
function NoticeMark() {
  return (
    <svg
      viewBox="0 0 80 80"
      className="mx-auto h-24 w-24 text-gold"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="40" cy="40" r="36" strokeWidth="1.5" strokeOpacity="0.45" />
      <path d="M40 24 L40 46" strokeWidth="2.5" />
      <path d="M40 55 L40 56" strokeWidth="3" />
    </svg>
  );
}

/** 未払いと確認できた（session_id なしを含む） */
function PaymentUnpaid() {
  return (
    <div className="container-lux py-24 text-center max-w-xl animate-fade-up">
      <NoticeMark />
      <p className="eyebrow mt-8">Payment Not Completed</p>
      <h1 className="font-display mt-4 text-3xl md:text-4xl text-cream">
        決済を確認できませんでした
      </h1>
      <span className="rule-gold mt-6" />

      <p className="mt-6 text-muted leading-relaxed">
        お支払いの完了を確認できなかったため、ご注文は確定していません。カートの内容はそのまま保持されています。
      </p>

      <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
        <Link href="/cart" className="btn btn-gold">
          カートに戻る
        </Link>
        <Link href="/orders" className="btn btn-outline">
          注文履歴を見る
        </Link>
      </div>
    </div>
  );
}

/** 確認できなかった（通信失敗など）。買い直しは促さず、再確認を出す */
function PaymentUnverified({ onRetry }) {
  return (
    <div className="container-lux py-24 text-center max-w-xl animate-fade-up">
      <NoticeMark />
      <p className="eyebrow mt-8">Payment Pending</p>
      <h1 className="font-display mt-4 text-3xl md:text-4xl text-cream">
        決済の確認が取れていません
      </h1>
      <span className="rule-gold mt-6" />

      <p className="mt-6 text-muted leading-relaxed">
        二重に購入しないでください。通信の状況などにより、お支払いの状況を確認できませんでした。決済が完了している可能性がありますので、少し時間をおいてからもう一度確認してください。
      </p>

      <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
        <button type="button" onClick={onRetry} className="btn btn-gold">
          もう一度確認する
        </button>
        <Link href="/orders" className="btn btn-outline">
          注文履歴を見る
        </Link>
      </div>
    </div>
  );
}

/** 決済確認済み */
function OrderConfirmed({ orderId }) {
  return (
    <div className="container-lux py-24 text-center max-w-xl animate-fade-up">
      {/* ゴールドのチェックマーク（円 + チェック） */}
      <svg
        viewBox="0 0 80 80"
        className="mx-auto h-24 w-24 text-gold"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="40" cy="40" r="36" strokeWidth="1.5" strokeOpacity="0.45" />
        <path d="M25 41.5 L36 52 L56 29" strokeWidth="2.5" />
      </svg>

      <p className="eyebrow mt-8">Order Confirmed</p>
      <h1 className="font-display mt-4 text-3xl md:text-4xl text-cream">
        ご購入ありがとうございます
      </h1>
      <span className="rule-gold mt-6" />

      <p className="mt-6 text-muted leading-relaxed">
        ご注文を承りました。心を込めてお包みし、お届けいたします。
        <br className="hidden sm:block" />
        確認のご連絡を追ってお送りいたします。
      </p>

      {orderId && (
        <div className="mt-8 inline-flex items-center gap-3 border border-line rounded-[2px] px-5 py-3">
          <span className="eyebrow">Order No.</span>
          <span className="text-gold-soft tracking-widest text-sm">
            {orderId}
          </span>
        </div>
      )}

      <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
        <Link href="/orders" className="btn btn-gold">
          注文履歴を見る
        </Link>
        <Link href="/product" className="btn btn-outline">
          買い物を続ける
        </Link>
      </div>
    </div>
  );
}

export default function SuccessPage() {
  return (
    <Suspense
      fallback={
        <>
          <p role="status" className="sr-only">
            {STATUS_MESSAGES.checking}
          </p>
          <SuccessChecking />
        </>
      }
    >
      <SuccessInner />
    </Suspense>
  );
}
