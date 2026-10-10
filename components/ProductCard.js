"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { useCartStore } from "@/store/cartStore";
import Card from "@/components/ui/Card";
import MediaFrame from "@/components/ui/MediaFrame";
import Badge from "@/components/ui/Badge";
import Eyebrow from "@/components/ui/Eyebrow";
import Price from "@/components/ui/Price";
import Button from "@/components/ui/Button";

/**
 * 商品カード（一覧・トップ・関連商品で共通利用）
 *
 * @param {{ product: object, eager?: boolean }} props
 *   eager: 最初の画面に入るカードは true（画像を遅延読み込みしない）
 */
export default function ProductCard({ product, eager = false }) {
  const addItem = useCartStore((s) => s.addItem);
  const [added, setAdded] = useState(false);
  // カード全体に乗っているか（画像の拡大は画像自身の data-active で表す。親の :hover から子を変えない）
  const [hover, setHover] = useState(false);
  const image = product.images?.[0] ?? product.image;

  const handleAdd = (e) => {
    e.preventDefault();
    addItem(product);
    setAdded(true);
    setTimeout(() => setAdded(false), 1400);
  };

  return (
    <Card
      interactive
      className="overflow-hidden flex flex-col"
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
    >
      <Link href={`/product/${product.id}`} className="block relative">
        <MediaFrame ratio="4/5">
          {image && (
            <Image
              src={image}
              alt={product.name}
              fill
              loading={eager ? "eager" : undefined}
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
              className="object-cover zoom"
              data-active={hover}
            />
          )}
          {product.badge && <Badge className="absolute top-3 left-3">{product.badge}</Badge>}
        </MediaFrame>
      </Link>

      <div className="p-4 flex flex-col gap-1.5 flex-1">
        {product.category && (
          <Eyebrow size="sm" tone="faint" tracking="md">
            {product.category}
          </Eyebrow>
        )}
        <Link href={`/product/${product.id}`}>
          <h3 className="type-display heading heading-item heading-snug heading-link">{product.name}</h3>
        </Link>
        {product.tagline && <p className="tagline line-clamp-1">{product.tagline}</p>}

        {/* 狭いカード（スマホの 2 列）では価格の下にボタンを全幅で置き、はみ出しを防ぐ */}
        <div className="mt-auto pt-3 flex flex-wrap items-center justify-between gap-2">
          <Price amount={product.price} size="base" tone="cream" wide />
          <Button
            variant={added ? "gold" : "outline"}
            size="sm"
            onClick={handleAdd}
            className="w-full sm:w-auto"
          >
            {added ? "追加済み ✓" : "カートへ"}
          </Button>
        </div>
      </div>
    </Card>
  );
}
