"use client";

import HeroSlider from "@/components/HeroSlider";
import ProductCard from "@/components/ProductCard";
import CategoryTile from "@/components/CategoryTile";
import PledgeGrid from "@/components/PledgeGrid";
import Section from "@/components/ui/Section";
import SectionHeading from "@/components/ui/SectionHeading";
import Eyebrow from "@/components/ui/Eyebrow";
import Heading from "@/components/ui/Heading";
import Button from "@/components/ui/Button";
import Divider from "@/components/ui/Divider";
import { useProductStore, CATEGORIES } from "@/store/productStore";

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
      <Section spacing="top" className="animate-fade-up">
        <SectionHeading
          eyebrow="New Arrivals"
          title="新着コレクション"
          lead="この季節を静かに彩る、選び抜かれた新作をご紹介します。"
        />

        <div className="mt-12 grid grid-cols-2 lg:grid-cols-4 gap-5">
          {featured.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>

        <div className="mt-12 flex justify-center">
          <Button href="/product" variant="outline">
            すべての商品を見る
          </Button>
        </div>
      </Section>

      <div className="container-lux">
        <Divider />
      </div>

      {/* 3. カテゴリ ショーケース */}
      <Section spacing="top">
        <SectionHeading eyebrow="Categories" title="カテゴリから探す" />

        <div className="mt-12 grid grid-cols-2 lg:grid-cols-4 gap-5">
          {showcase.map((cat) => (
            <CategoryTile key={cat.slug} category={cat} />
          ))}
        </div>
      </Section>

      {/* 4. ブランドプレッジ帯（ブランドストーリーと共有） */}
      <Section spacing="top">
        <PledgeGrid />
      </Section>

      {/* 5. CTA セクション */}
      <Section spacing="top">
        <div className="flex flex-col items-center text-center gap-6">
          <Eyebrow>Maison — New Season</Eyebrow>
          <Heading size="display" className="max-w-2xl">
            <span className="inline-block">
              <span className="text-gradient-gold">時を超える</span>、
            </span>
            <span className="inline-block">静かな贅沢。</span>
          </Heading>
          <p className="lead max-w-xl">
            職人の手仕事と選び抜かれた素材が織りなす、あなただけの一品を。
          </p>
          <Button href="/product">コレクションを見る</Button>
        </div>
      </Section>
    </div>
  );
}
