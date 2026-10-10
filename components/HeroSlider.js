"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import Eyebrow from "@/components/ui/Eyebrow";
import Heading from "@/components/ui/Heading";
import Divider from "@/components/ui/Divider";
import Button from "@/components/ui/Button";

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
    <section className="hero relative overflow-hidden">
      {/* 背景スライド（3枚フェード） */}
      {slides.map((slide, i) => (
        <Image
          key={slide.src}
          src={slide.src}
          alt={slide.alt}
          fill
          priority={i === 0}
          sizes="100vw"
          className="object-cover hero-slide"
          data-active={i === index}
        />
      ))}

      {/* 暗さと奥行きを与えるオーバーレイ */}
      <div className="shade-up hero-shade-bottom absolute inset-0" />
      <div className="hero-shade-side absolute inset-0" />

      {/* コピー（中央左寄せ） */}
      <div className="absolute inset-0 flex items-center">
        <div className="container-lux">
          <div className="animate-fade-up max-w-2xl">
            <Eyebrow>MAISON — NEW SEASON</Eyebrow>
            <Divider variant="rule" className="mt-4" />
            <Heading as="h1" size="hero" className="mt-5">
              {/* 句の途中で改行しないよう、句ごとに折り返し単位をまとめる */}
              <span className="inline-block">時を超える、</span>
              <br className="hidden sm:block" />
              <span className="inline-block">静かな贅沢。</span>
            </Heading>
            <p className="hero-lead mt-6 max-w-md">
              選び抜かれた素材と職人の手仕事。長く寄り添うための、変わらない美しさをまとうコレクション。
            </p>
            <div className="mt-9">
              <Button href="/product">コレクションを見る</Button>
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
            aria-current={i === index || undefined}
            className="hero-dot"
          />
        ))}
      </div>
    </section>
  );
}
