"use client";

import Link from "next/link";
import Image from "next/image";
import HeroSlider from "@/components/HeroSlider";
import ProductCard from "@/components/ProductCard";
import { useProductStore, CATEGORIES } from "@/store/productStore";

/** ブランドプレッジ帯の項目（上品なラインアイコン） */
const PLEDGES = [
  {
    title: "匠の品質",
    desc: "熟練の職人が一点ずつ仕立てる逸品。",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7" aria-hidden="true">
        <path d="M6 3h12l3 6-9 12L3 9l3-6Z" />
        <path d="M3 9h18M9 3 6 9l6 12M15 3l3 6-6 12" />
      </svg>
    ),
  },
  {
    title: "無料配送",
    desc: "全国どこでも送料無料でお届け。",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7" aria-hidden="true">
        <path d="M3 7h11v9H3zM14 10h4l3 3v3h-7z" />
        <circle cx="7" cy="18" r="1.6" />
        <circle cx="17.5" cy="18" r="1.6" />
      </svg>
    ),
  },
  {
    title: "正規保証",
    desc: "全品に国際保証と真正性を保証。",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7" aria-hidden="true">
        <path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6l-7-3Z" />
        <path d="m9 12 2 2 4-4" />
      </svg>
    ),
  },
  {
    title: "ギフト包装",
    desc: "上質な化粧箱で丁寧にお包みします。",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7" aria-hidden="true">
        <path d="M4 9h16v11H4zM4 9V7h16v2M12 9v11" />
        <path d="M12 9c-1.5-3-6-3-6 0h6Zm0 0c1.5-3 6-3 6 0h-6Z" />
      </svg>
    ),
  },
];

export default function Home() {
  const products = useProductStore((s) => s.products);
  const featured = products.slice(0, 4);

  // ショーケースは all を除く4カテゴリ。背景には代表商品の画像を使う。
  const showcase = CATEGORIES.filter((c) => c.slug !== "all").map((c) => {
    const rep = products.find((p) => p.category === c.slug);
    return { ...c, image: rep?.images?.[0] };
  });

  return (
    <div>
      {/* 1. ヒーロー（全幅） */}
      <HeroSlider />

      {/* 2. NEW ARRIVALS */}
      <section className="container-lux py-16 md:py-24 animate-fade-up">
        <div className="flex flex-col items-center text-center gap-3">
          <p className="eyebrow">New Arrivals</p>
          <h2 className="font-display text-3xl md:text-4xl text-cream">
            新着コレクション
          </h2>
          <span className="rule-gold" />
          <p className="text-muted max-w-xl leading-relaxed">
            この季節を静かに彩る、選び抜かれた新作をご紹介します。
          </p>
        </div>

        <div className="mt-12 grid grid-cols-2 lg:grid-cols-4 gap-5">
          {featured.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>

        <div className="mt-12 flex justify-center">
          <Link href="/product" className="btn btn-outline">
            すべての商品を見る
          </Link>
        </div>
      </section>

      <div className="container-lux">
        <div className="hairline" />
      </div>

      {/* 3. カテゴリ ショーケース */}
      <section className="container-lux py-16 md:py-24">
        <div className="flex flex-col items-center text-center gap-3">
          <p className="eyebrow">Categories</p>
          <h2 className="font-display text-3xl md:text-4xl text-cream">
            カテゴリから探す
          </h2>
          <span className="rule-gold" />
        </div>

        <div className="mt-12 grid grid-cols-2 lg:grid-cols-4 gap-5">
          {showcase.map((cat) => (
            <Link
              key={cat.slug}
              href={`/product?category=${cat.slug}`}
              className="card card-hover group relative aspect-4/5 overflow-hidden"
            >
              {cat.image && (
                <Image
                  src={cat.image}
                  alt={cat.label}
                  fill
                  sizes="(max-width: 640px) 50vw, 25vw"
                  className="object-cover opacity-70 transition-transform duration-700 group-hover:scale-105"
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/40 to-transparent" />
              <div className="absolute inset-0 flex flex-col items-center justify-end p-6 text-center">
                <p className="eyebrow text-[0.6rem]! tracking-[0.28em]">{cat.jp}</p>
                <h3 className="font-display text-2xl text-cream mt-1">
                  {cat.label}
                </h3>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* 4. ブランドプレッジ帯 */}
      <section className="container-lux py-16 md:py-24">
        <div className="panel px-6 py-12 md:px-12 md:py-14">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10">
            {PLEDGES.map((item) => (
              <div
                key={item.title}
                className="flex flex-col items-center text-center gap-3"
              >
                <span className="text-gold">{item.icon}</span>
                <h3 className="font-display text-lg text-cream">{item.title}</h3>
                <p className="text-sm text-muted leading-relaxed max-w-[16rem]">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 5. CTA セクション */}
      <section className="container-lux py-16 md:py-24">
        <div className="flex flex-col items-center text-center gap-6">
          <p className="eyebrow">Maison — New Season</p>
          <h2 className="font-display text-3xl md:text-5xl text-cream max-w-2xl leading-tight">
            <span className="text-gradient-gold">時を超える</span>、静かな贅沢。
          </h2>
          <p className="text-muted max-w-xl leading-relaxed">
            職人の手仕事と選び抜かれた素材が織りなす、あなただけの一品を。
          </p>
          <Link href="/product" className="btn btn-gold">
            コレクションを見る
          </Link>
        </div>
      </section>
    </div>
  );
}
