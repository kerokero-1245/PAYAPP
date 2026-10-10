"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { CATEGORIES } from "@/store/productStore";
import { categoryHref } from "@/lib/links";
import Eyebrow from "@/components/ui/Eyebrow";
import Divider from "@/components/ui/Divider";

/**
 * ショップ（商品一覧）用サイドカテゴリメニュー
 *
 * @description
 * productStore の CATEGORIES を動的にマップし、現在の URL クエリ
 * （?category=slug）に応じて選択中カテゴリをゴールドでハイライトする。
 * "all" は /product（クエリなし）へリンクする。選択中のリンクは開いているページそのものなので aria-current="page"。
 * 見た目は .side-link[aria-current]（値に結び付けない）で付ける。
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
      <Eyebrow className="mb-4">CATEGORIES</Eyebrow>
      <Divider className="mb-5" />

      <nav>
        <ul className="flex flex-col gap-1">
          {CATEGORIES.map((cat) => {
            const href = categoryHref(cat.slug);
            const active = onShop && cat.slug === currentCategory;

            return (
              <li key={cat.slug}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className="link-quiet link-quiet-sm side-link flex items-baseline gap-2 pl-4 py-2"
                >
                  <span>{cat.label}</span>
                  <span className="side-link-sub">{cat.jp}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
