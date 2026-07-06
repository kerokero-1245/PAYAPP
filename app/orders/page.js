"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useOrderStore } from "@/store/orderStore";
import { formatYen, formatDate } from "@/lib/format";

export default function OrdersPage() {
  const orders = useOrderStore((s) => s.orders);

  // persist ストアの hydration ズレを避けるため mounted 後に描画
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <main className="container-lux py-14 md:py-20">
      {/* ページ見出し */}
      <header className="animate-fade-up">
        <p className="eyebrow">MAISON — ORDER HISTORY</p>
        <h1 className="font-display text-4xl md:text-5xl text-cream mt-3">
          注文履歴
        </h1>
        <span className="rule-gold mt-5" />
      </header>

      <div className="hairline mt-8 mb-10" />

      {/* mounted 前はプレースホルダ（hydration 対策） */}
      {!mounted ? (
        <p className="text-faint text-sm">読み込み中…</p>
      ) : orders.length === 0 ? (
        /* 空状態 */
        <div className="card p-10 md:p-16 text-center animate-fade-in">
          <h2 className="font-display text-2xl md:text-3xl text-cream">
            まだご注文はありません
          </h2>
          <p className="text-muted mt-3 leading-relaxed">
            気になる一品を見つけて、最初のご注文をお楽しみください。
          </p>
          <Link href="/product" className="btn btn-gold mt-8">
            商品を見る
          </Link>
        </div>
      ) : (
        /* 注文一覧（ストアが新しい順で保持） */
        <ul className="flex flex-col gap-5 animate-fade-in">
          {orders.map((order) => (
            <li key={order.id}>
              <article className="card p-5">
                {/* ヘッダー行: 注文番号 / 日付 / 合計 */}
                <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
                  <div>
                    <p className="eyebrow text-[0.62rem]! tracking-[0.2em] text-faint">
                      ORDER
                    </p>
                    <p className="font-display text-xl text-cream mt-1">
                      {order.id}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-muted">
                      {formatDate(order.date)}
                    </p>
                    <p className="font-display text-lg text-gold mt-1">
                      {formatYen(order.total)}
                    </p>
                  </div>
                </div>

                <div className="hairline my-4" />

                {/* サムネイル列（画像がある商品のみ） */}
                {order.items?.some((item) => item.image) && (
                  <div className="flex flex-wrap gap-2 mb-4">
                    {order.items
                      .filter((item) => item.image)
                      .map((item) => (
                        <div
                          key={`${order.id}-thumb-${item.id}`}
                          className="relative w-14 h-16 shrink-0 overflow-hidden bg-surface-2 rounded-[2px] border border-line"
                        >
                          <Image
                            src={item.image}
                            alt={item.name}
                            fill
                            sizes="56px"
                            className="object-cover"
                          />
                        </div>
                      ))}
                  </div>
                )}

                {/* 商品名 × 数量リスト */}
                <ul className="flex flex-col gap-1.5">
                  {order.items?.map((item) => (
                    <li
                      key={`${order.id}-item-${item.id}`}
                      className="flex items-baseline justify-between gap-4 text-sm"
                    >
                      <span className="text-cream min-w-0 truncate">
                        {item.name}
                        <span className="text-faint">
                          {" "}
                          × {item.quantity}
                        </span>
                      </span>
                      <span className="text-muted shrink-0">
                        {formatYen(item.price * item.quantity)}
                      </span>
                    </li>
                  ))}
                </ul>
              </article>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}