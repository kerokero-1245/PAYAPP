import Link from "next/link";

/** サイト共通フッター */
export default function Footer() {
  const cols = [
    {
      title: "ショップ",
      links: [
        { href: "/product", label: "すべての商品" },
        { href: "/product?category=watches", label: "時計" },
        { href: "/product?category=leather", label: "レザー" },
        { href: "/product?category=fragrance", label: "フレグランス" },
        { href: "/product?category=jewelry", label: "ジュエリー" },
      ],
    },
    {
      title: "アカウント",
      links: [
        { href: "/login", label: "ログイン" },
        { href: "/orders", label: "注文履歴" },
        { href: "/cart", label: "カート" },
      ],
    },
    {
      title: "メゾンについて",
      links: [
        { href: "/", label: "ブランドストーリー" },
        { href: "/", label: "配送について" },
        { href: "/", label: "お問い合わせ" },
      ],
    },
  ];

  return (
    <footer className="mt-24 border-t border-line bg-ink-2">
      <div className="container-lux py-14">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10">
          {/* ブランド */}
          <div>
            <p className="font-display text-2xl tracking-[0.18em] text-cream mb-3">MAISON</p>
            <p className="text-sm text-muted leading-relaxed max-w-xs">
              選び抜かれた逸品だけを集めた、ラグジュアリー・オンラインストア。
            </p>
            <div className="mt-5 flex gap-4 text-faint">
              <span aria-hidden className="hover:text-gold transition-colors cursor-pointer">Instagram</span>
              <span aria-hidden className="hover:text-gold transition-colors cursor-pointer">X</span>
            </div>
          </div>

          {cols.map((col) => (
            <div key={col.title}>
              <h4 className="eyebrow mb-4">{col.title}</h4>
              <ul className="space-y-2.5">
                {col.links.map((l, i) => (
                  <li key={`${l.label}-${i}`}>
                    <Link href={l.href} className="text-sm text-muted hover:text-cream transition-colors">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="hairline my-10" />

        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-faint">
          <p>© 2026 MAISON (PAYAPP). All rights reserved.</p>
          <p className="tracking-widest uppercase">Crafted with care</p>
        </div>
      </div>
    </footer>
  );
}