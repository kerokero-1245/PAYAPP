"use client";

import Link from "next/link";
import Image from "next/image";
import { useCartStore } from "@/store/cartStore";
import { formatYen } from "@/lib/format";

/**
 * カート内の1商品を表す行コンポーネント
 *
 * @param {{ item: object }} props
 */
export default function CartItem({ item }) {
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const removeItem = useCartStore((s) => s.removeItem);

  const dec = () => updateQuantity(item.id, item.quantity - 1);
  const inc = () => updateQuantity(item.id, item.quantity + 1);

  return (
    <div className="flex gap-4 py-5 border-b border-line">
      {/* サムネイル */}
      <Link
        href={`/product/${item.id}`}
        className="relative w-20 h-24 shrink-0 overflow-hidden bg-surface-2 rounded-[2px]"
      >
        {item.image && (
          <Image src={item.image} alt={item.name} fill sizes="80px" className="object-cover" />
        )}
      </Link>

      {/* 詳細 */}
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="flex justify-between gap-3">
          <div className="min-w-0">
            <Link
              href={`/product/${item.id}`}
              className="font-display text-lg text-cream hover:text-gold transition-colors block truncate"
            >
              {item.name}
            </Link>
            {item.category && (
              <p className="eyebrow text-[0.58rem]! tracking-[0.2em] text-faint mt-0.5">
                {item.category}
              </p>
            )}
          </div>
          <button
            onClick={() => removeItem(item.id)}
            className="text-faint hover:text-danger transition-colors text-xs shrink-0"
            aria-label="削除"
          >
            削除
          </button>
        </div>

        <div className="mt-auto pt-3 flex items-end justify-between gap-3">
          {/* 数量ステッパー */}
          <div className="inline-flex items-center border border-line rounded-[2px]">
            <button
              onClick={dec}
              disabled={item.quantity <= 1}
              className="w-8 h-8 text-muted hover:text-gold disabled:opacity-30 transition-colors"
              aria-label="数量を減らす"
            >
              −
            </button>
            <span className="w-8 text-center text-sm text-cream tabular-nums">{item.quantity}</span>
            <button
              onClick={inc}
              className="w-8 h-8 text-muted hover:text-gold transition-colors"
              aria-label="数量を増やす"
            >
              +
            </button>
          </div>

          {/* 小計 */}
          <div className="text-right">
            <p className="text-cream tracking-wide">{formatYen(item.price * item.quantity)}</p>
            {item.quantity > 1 && (
              <p className="text-[0.7rem] text-faint">{formatYen(item.price)} × {item.quantity}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}