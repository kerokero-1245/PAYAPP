"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { useCartStore } from "@/store/cartStore";
import { formatYen } from "@/lib/format";

/**
 * 商品カード（一覧・トップ・関連商品で共通利用）
 *
 * @param {{ product: object }} props
 */
export default function ProductCard({ product }) {
  const addItem = useCartStore((s) => s.addItem);
  const [added, setAdded] = useState(false);
  const image = product.images?.[0] ?? product.image;

  const handleAdd = (e) => {
    e.preventDefault();
    addItem(product);
    setAdded(true);
    setTimeout(() => setAdded(false), 1400);
  };

  return (
    <div className="card card-hover group overflow-hidden flex flex-col">
      <Link href={`/product/${product.id}`} className="block relative">
        <div className="relative aspect-4/5 overflow-hidden bg-surface-2">
          {image && (
            <Image
              src={image}
              alt={product.name}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
              className="object-cover transition-transform duration-700 group-hover:scale-105"
            />
          )}
          {product.badge && (
            <span className="absolute top-3 left-3 chip chip-active text-[0.6rem]! py-1! px-2.5!">
              {product.badge}
            </span>
          )}
        </div>
      </Link>

      <div className="p-4 flex flex-col gap-1.5 flex-1">
        {product.category && (
          <p className="eyebrow text-[0.6rem]! tracking-[0.22em] text-faint">
            {product.category}
          </p>
        )}
        <Link href={`/product/${product.id}`}>
          <h3 className="font-display text-lg text-cream leading-snug hover:text-gold transition-colors">
            {product.name}
          </h3>
        </Link>
        {product.tagline && (
          <p className="text-xs text-muted line-clamp-1">{product.tagline}</p>
        )}

        <div className="mt-auto pt-3 flex items-center justify-between gap-2">
          <span className="text-cream text-base tracking-wide">{formatYen(product.price)}</span>
          <button
            onClick={handleAdd}
            className={`btn btn-sm ${added ? "btn-gold" : "btn-outline"}`}
          >
            {added ? "追加済み ✓" : "カートへ"}
          </button>
        </div>
      </div>
    </div>
  );
}