"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { useParams } from "next/navigation";
import {
  useProductStore,
  getProductById,
  CATEGORIES,
} from "@/store/productStore";
import { useCartStore } from "@/store/cartStore";
import { formatYen } from "@/lib/format";
import ProductCard from "@/components/ProductCard";

export default function ProductDetailPage() {
  const params = useParams();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const product = getProductById(id);

  const products = useProductStore((s) => s.products);
  const addItem = useCartStore((s) => s.addItem);

  const [activeImage, setActiveImage] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);

  // 未存在時の上品なフォールバック
  if (!product) {
    return (
      <div className="container-lux py-24 text-center max-w-xl animate-fade-up">
        <p className="eyebrow">MAISON</p>
        <h1 className="font-display text-3xl md:text-4xl text-cream mt-4">
          商品が見つかりませんでした
        </h1>
        <p className="text-muted mt-4 leading-relaxed">
          お探しの商品は移動されたか、販売を終了した可能性がございます。
        </p>
        <div className="mt-8">
          <Link href="/product" className="btn btn-gold">
            商品一覧へ戻る
          </Link>
        </div>
      </div>
    );
  }

  const images = product.images ?? [];
  const categoryLabel =
    CATEGORIES.find((c) => c.slug === product.category)?.label ??
    product.category;

  const related = products
    .filter((p) => p.category === product.category && p.id !== product.id)
    .slice(0, 4);

  const decrement = () => setQuantity((q) => Math.max(1, q - 1));
  const increment = () => setQuantity((q) => q + 1);

  const handleAdd = () => {
    // 選択した数量ぶんをカートに加算（既存分があれば上乗せ）
    addItem(product, quantity);
    setAdded(true);
  };

  return (
    <div className="container-lux py-12 animate-fade-up">
      {/* パンくず */}
      <nav className="mb-8 text-xs text-muted">
        <Link href="/product" className="link-underline hover:text-cream">
          商品一覧
        </Link>
        <span className="mx-2 text-faint">/</span>
        <span className="text-faint">{categoryLabel}</span>
      </nav>

      <div className="grid md:grid-cols-2 gap-10 md:gap-14">
        {/* 左: 画像ギャラリー */}
        <div>
          <div className="relative aspect-4/5 card overflow-hidden bg-surface-2">
            {images[activeImage] && (
              <Image
                src={images[activeImage]}
                alt={product.name}
                fill
                sizes="(max-width: 768px) 100vw, 50vw"
                className="object-cover"
                priority
              />
            )}
            {product.badge && (
              <span className="absolute top-4 left-4 chip chip-active text-[0.62rem]! py-1! px-2.5!">
                {product.badge}
              </span>
            )}
          </div>

          {images.length > 1 && (
            <div className="grid grid-cols-3 gap-3 mt-3">
              {images.map((src, i) => (
                <button
                  key={src}
                  type="button"
                  onClick={() => setActiveImage(i)}
                  aria-label={`${product.name} 画像 ${i + 1} を表示`}
                  className={`relative aspect-4/5 card overflow-hidden bg-surface-2 transition ${
                    i === activeImage
                      ? "border-gold"
                      : "opacity-60 hover:opacity-100"
                  }`}
                >
                  <Image
                    src={src}
                    alt={`${product.name} サムネイル ${i + 1}`}
                    fill
                    sizes="(max-width: 768px) 33vw, 16vw"
                    className="object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 右: 商品情報 */}
        <div className="flex flex-col">
          <p className="eyebrow">{categoryLabel}</p>
          <h1 className="font-display text-3xl md:text-4xl text-cream mt-3 leading-tight">
            {product.name}
          </h1>
          {product.tagline && (
            <p className="text-muted mt-3">{product.tagline}</p>
          )}

          <p className="text-2xl md:text-3xl text-gold-soft tracking-wide mt-6">
            {formatYen(product.price)}
          </p>

          <div className="hairline my-7" />

          {product.description && (
            <p className="text-muted leading-relaxed">{product.description}</p>
          )}

          {/* 数量セレクタ + カート追加 */}
          <div className="mt-8 flex items-center gap-4">
            <div className="flex items-center border border-line rounded-[2px]">
              <button
                type="button"
                onClick={decrement}
                aria-label="数量を減らす"
                className="w-11 h-11 flex items-center justify-center text-cream hover:text-gold transition-colors disabled:opacity-40"
                disabled={quantity <= 1}
              >
                −
              </button>
              <span className="w-12 text-center text-cream tabular-nums">
                {quantity}
              </span>
              <button
                type="button"
                onClick={increment}
                aria-label="数量を増やす"
                className="w-11 h-11 flex items-center justify-center text-cream hover:text-gold transition-colors"
              >
                +
              </button>
            </div>
            <span className="text-xs text-faint">在庫あり</span>
          </div>

          <button
            type="button"
            onClick={handleAdd}
            className="btn btn-gold btn-block mt-5"
          >
            カートに追加
          </button>

          {added && (
            <div className="mt-4 panel px-4 py-3 flex items-center justify-between gap-3 animate-fade-in">
              <span className="text-sm text-cream">
                <span className="text-gold">✓</span> カートに追加しました
              </span>
              <Link
                href="/cart"
                className="text-sm text-gold-soft link-underline hover:text-gold-bright"
              >
                カートを見る
              </Link>
            </div>
          )}

          {/* 配送・素材などの小さな箇条書き */}
          <div className="mt-10">
            <p className="eyebrow">DETAILS</p>
            <ul className="mt-3 space-y-2 text-sm text-muted">
              <li>全国送料無料 ・ 2〜4営業日でお届け</li>
              <li>ギフトラッピング承ります</li>
              <li>2年間の国際保証付き</li>
              <li>30日間の返品保証</li>
            </ul>
          </div>
        </div>
      </div>

      {/* 関連商品（同カテゴリ・最大4件） */}
      {related.length > 0 && (
        <section className="mt-20 md:mt-28">
          <p className="eyebrow">RELATED</p>
          <h2 className="font-display text-2xl md:text-3xl text-cream mt-2">
            同じカテゴリの商品
          </h2>
          <span className="rule-gold mt-4" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mt-8">
            {related.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}