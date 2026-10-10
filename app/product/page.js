"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import SideMenu from "@/components/SideMenu";
import ProductCard from "@/components/ProductCard";
import { useProductStore, CATEGORIES } from "@/store/productStore";
import Section from "@/components/ui/Section";
import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";
import Eyebrow from "@/components/ui/Eyebrow";
import Divider from "@/components/ui/Divider";
import Card from "@/components/ui/Card";

/**
 * ショップ本体（useSearchParams を使うため Suspense 配下に置く）
 * ?category=<slug> と ?q=<検索語> を読み、SideMenu + 商品グリッドを描画する。
 */
function ShopInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const products = useProductStore((s) => s.products);

  const q = searchParams.get("q") ?? "";
  const query = q.trim().toLowerCase();
  const categoryParam = searchParams.get("category") ?? "all";
  const activeCategory =
    CATEGORIES.find((c) => c.slug === categoryParam) ?? CATEGORIES[0];
  const activeSlug = activeCategory.slug;

  // 10 件程度の絞り込みなので毎回計算する（useMemo は React Compiler の lint と相性が悪く外した）
  const filtered = products.filter((p) => {
    const inCategory = activeSlug === "all" || p.category === activeSlug;
    if (!inCategory) return false;
    if (!query) return true;
    const haystack =
      `${p.name} ${p.tagline ?? ""} ${p.description ?? ""}`.toLowerCase();
    return haystack.includes(query);
  });

  // カテゴリ遷移用の href（検索語 q は維持、all は素の /product）
  const buildHref = (slug) => {
    const params = new URLSearchParams();
    if (slug !== "all") params.set("category", slug);
    if (q) params.set("q", q);
    const qs = params.toString();
    return qs ? `/product?${qs}` : "/product";
  };

  const heading = query
    ? `「${q}」の検索結果`
    : activeCategory.slug === "all"
      ? "すべての商品"
      : activeCategory.label;

  return (
    <Section spacing="sm">
      <div className="flex gap-8">
        {/* サイドカテゴリ（デスクトップのみ） */}
        <div className="hidden md:block">
          <SideMenu />
        </div>

        <div className="flex-1 min-w-0">
          {/* 見出し + 件数 */}
          <PageHeader
            eyebrow="Shop"
            title={heading}
            meta={`${filtered.length} 件`}
            note={query && activeCategory.slug !== "all" ? `カテゴリ: ${activeCategory.label}` : null}
          />

          {/* 絞り込みチップ（モバイル用にも重複配置） */}
          <div className="mt-6 flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <button
                key={c.slug}
                type="button"
                onClick={() => router.push(buildHref(c.slug))}
                className={c.slug === activeCategory.slug ? "pill chip chip-active" : "pill chip"}
              >
                {c.label}
              </button>
            ))}
          </div>

          {/* グリッド or 0件 */}
          {filtered.length > 0 ? (
            <div className="mt-8 grid grid-cols-2 lg:grid-cols-3 gap-5">
              {filtered.map((product, i) => (
                // 1 行目付近は最初の画面に入るので遅延読み込みしない（LCP 対策）
                <ProductCard key={product.id} product={product} eager={i < 3} />
              ))}
            </div>
          ) : (
            <EmptyState
              layout="stack"
              className="mt-16 py-16 animate-fade-up"
              eyebrow="Not found"
              title="該当する商品がありません"
              titleSize="block"
              description="検索条件やカテゴリを変更してお試しください。"
              action={{ href: "/product", label: "すべての商品を見る", variant: "outline" }}
              actionClassName="mt-2"
            />
          )}
        </div>
      </div>
    </Section>
  );
}

/** Suspense フォールバック（スケルトン） */
function ShopFallback() {
  return (
    <Section spacing="sm">
      <div className="animate-fade-in">
        <Eyebrow>Shop</Eyebrow>
        <Divider className="mt-5" />
        <div className="mt-8 grid grid-cols-2 lg:grid-cols-3 gap-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="aspect-4/5 animate-pulse" />
          ))}
        </div>
      </div>
    </Section>
  );
}

export default function ShopPage() {
  return (
    <Suspense fallback={<ShopFallback />}>
      <ShopInner />
    </Suspense>
  );
}