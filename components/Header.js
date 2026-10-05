"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useCartStore } from "@/store/cartStore";
import { useAuthStore } from "@/store/authStore";
import { useMounted } from "@/lib/useMounted";

const NAV_LINKS = [
  { href: "/", label: "ホーム" },
  { href: "/product", label: "ショップ" },
  { href: "/product?category=watches", label: "時計" },
  { href: "/product?category=jewelry", label: "ジュエリー" },
  { href: "/orders", label: "注文履歴" },
];

/** ナビ内で個別のリンクを持つカテゴリ（このカテゴリの一覧ではショップではなくそのリンクを光らせる） */
const NAV_CATEGORIES = NAV_LINKS.map((l) => l.href.split("category=")[1]).filter(Boolean);

/**
 * href が現在の URL に当たるか。
 * - "/product?category=watches" は /product かつ category=watches のときだけ
 * - "/product"（ショップ）は /product 配下のうち、上のカテゴリリンクに当たらないとき
 */
function isActiveHref(href, pathname, category) {
  const [base, query] = href.split("?");
  if (base === "/") return pathname === "/";
  if (query) {
    const want = new URLSearchParams(query).get("category");
    return pathname === base && category === want;
  }
  const inSection = pathname === base || pathname.startsWith(base + "/");
  if (base === "/product" && pathname === "/product" && NAV_CATEGORIES.includes(category)) {
    return false;
  }
  return inSection;
}

/**
 * aria-current の値。開いているページそのもの（パスとクエリが一致）なら "page"、
 * その配下（商品詳細のショップなど）なら "true"。
 */
function ariaCurrentFor(href, pathname, search, active) {
  if (!active) return undefined;
  const [base, query = ""] = href.split("?");
  return pathname === base && search === query ? "page" : "true";
}

/**
 * ナビのリンク列。category（URL の ?category=）で現在地を判定する。
 * known=false（URL のクエリがまだ分からない Suspense の fallback）では、どの項目も光らせない。
 */
function NavItems({ pathname, category, search, known, linkClass, onNavigate }) {
  return NAV_LINKS.map((l) => {
    const active = known && isActiveHref(l.href, pathname, category);
    return (
      <Link
        key={l.label}
        href={l.href}
        aria-current={ariaCurrentFor(l.href, pathname, search, active)}
        className={linkClass(active)}
        onClick={onNavigate}
      >
        {l.label}
      </Link>
    );
  });
}

/** useSearchParams は Suspense の内側で使う（静的生成でページ全体がクライアント描画に落ちるのを防ぐ） */
function NavItemsWithParams(props) {
  const params = useSearchParams();
  return (
    <NavItems
      {...props}
      category={params.get("category")}
      search={params.toString()}
      known
    />
  );
}

function Nav(props) {
  return (
    <Suspense fallback={<NavItems {...props} category={null} search="" known={false} />}>
      <NavItemsWithParams {...props} />
    </Suspense>
  );
}

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
  const mounted = useMounted();
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState("");

  const totalItems = useCartStore((s) => s.totalItems());
  const user = useAuthStore((s) => s.user);

  // ページ遷移でモバイルメニューを閉じる（前回の pathname と比べて描画中に更新する）
  const [menuPath, setMenuPath] = useState(pathname);
  if (menuPath !== pathname) {
    setMenuPath(pathname);
    setMenuOpen(false);
  }

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
              type="button"
              aria-label="メニュー"
              aria-expanded={menuOpen}
              aria-controls="mobile-menu"
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
          <nav className="hidden md:flex items-center gap-5 lg:gap-8">
            <Nav
              pathname={pathname}
              linkClass={(active) =>
                `link-underline text-[0.82rem] tracking-[0.12em] transition-colors ${
                  active ? "text-gold" : "text-muted hover:text-cream"
                }`
              }
            />
          </nav>

          {/* 右: 検索・アカウント・カート */}
          <div className="flex items-center gap-4">
            {/* md（768〜1023px）でも検索欄を出す。幅が足りないので md では細めにする */}
            <form onSubmit={submitSearch} className="hidden md:block relative">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="検索"
                className="input-lux py-1.5! pl-8! w-28 lg:w-40 text-sm"
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
              <span className="hidden sm:inline md:hidden lg:inline text-[0.8rem] max-w-[7rem] truncate">
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
      <div
        id="mobile-menu"
        hidden={!menuOpen}
        className="md:hidden bg-ink border-b border-line animate-fade-in"
      >
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
          <Nav
            pathname={pathname}
            // 同じパスのリンク（クエリ違いや今いるページ）を押しても閉じる
            onNavigate={() => setMenuOpen(false)}
            linkClass={(active) =>
              `py-2.5 text-sm tracking-wide border-b border-line/60 ${
                active ? "text-gold" : "text-muted"
              }`
            }
          />
        </div>
      </div>
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