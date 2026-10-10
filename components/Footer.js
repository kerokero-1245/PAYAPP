import Link from "next/link";
import Eyebrow from "@/components/ui/Eyebrow";
import Divider from "@/components/ui/Divider";

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
        { href: "/about", label: "ブランドストーリー" },
        { href: "/shipping", label: "配送について" },
        { href: "/contact", label: "お問い合わせ" },
      ],
    },
  ];

  /** 下段の小さなリンク（4 列の grid に 5 列目を足すと md で窮屈になるため、ここに並べる） */
  const legalLinks = [
    { href: "/legal", label: "特定商取引法に基づく表記" },
    { href: "/privacy", label: "プライバシーポリシー" },
    { href: "/faq", label: "よくある質問" },
  ];

  return (
    <footer className="site-footer mt-24">
      <div className="container-lux py-14">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10">
          {/* ブランド */}
          <div>
            <p className="brand mb-3">MAISON</p>
            <p className="lead lead-sm max-w-xs">
              選び抜かれた逸品だけを集めた、ラグジュアリー・オンラインストア。
            </p>
            <div className="footer-social mt-5 flex gap-4">
              <span aria-hidden className="footer-social-item">Instagram</span>
              <span aria-hidden className="footer-social-item">X</span>
            </div>
          </div>

          {cols.map((col) => (
            <div key={col.title}>
              <Eyebrow as="h4" className="mb-4">{col.title}</Eyebrow>
              <ul className="flex flex-col gap-2.5">
                {col.links.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="footer-link">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <Divider className="my-10" />

        <div className="footer-legal flex flex-col sm:flex-row items-center justify-between gap-3">
          <p>© 2026 MAISON (PAYAPP). All rights reserved.</p>
          <nav aria-label="規約とご案内" className="flex flex-wrap justify-center gap-x-5 gap-y-2">
            {legalLinks.map((l) => (
              <Link key={l.href} href={l.href} className="footer-legal-link">
                {l.label}
              </Link>
            ))}
          </nav>
          <p className="footer-tagline">Crafted with care</p>
        </div>
      </div>
    </footer>
  );
}