"use client";

import { Suspense, useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import SideMenu from "@/components/SideMenu";
import ProductCard from "@/components/ProductCard";
import { useProductStore, CATEGORIES } from "@/store/productStore";

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

  const filtered = useMemo(() => {
    return products.filter((p) => {
      const inCategory =
        activeCategory.slug === "all" || p.category === activeCategory.slug;
      if (!inCategory) return false;
      if (!query) return true;
      const haystack =
        `${p.name} ${p.tagline ?? ""} ${p.description ?? ""}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [products, activeCategory.slug, query]);

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
    <section className="container-lux py-12">
      <div className="flex gap-8">
        {/* サイドカテゴリ（デスクトップのみ） */}
        <div className="hidden md:block">
          <SideMenu />
        </div>

        <main className="flex-1 min-w-0">
          {/* 見出し + 件数 */}
          <header className="animate-fade-up">
            <p className="eyebrow">Shop</p>
            <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <h1 className="font-display text-3xl md:text-4xl text-cream">
                {heading}
              </h1>
              <span className="text-sm text-muted">{filtered.length} 件</span>
            </div>
            {query && activeCategory.slug !== "all" && (
              <p className="mt-2 text-sm text-faint">
                カテゴリ: {activeCategory.label}
              </p>
            )}
            <div className="hairline mt-5" />
          </header>

          {/* 絞り込みチップ（モバイル用にも重複配置） */}
          <div className="mt-6 flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <button
                key={c.slug}
                type="button"
                onClick={() => router.push(buildHref(c.slug))}
                className={`chip ${c.slug === activeCategory.slug ? "chip-active" : ""}`}
              >
                {c.label}
              </button>
            ))}
          </div>

          {/* グリッド or 0件 */}
          {filtered.length > 0 ? (
            <div className="mt-8 grid grid-cols-2 lg:grid-cols-3 gap-5">
              {filtered.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          ) : (
            <div className="mt-16 flex flex-col items-center gap-5 py-16 text-center animate-fade-up">
              <p className="eyebrow">Not found</p>
              <h2 className="font-display text-2xl text-cream">
                該当する商品がありません
              </h2>
              <p className="max-w-md text-muted leading-relaxed">
                検索条件やカテゴリを変更してお試しください。
              </p>
              <Link href="/product" className="btn btn-outline mt-2">
                すべての商品を見る
              </Link>
            </div>
          )}
        </main>
      </div>
    </section>
  );
}

/** Suspense フォールバック（スケルトン） */
function ShopFallback() {
  return (
    <section className="container-lux py-12">
      <div className="animate-fade-in">
        <p className="eyebrow">Shop</p>
        <div className="hairline mt-5" />
        <div className="mt-8 grid grid-cols-2 lg:grid-cols-3 gap-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card aspect-4/5 animate-pulse" />
          ))}
        </div>
      </div>
    </section>
  );
}

export default function ShopPage() {
  return (
    <Suspense fallback={<ShopFallback />}>
      <ShopInner />
    </Suspense>
  );
}