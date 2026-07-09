"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";

const slides = [
  {
    src: "https://picsum.photos/seed/hero1/1920/1080",
    alt: "静謐なアトリエに佇む新作コレクション",
  },
  {
    src: "https://picsum.photos/seed/hero2/1920/1080",
    alt: "職人の手仕事が息づくレザーグッズ",
  },
  {
    src: "https://picsum.photos/seed/hero3/1920/1080",
    alt: "光をまとうシグネチャーピース",
  },
];

export default function HeroSlider() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % slides.length);
    }, 5000);

    return () => clearInterval(timer);
  }, []);

  return (
    <section className="relative h-[70vh] min-h-[520px] overflow-hidden bg-ink">
      {/* 背景スライド（3枚フェード） */}
      {slides.map((slide, i) => (
        <Image
          key={slide.src}
          src={slide.src}
          alt={slide.alt}
          fill
          priority={i === 0}
          sizes="100vw"
          className={`object-cover transition-opacity duration-1000 ease-out ${
            i === index ? "opacity-100" : "opacity-0"
          }`}
        />
      ))}

      {/* 暗さと奥行きを与えるオーバーレイ */}
      <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/40 to-ink/10" />
      <div className="absolute inset-0 bg-gradient-to-r from-ink/80 via-ink/30 to-transparent" />

      {/* コピー（中央左寄せ） */}
      <div className="absolute inset-0 flex items-center">
        <div className="container-lux">
          <div className="animate-fade-up max-w-2xl">
            <p className="eyebrow">MAISON — NEW SEASON</p>
            <span className="rule-gold mt-4" />
            <h1 className="font-display mt-5 text-4xl leading-tight text-cream sm:text-5xl md:text-6xl lg:text-7xl">
              時を超える、<br className="hidden sm:block" />
              静かな贅沢。
            </h1>
            <p className="mt-6 max-w-md text-base leading-relaxed text-muted md:text-lg">
              選び抜かれた素材と職人の手仕事。長く寄り添うための、
              変わらない美しさをまとうコレクション。
            </p>
            <div className="mt-9">
              <Link href="/product" className="btn btn-gold">
                コレクションを見る
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* スライドインジケータ（クリックで切替） */}
      <div className="absolute inset-x-0 bottom-8 flex items-center justify-center gap-3">
        {slides.map((slide, i) => (
          <button
            key={slide.src}
            type="button"
            onClick={() => setIndex(i)}
            aria-label={`スライド ${i + 1} を表示`}
            aria-current={i === index}
            className={`h-0.5 rounded-full transition-all duration-500 ${
              i === index ? "w-10 bg-gold" : "w-6 bg-line-strong hover:bg-gold-soft"
            }`}
          />
        ))}
      </div>
    </section>
  );
}