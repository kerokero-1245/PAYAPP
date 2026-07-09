"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import CartItem from "@/components/CartItem";
import { useCartStore } from "@/store/cartStore";
import { formatYen } from "@/lib/format";

export default function CartPage() {
  const items = useCartStore((s) => s.items);
  const totalPrice = useCartStore((s) => s.totalPrice());
  const totalItems = useCartStore((s) => s.totalItems());

  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => setMounted(true), []);

  // 既存の checkout 呼び出しロジックを維持（/checkout にPOST → data.url → Stripe へ遷移）
  const handleCheckout = async () => {
    setLoading(true);
    try {
      const res = await fetch("/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });

      const data = await res.json();
      if (!data.url) {
        throw new Error("Checkout URL が取得できません");
      }
      window.location.href = data.url;
    } catch (e) {
      console.error("Checkout error:", e);
      alert("決済処理に失敗しました");
      setLoading(false);
    }
  };

  // hydration 対策: persist ストアの動的値が固まるまでは簡易スケルトンを出す
  if (!mounted) {
    return (
      <div className="container-lux py-12">
        <p className="eyebrow">SHOPPING CART</p>
        <h1 className="font-display text-3xl md:text-4xl text-cream mt-2">カート</h1>
        <div className="hairline mt-6" />
        <p className="text-muted mt-10">読み込み中…</p>
      </div>
    );
  }

  // 空カート状態
  if (items.length === 0) {
    return (
      <div className="container-lux py-20 md:py-28">
        <div className="max-w-md mx-auto text-center animate-fade-up">
          <div className="mx-auto mb-8 flex h-20 w-20 items-center justify-center rounded-full border border-line text-gold">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="34"
              height="34"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.25"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
              <path d="M3 6h18" />
              <path d="M16 10a4 4 0 0 1-8 0" />
            </svg>
          </div>
          <p className="eyebrow">SHOPPING CART</p>
          <h1 className="font-display text-3xl md:text-4xl text-cream mt-3">カートは空です</h1>
          <p className="text-muted mt-4 leading-relaxed">
            まだ商品が追加されていません。コレクションから、あなたにふさわしい一品をお選びください。
          </p>
          <Link href="/product" className="btn btn-outline mt-8">
            コレクションを見る
          </Link>
        </div>
      </div>
    );
  }

  // カート中身
  return (
    <div className="container-lux py-12">
      <div className="animate-fade-up">
        <p className="eyebrow">SHOPPING CART</p>
        <h1 className="font-display text-3xl md:text-4xl text-cream mt-2">
          カート
          <span className="text-muted font-sans text-lg align-middle ml-3">（{totalItems}点）</span>
        </h1>
        <div className="hairline mt-6" />
      </div>

      <div className="grid lg:grid-cols-3 gap-10 mt-8">
        {/* 左: 商品リスト */}
        <div className="lg:col-span-2">
          {items.map((item) => (
            <CartItem key={item.id} item={item} />
          ))}
        </div>

        {/* 右: 注文サマリー（合計は map 外・1回だけ） */}
        <aside className="lg:col-span-1">
          <div className="panel p-6 sticky top-24">
            <h2 className="font-display text-xl text-cream">注文サマリー</h2>
            <div className="hairline my-5" />

            <dl className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-muted">小計（{totalItems}点）</dt>
                <dd className="text-cream tabular-nums">{formatYen(totalPrice)}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-muted">送料</dt>
                <dd className="text-gold">無料</dd>
              </div>
            </dl>

            <div className="hairline my-5" />

            <div className="flex items-baseline justify-between">
              <span className="text-cream tracking-wide">合計</span>
              <span className="font-display text-2xl text-gold tabular-nums">
                {formatYen(totalPrice)}
              </span>
            </div>

            <button
              onClick={handleCheckout}
              disabled={loading}
              className="btn btn-gold btn-block mt-6"
            >
              {loading ? "Stripeへ移動中…" : "購入手続きへ"}
            </button>

            <Link
              href="/product"
              className="block text-center mt-4 text-sm text-muted hover:text-cream transition-colors"
            >
              買い物を続ける
            </Link>

            <p className="text-faint text-[0.7rem] leading-relaxed mt-5 text-center">
              決済は Stripe の安全な決済ページで行われます。
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}