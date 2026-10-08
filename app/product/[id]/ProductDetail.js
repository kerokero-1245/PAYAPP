"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import {
  useProductStore,
  getProductById,
  CATEGORIES,
} from "@/store/productStore";
import { useCartStore } from "@/store/cartStore";
import { MAX_QUANTITY } from "@/lib/cart.mjs";
import { PRODUCT_DETAIL_POINTS } from "@/lib/policies.mjs";
import ProductCard from "@/components/ProductCard";
import Section from "@/components/ui/Section";
import Card from "@/components/ui/Card";
import MediaFrame from "@/components/ui/MediaFrame";
import Badge from "@/components/ui/Badge";
import Eyebrow from "@/components/ui/Eyebrow";
import Divider from "@/components/ui/Divider";
import Price from "@/components/ui/Price";
import Button from "@/components/ui/Button";
import QuantityStepper from "@/components/ui/QuantityStepper";
import SectionHeading from "@/components/ui/SectionHeading";

/**
 * 商品詳細（クライアント側の本体）
 * 存在しない id は page.js（サーバ）が notFound() で 404 にするので、ここには来ない。
 *
 * @param {{ id: string }} props
 */
export default function ProductDetail({ id }) {
  const product = getProductById(id);

  const products = useProductStore((s) => s.products);
  const addItem = useCartStore((s) => s.addItem);

  const [activeImage, setActiveImage] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);

  if (!product) return null;

  const images = product.images ?? [];
  const categoryLabel =
    CATEGORIES.find((c) => c.slug === product.category)?.label ??
    product.category;

  const related = products
    .filter((p) => p.category === product.category && p.id !== product.id)
    .slice(0, 4);

  const decrement = () => setQuantity((q) => Math.max(1, q - 1));
  const increment = () => setQuantity((q) => Math.min(MAX_QUANTITY, q + 1));

  const handleAdd = () => {
    // 選択した数量ぶんをカートに加算（既存分があれば上乗せ）
    addItem(product, quantity);
    setAdded(true);
  };

  return (
    <Section spacing="sm" as="div" className="animate-fade-up">
      {/* パンくず */}
      <nav className="breadcrumb mb-8">
        <Link href="/product" className="link-underline breadcrumb-link">
          商品一覧
        </Link>
        <span className="breadcrumb-quiet mx-2">/</span>
        <span className="breadcrumb-quiet">{categoryLabel}</span>
      </nav>

      <div className="grid md:grid-cols-2 gap-10 md:gap-14">
        {/* 左: 画像ギャラリー */}
        <div>
          <MediaFrame ratio="4/5" className="card">
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
              <Badge size="lg" className="absolute top-4 left-4">
                {product.badge}
              </Badge>
            )}
          </MediaFrame>

          {images.length > 1 && (
            <div className="grid grid-cols-3 gap-3 mt-3">
              {images.map((src, i) => (
                <MediaFrame
                  as="button"
                  key={src}
                  type="button"
                  ratio="4/5"
                  onClick={() => setActiveImage(i)}
                  aria-label={`${product.name} 画像 ${i + 1} を表示`}
                  data-active={i === activeImage}
                  className="card thumb-option"
                >
                  <Image
                    src={src}
                    alt={`${product.name} サムネイル ${i + 1}`}
                    fill
                    sizes="(max-width: 768px) 33vw, 16vw"
                    className="object-cover"
                  />
                </MediaFrame>
              ))}
            </div>
          )}
        </div>

        {/* 右: 商品情報 */}
        <div className="flex flex-col">
          <Eyebrow>{categoryLabel}</Eyebrow>
          <h1 className="heading heading-page heading-tight mt-3">{product.name}</h1>
          {product.tagline && <p className="subtle mt-3">{product.tagline}</p>}

          <Price as="p" amount={product.price} size="hero" tone="gold-soft" wide className="mt-6" />

          <Divider className="my-7" />

          {product.description && <p className="lead">{product.description}</p>}

          {/* 数量セレクタ + カート追加 */}
          <div className="mt-8 flex items-center gap-4">
            <QuantityStepper
              value={quantity}
              max={MAX_QUANTITY}
              onDecrement={decrement}
              onIncrement={increment}
            />
            <span className="fine">在庫あり</span>
          </div>

          <Button block onClick={handleAdd} className="mt-5">
            カートに追加
          </Button>

          {added && (
            <Card variant="panel" className="mt-4 px-4 py-3 flex items-center justify-between gap-3 animate-fade-in">
              <span className="notice-text">
                <span className="notice-mark">✓</span> カートに追加しました
              </span>
              <Link href="/cart" className="notice-link link-underline">
                カートを見る
              </Link>
            </Card>
          )}

          {/* 配送・素材などの小さな箇条書き（文面は lib/policies.mjs と共有） */}
          <div className="mt-10">
            <Eyebrow>DETAILS</Eyebrow>
            <ul className="detail-points mt-3 flex flex-col gap-2">
              {PRODUCT_DETAIL_POINTS.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* 関連商品（同カテゴリ・最大4件） */}
      {related.length > 0 && (
        <section className="mt-20 md:mt-28">
          <SectionHeading align="start" eyebrow="RELATED" title="同じカテゴリの商品" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mt-8">
            {related.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}
    </Section>
  );
}
