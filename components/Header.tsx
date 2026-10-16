"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import type { FormEvent } from "react";
import { useCartStore } from "@/store/cartStore";
import { authClient } from "@/lib/auth/client";
import { useMounted } from "@/lib/useMounted";
import Eyebrow from "@/components/ui/Eyebrow";
import { ANNOUNCEMENT } from "@/lib/policies";
import { CATEGORY_LINKS } from "@/lib/links";

/**
 * ナビに個別のリンクを出すカテゴリ（リンクの URL と名前は lib/links.ts の CATEGORY_LINKS から作る）。
 * このカテゴリの一覧では、ショップではなくそのリンクを光らせる
 */
// category は URL に ?category= が無いと null になる。includes にそのまま渡して false にするので、null も許す型にしてある
const NAV_CATEGORY_SLUGS: readonly (string | null)[] = ["watches", "jewelry"];

const NAV_LINKS = [
  { href: "/", label: "ホーム" },
  { href: "/product", label: "ショップ" },
  ...CATEGORY_LINKS.filter((c) => NAV_CATEGORY_SLUGS.includes(c.slug)).map(
    ({ href, label }) => ({ href, label }),
  ),
  { href: "/orders", label: "注文履歴" },
];

/**
 * href が現在の URL に当たるか。
 * - "/product?category=watches" は /product かつ category=watches のときだけ
 * - "/product"（ショップ）は /product 配下のうち、上のカテゴリリンクに当たらないとき
 */
function isActiveHref(
  href: string,
  pathname: string,
  category: string | null,
): boolean {
  const [base, query] = href.split("?");
  if (base === "/") return pathname === "/";
  if (query) {
    const want = new URLSearchParams(query).get("category");
    return pathname === base && category === want;
  }
  const inSection = pathname === base || pathname.startsWith(base + "/");
  if (
    base === "/product" &&
    pathname === "/product" &&
    NAV_CATEGORY_SLUGS.includes(category)
  ) {
    return false;
  }
  return inSection;
}

/**
 * aria-current の値。開いているページそのもの（パスとクエリが一致）なら "page"、
 * その配下（商品詳細のショップなど）なら "true"。
 */
function ariaCurrentFor(
  href: string,
  pathname: string,
  search: string,
  active: boolean,
): "page" | "true" | undefined {
  if (!active) return undefined;
  const [base, query = ""] = href.split("?");
  return pathname === base && search === query ? "page" : "true";
}

type NavItemsProps = {
  pathname: string;
  /** URL の ?category=（無ければ null） */
  category: string | null;
  /** URL のクエリ文字列（aria-current の判定用） */
  search: string;
  /** false: URL のクエリがまだ分からない Suspense の fallback */
  known: boolean;
  linkClass: string;
  onNavigate?: () => void;
};

/** Nav が受ける props（クエリに関する値は Nav の中で決める） */
type NavProps = Omit<NavItemsProps, "category" | "search" | "known">;

/**
 * ナビのリンク列。category（URL の ?category=）で現在地を判定する。
 * known=false（URL のクエリがまだ分からない Suspense の fallback）では、どの項目も光らせない。
 * 現在地の見た目は linkClass のクラスが aria-current で付ける（.nav-link[aria-current] など）。
 */
function NavItems({
  pathname,
  category,
  search,
  known,
  linkClass,
  onNavigate,
}: NavItemsProps) {
  return NAV_LINKS.map((l) => {
    const active = known && isActiveHref(l.href, pathname, category);
    return (
      <Link
        key={l.label}
        href={l.href}
        aria-current={ariaCurrentFor(l.href, pathname, search, active)}
        className={linkClass}
        onClick={onNavigate}
      >
        {l.label}
      </Link>
    );
  });
}

/** useSearchParams は Suspense の内側で使う（静的生成でページ全体がクライアント描画に落ちるのを防ぐ） */
function NavItemsWithParams(props: NavProps) {
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

function Nav(props: NavProps) {
  return (
    <Suspense
      fallback={<NavItems {...props} category={null} search="" known={false} />}
    >
      <NavItemsWithParams {...props} />
    </Suspense>
  );
}

/**
 * サイト共通ヘッダー
 *
 * - スリムなアナウンスバー + メインナビ
 * - カート点数バッジ / ログイン状態表示 / 検索
 * - カートは persist ストア（localStorage）なので、hydration ズレを防ぐため mounted 後に動的値を表示する
 * - ログイン状態はサーバのセッション（Better Auth の /api/auth/get-session。cookie を見て、期限と署名を確かめる）から取る。
 *   取れるまでは（サーバの描画も）未ログインの表示。ログイン・ログアウトが成功すると useSession が自動で取り直す。
 *   サーバコンポーネントで読まないのは、ヘッダーはすべてのページにあり、cookie を読むとすべてのページが動的になる
 *   （商品ページの静的生成が外れる）ため
 */
export default function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const mounted = useMounted();
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState("");

  const totalItems = useCartStore((s) => s.totalItems());
  const { data: session } = authClient.useSession();
  const user = session?.user;

  // ページ遷移でモバイルメニューを閉じる（前回の pathname と比べて描画中に更新する）
  const [menuPath, setMenuPath] = useState(pathname);
  if (menuPath !== pathname) {
    setMenuPath(pathname);
    setMenuOpen(false);
  }

  const submitSearch = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const q = query.trim();
    router.push(q ? `/product?q=${encodeURIComponent(q)}` : "/product");
    setMenuOpen(false);
  };

  return (
    <header className="sticky top-0 z-50">
      {/* アナウンスバー */}
      <div className="announce text-center py-2">
        <Eyebrow size="sm" tone="soft" tracking="lg">
          {ANNOUNCEMENT}
        </Eyebrow>
      </div>

      {/* メインヘッダー */}
      <div className="site-bar">
        <div className="container-lux flex items-center justify-between gap-4 h-16">
          {/* 左: モバイルメニュー + ブランド */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="メニュー"
              aria-expanded={menuOpen}
              aria-controls="mobile-menu"
              className="menu-btn md:hidden"
              onClick={() => setMenuOpen((o) => !o)}
            >
              <MenuIcon open={menuOpen} />
            </button>
            <Link href="/" className="type-display brand">
              MAISON NOIR
            </Link>
          </div>

          {/* 中央: ナビ（デスクトップ） */}
          <nav className="hidden md:flex items-center gap-5 lg:gap-8">
            <Nav
              pathname={pathname}
              linkClass="link-underline link-quiet nav-link"
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
                className="input-lux input-search-sm w-28 lg:w-40"
                aria-label="商品を検索"
              />
              <span className="search-icon absolute left-2.5 top-1/2 -translate-y-1/2">
                <SearchIcon />
              </span>
            </form>

            {/* アカウント */}
            <Link
              href={user ? "/account" : "/login"}
              className="link-quiet flex items-center gap-2"
              aria-label="アカウント"
            >
              <UserIcon />
              <span className="account-name hidden sm:inline md:hidden lg:inline truncate">
                {user ? user.name : "ログイン"}
              </span>
            </Link>

            {/* カート */}
            <Link
              href="/cart"
              className="cart-link relative"
              aria-label="カート"
            >
              <CartIcon />
              {mounted && totalItems > 0 && (
                // リンクが aria-label="カート" を持つので、子の数字は名前に入らない。点数の読み上げ名はバッジ自身に付ける
                <span
                  role="img"
                  aria-label={`カート内 ${totalItems} 点`}
                  className="absolute -top-2 -right-2 badge-count"
                >
                  {totalItems}
                </span>
              )}
            </Link>
          </div>
        </div>
      </div>

      {/* モバイルメニュー */}
      <div
        id="mobile-menu"
        hidden={!menuOpen}
        className="mobile-menu md:hidden animate-fade-in"
      >
        <div className="container-lux py-4 flex flex-col gap-1">
          <form onSubmit={submitSearch} className="relative mb-3">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="商品を検索"
              className="input-lux input-search"
              aria-label="商品を検索"
            />
            <span className="search-icon absolute left-3 top-1/2 -translate-y-1/2">
              <SearchIcon />
            </span>
          </form>
          <Nav
            pathname={pathname}
            // 同じパスのリンク（クエリ違いや今いるページ）を押しても閉じる
            onNavigate={() => setMenuOpen(false)}
            linkClass="mobile-link py-2.5"
          />
        </div>
      </div>
    </header>
  );
}

/* ---- インライン SVG アイコン（外部依存なし） ---- */
function CartIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
    >
      <path d="M6 6h15l-1.5 9h-12z" strokeLinejoin="round" />
      <path d="M6 6L5 3H2" strokeLinecap="round" />
      <circle cx="9" cy="20" r="1.4" />
      <circle cx="18" cy="20" r="1.4" />
    </svg>
  );
}
function UserIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
    >
      <circle cx="12" cy="8" r="3.4" />
      <path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6" strokeLinecap="round" />
    </svg>
  );
}
function SearchIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4-4" strokeLinecap="round" />
    </svg>
  );
}
function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
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
