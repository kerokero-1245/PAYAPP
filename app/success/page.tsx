"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import StatusMessage from "@/components/ui/StatusMessage";
import Section from "@/components/ui/Section";
import Eyebrow from "@/components/ui/Eyebrow";
import Button from "@/components/ui/Button";
import Loading from "@/components/ui/Loading";
import { useCartStore } from "@/store/cartStore";
import { VERIFY_TIMEOUT_MS, decideVerifyOutcome } from "@/lib/checkout";
import type { ConfirmedOrder, VerifyInput } from "@/lib/checkout";

/**
 * 確認ルートに問い合わせる。応答が無ければ VERIFY_TIMEOUT_MS で打ち切る。
 */
async function fetchVerifyResult(
  sessionId: string,
  signal: AbortSignal,
): Promise<VerifyInput> {
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), VERIFY_TIMEOUT_MS);
  const onAbort = () => timeout.abort();
  signal.addEventListener("abort", onAbort);
  try {
    const res = await fetch(
      `/api/checkout/session?session_id=${encodeURIComponent(sessionId)}`,
      { cache: "no-store", signal: timeout.signal },
    );
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    return { kind: "response", status: res.status, body };
  } catch {
    return {
      kind:
        timeout.signal.aborted && !signal.aborted ? "timeout" : "network-error",
    };
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", onAbort);
  }
}

/**
 * 支払い済みの注文の購入分をカートから取り除き、確認ルートが返した注文番号を返す。
 * 注文は確認ルートがサーバの DB に確定している（ブラウザには記録しない）。
 * カートからは購入した品目と数量だけを取り除く（決済後に足した品は残す）。
 * 同じ session_id では 1 回だけ取り除く（再読み込みや開き直しで、買った分が余計に消えない）。
 */
function settlePaidOrder(sessionId: string, order: ConfirmedOrder): string {
  useCartStore.getState().settlePurchase(sessionId, order.items);
  return order.orderNo;
}

/** 確認の結果（確認中は含まない） */
type Result = {
  key: string;
  state: "paid" | "unpaid" | "unverified";
  orderNo: string | null;
};

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
 *  - 支払い済み: 確認ルートが DB に確定した注文の番号を出し、購入した分をカートから取り除く
 *    （注文の記録先はサーバの DB。ブラウザの localStorage には記録しない）
 *  - 未払いと確認できた（session_id なしを含む）: 何もしない
 *  - 確認できなかった（通信失敗・サーバエラー・時間切れ・カートの更新時の例外）:
 *    何もせず「もう一度確認する」を出す（二重購入を避けるため買い直しは促さない）
 */
function SuccessInner() {
  const sessionId = useSearchParams().get("session_id");
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const key = `${sessionId}#${attempt}`;

  useEffect(() => {
    if (!sessionId) return;
    const controller = new AbortController();

    (async () => {
      const raw = await fetchVerifyResult(sessionId, controller.signal);
      if (controller.signal.aborted) return;
      const outcome = decideVerifyOutcome(raw);
      if (outcome.state !== "paid") {
        setResult({ key, state: outcome.state, orderNo: null });
        return;
      }
      try {
        const orderNo = settlePaidOrder(sessionId, outcome.order);
        setResult({ key, state: "paid", orderNo });
      } catch {
        setResult({ key, state: "unverified", orderNo: null });
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
  // state が paid になるのは result がある（result.key が今の key と一致した）ときだけ
  else content = <OrderConfirmed orderNo={result!.orderNo} />;

  return (
    <>
      <p role="status" className="sr-only">
        {STATUS_MESSAGES[state]}
      </p>
      {content}
    </>
  );
}

/** 確認中（読み上げは上の role="status" が担うので、ここでは announce しない） */
function SuccessChecking() {
  return (
    <Section
      spacing="lg"
      width="narrow"
      className="text-center animate-fade-in"
      as="div"
    >
      <Eyebrow>MAISON</Eyebrow>
      <Loading
        label="決済を確認しています…"
        announce={false}
        className="mt-6"
      />
    </Section>
  );
}

/** 未払いと確認できた（session_id なしを含む） */
function PaymentUnpaid() {
  return (
    <StatusMessage
      icon="notice"
      eyebrow="Payment Not Completed"
      title="決済を確認できませんでした"
      lead="お支払いの完了を確認できなかったため、ご注文は確定していません。カートの内容はそのまま保持されています。"
      actions={
        <>
          <Button href="/cart">カートに戻る</Button>
          <Button href="/orders" variant="outline">
            注文履歴を見る
          </Button>
        </>
      }
    />
  );
}

/** 確認できなかった（通信失敗など）。買い直しは促さず、再確認を出す */
function PaymentUnverified({ onRetry }: { onRetry: () => void }) {
  return (
    <StatusMessage
      icon="notice"
      eyebrow="Payment Pending"
      title="決済の確認が取れていません"
      lead="二重に購入しないでください。通信の状況などにより、お支払いの状況を確認できませんでした。決済が完了している可能性がありますので、少し時間をおいてからもう一度確認してください。"
      actions={
        <>
          <Button onClick={onRetry}>もう一度確認する</Button>
          <Button href="/orders" variant="outline">
            注文履歴を見る
          </Button>
        </>
      }
    />
  );
}

/** 決済確認済み */
function OrderConfirmed({ orderNo }: { orderNo: string | null }) {
  return (
    <StatusMessage
      icon="check"
      eyebrow="Order Confirmed"
      title="ご購入ありがとうございます"
      lead={
        <>
          ご注文を承りました。心を込めてお包みし、お届けいたします。
          <br className="hidden sm:block" />
          ご注文番号は、下記をお控えください。
        </>
      }
      actions={
        <>
          <Button href="/orders">注文履歴を見る</Button>
          <Button href="/product" variant="outline">
            買い物を続ける
          </Button>
        </>
      }
    >
      {orderNo && (
        <div className="status-ref mt-8">
          <Eyebrow as="span">Order No.</Eyebrow>
          <span className="status-ref-value">{orderNo}</span>
        </div>
      )}
    </StatusMessage>
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
