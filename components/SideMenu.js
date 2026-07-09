"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { CATEGORIES } from "@/store/productStore";

/**
 * ショップ（商品一覧）用サイドカテゴリメニュー
 *
 * @description
 * productStore の CATEGORIES を動的にマップし、現在の URL クエリ
 * （?category=slug）に応じて選択中カテゴリをゴールドでハイライトする。
 * "all" は /product（クエリなし）へリンクする。
 *
 * @remarks
 * usePathname / useSearchParams を使用するため、呼び出し側（shop ページ）の
 * <Suspense> 境界内に配置される前提。default export・props なし。
 *
 * @returns {JSX.Element} サイドメニューUI
 */
export default function SideMenu() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const currentCategory = searchParams.get("category") || "all";
  const onShop = pathname === "/product";

  return (
    <aside className="w-56 shrink-0 sticky top-24 self-start">
      <p className="eyebrow mb-4">CATEGORIES</p>
      <div className="hairline mb-5" />

      <nav>
        <ul className="space-y-1">
          {CATEGORIES.map((cat) => {
            const href = cat.slug === "all" ? "/product" : `/product?category=${cat.slug}`;
            const active = onShop && cat.slug === currentCategory;

            return (
              <li key={cat.slug}>
                <Link
                  href={href}
                  aria-current={active ? "true" : undefined}
                  className={`flex items-baseline gap-2 border-l-2 pl-4 py-2 text-sm tracking-wide transition-colors ${
                    active
                      ? "border-gold text-gold"
                      : "border-transparent text-muted hover:text-cream"
                  }`}
                >
                  <span>{cat.label}</span>
                  <span className="text-[0.62rem] tracking-[0.2em] uppercase text-faint">
                    {cat.jp}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}