import Link from "next/link";

export const metadata = { title: "ページが見つかりません" };

/** 存在しない URL・存在しない商品（/product/999 など）用の 404 ページ（サイトの配色・書体に合わせた日本語版） */
export default function NotFound() {
  return (
    <div className="container-lux py-24 text-center max-w-xl animate-fade-up">
      <p className="eyebrow">404 — Not Found</p>
      <h1 className="font-display text-3xl md:text-4xl text-cream mt-4">
        ページが見つかりませんでした
      </h1>
      <span className="rule-gold mt-6" />
      <p className="text-muted mt-6 leading-relaxed">
        お探しのページ・商品は、移動または販売を終了したか、URL が誤っている可能性がございます。
      </p>
      <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
        <Link href="/" className="btn btn-gold">
          トップへ戻る
        </Link>
        <Link href="/product" className="btn btn-outline">
          商品一覧を見る
        </Link>
      </div>
    </div>
  );
}
