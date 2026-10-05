"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
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

/** OS の「視差効果を減らす」設定（prefers-reduced-motion: reduce）を購読する */
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
function subscribeReducedMotion(onChange) {
  const mq = window.matchMedia(REDUCED_MOTION);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}
function usePrefersReducedMotion() {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => false
  );
}

export default function HeroSlider() {
  const [index, setIndex] = useState(0);
  const reducedMotion = usePrefersReducedMotion();

  // 自動切り替え。動きを減らす設定のときは止める（インジケータでの手動切り替えは残す）
  useEffect(() => {
    if (reducedMotion) return;
    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % slides.length);
    }, 5000);

    return () => clearInterval(timer);
  }, [reducedMotion]);

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
              {/* 句の途中で改行しないよう、句ごとに折り返し単位をまとめる */}
              <span className="inline-block">時を超える、</span>
              <br className="hidden sm:block" />
              <span className="inline-block">静かな贅沢。</span>
            </h1>
            <p className="mt-6 max-w-md text-base leading-relaxed text-muted md:text-lg">
              選び抜かれた素材と職人の手仕事。長く寄り添うための、変わらない美しさをまとうコレクション。
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