"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import Eyebrow from "@/components/ui/Eyebrow";

/**
 * トップのカテゴリのタイル（画像 + 下からの影 + カテゴリ名）。
 * タイル全体に乗ったときの画像の拡大は、画像自身の data-active で表す（親の :hover から子を変えない）。
 *
 * @param {{ category: { slug: string, label: string, jp: string, image?: string } }} props
 */
export default function CategoryTile({ category }) {
  const [hover, setHover] = useState(false);
  return (
    <Link
      href={`/product?category=${category.slug}`}
      className="card card-hover relative aspect-4/5 overflow-hidden"
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
    >
      {category.image && (
        <Image
          src={category.image}
          alt={category.label}
          fill
          sizes="(max-width: 640px) 50vw, 25vw"
          className="object-cover tile-img zoom"
          data-active={hover}
        />
      )}
      <div className="shade-up absolute inset-0" />
      <div className="absolute inset-0 flex flex-col items-center justify-end p-4 sm:p-6 text-center">
        <Eyebrow size="sm" tracking="lg">
          {category.jp}
        </Eyebrow>
        {/* 狭い 2 列でも「フレグランス」を語の途中で折り返さない */}
        <h3 className="type-display heading heading-tile mt-1">{category.label}</h3>
      </div>
    </Link>
  );
}
