"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useCartStore } from "@/store/cartStore";
import { useOrderStore } from "@/store/orderStore";

/**
 * 決済成功ページ
 * ---------------------------------------------------
 * マウント時に一度だけカート内容から注文を生成して履歴へ保存し、
 * カートを空にする。生成した注文番号を表示する。
 * 直リロード等でカートが空の場合は、直近の注文があればそれを表示。
 */
export default function SuccessPage() {
  const [orderId, setOrderId] = useState(null);
  // StrictMode の二重実行や再レンダーでの多重登録を防ぐガード
  const processed = useRef(false);

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;

    const items = useCartStore.getState().items;
    const total = useCartStore.getState().totalPrice();

    if (items.length) {
      // id を自前で発番して addOrder に渡し、そのまま表示に使う
      const id = `ORD-${Date.now().toString(36).toUpperCase()}`;
      useOrderStore.getState().addOrder({ id, items, total });
      useCartStore.getState().clearCart();
      setOrderId(id);
    } else {
      // カートが空（直リロード等）でも、既存の最新注文があれば表示する
      const latest = useOrderStore.getState().orders[0];
      if (latest) setOrderId(latest.id);
    }
  }, []);

  return (
    <main className="container-lux py-24 text-center max-w-xl animate-fade-up">
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
    </main>
  );
}