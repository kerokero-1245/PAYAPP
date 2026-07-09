"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useCartStore } from "@/store/cartStore";
import { useAuthStore } from "@/store/authStore";

/**
 * サイト共通ヘッダー
 *
 * - スリムなアナウンスバー + メインナビ
 * - カート点数バッジ / ログイン状態表示 / 検索
 * - persist ストアの hydration ズレを防ぐため mounted 後に動的値を表示
 */
export default function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState("");

  const totalItems = useCartStore((s) => s.totalItems());
  const user = useAuthStore((s) => s.user);

  useEffect(() => setMounted(true), []);
  // ページ遷移でモバイルメニューを閉じる
  useEffect(() => setMenuOpen(false), [pathname]);

  const navLinks = [
    { href: "/", label: "ホーム" },
    { href: "/product", label: "ショップ" },
    { href: "/product?category=watches", label: "時計" },
    { href: "/product?category=jewelry", label: "ジュエリー" },
    { href: "/orders", label: "注文履歴" },
  ];

  const isActive = (href) => {
    const base = href.split("?")[0];
    if (base === "/") return pathname === "/";
    return pathname === base || pathname.startsWith(base + "/");
  };

  const submitSearch = (e) => {
    e.preventDefault();
    const q = query.trim();
    router.push(q ? `/product?q=${encodeURIComponent(q)}` : "/product");
    setMenuOpen(false);
  };

  return (
    <header className="sticky top-0 z-50">
      {/* アナウンスバー */}
      <div className="bg-ink-2 border-b border-line text-center py-2">
        <p className="eyebrow text-[0.62rem]! tracking-[0.28em] text-gold-soft">
          全国送料無料 — 選び抜かれた逸品を、あなたのもとへ
        </p>
      </div>

      {/* メインヘッダー */}
      <div className="bg-ink/85 backdrop-blur-md border-b border-line">
        <div className="container-lux flex items-center justify-between gap-4 h-16">
          {/* 左: モバイルメニュー + ブランド */}
          <div className="flex items-center gap-3">
            <button
              aria-label="メニュー"
              className="md:hidden text-cream"
              onClick={() => setMenuOpen((o) => !o)}
            >
              <MenuIcon open={menuOpen} />
            </button>
            <Link href="/" className="font-display text-2xl tracking-[0.18em] text-cream">
              MAISON
            </Link>
          </div>

          {/* 中央: ナビ（デスクトップ） */}
          <nav className="hidden md:flex items-center gap-8">
            {navLinks.map((l) => (
              <Link
                key={l.label}
                href={l.href}
                className={`link-underline text-[0.82rem] tracking-[0.12em] transition-colors ${
                  isActive(l.href) ? "text-gold" : "text-muted hover:text-cream"
                }`}
              >
                {l.label}
              </Link>
            ))}
          </nav>

          {/* 右: 検索・アカウント・カート */}
          <div className="flex items-center gap-4">
            <form onSubmit={submitSearch} className="hidden lg:block relative">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="検索"
                className="input-lux py-1.5! pl-8! w-40 text-sm"
                aria-label="商品を検索"
              />
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-faint">
                <SearchIcon />
              </span>
            </form>

            {/* アカウント */}
            <Link
              href={mounted && user ? "/account" : "/login"}
              className="flex items-center gap-2 text-muted hover:text-cream transition-colors"
              aria-label="アカウント"
            >
              <UserIcon />
              <span className="hidden sm:inline text-[0.8rem] max-w-[7rem] truncate">
                {mounted && user ? user.name : "ログイン"}
              </span>
            </Link>

            {/* カート */}
            <Link
              href="/cart"
              className="relative text-cream hover:text-gold transition-colors"
              aria-label="カート"
            >
              <CartIcon />
              {mounted && totalItems > 0 && (
                <span className="absolute -top-2 -right-2 badge-count">{totalItems}</span>
              )}
            </Link>
          </div>
        </div>
      </div>

      {/* モバイルメニュー */}
      {menuOpen && (
        <div className="md:hidden bg-ink border-b border-line animate-fade-in">
          <div className="container-lux py-4 flex flex-col gap-1">
            <form onSubmit={submitSearch} className="relative mb-3">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="商品を検索"
                className="input-lux pl-9!"
                aria-label="商品を検索"
              />
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-faint">
                <SearchIcon />
              </span>
            </form>
            {navLinks.map((l) => (
              <Link
                key={l.label}
                href={l.href}
                className={`py-2.5 text-sm tracking-wide border-b border-line/60 ${
                  isActive(l.href) ? "text-gold" : "text-muted"
                }`}
              >
                {l.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </header>
  );
}

/* ---- インライン SVG アイコン（外部依存なし） ---- */
function CartIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M6 6h15l-1.5 9h-12z" strokeLinejoin="round" />
      <path d="M6 6L5 3H2" strokeLinecap="round" />
      <circle cx="9" cy="20" r="1.4" />
      <circle cx="18" cy="20" r="1.4" />
    </svg>
  );
}
function UserIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
      <circle cx="12" cy="8" r="3.4" />
      <path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6" strokeLinecap="round" />
    </svg>
  );
}
function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4-4" strokeLinecap="round" />
    </svg>
  );
}
function MenuIcon({ open }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      {open ? (
        <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
      ) : (
        <>
          <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}