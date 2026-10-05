import { notFound } from "next/navigation";
import { PRODUCTS, getProductById } from "@/lib/catalog.mjs";
import { SITE_DESCRIPTION, SITE_NAME, SITE_OPEN_GRAPH } from "@/lib/site.mjs";
import ProductDetail from "./ProductDetail";

/**
 * カタログに無い id は page を描かずに 404（app/not-found.js）にする。
 * page の中で notFound() を投げる形だと、Next.js 16.0.8 では 404 の本文が
 * サーバの HTML に入らず、ブラウザ側でだけ描かれるため（本番ビルドで確認）。
 */
export const dynamicParams = false;

/** カタログの商品はビルド時に静的生成する */
export function generateStaticParams() {
  return PRODUCTS.map((p) => ({ id: p.id }));
}

/** タイトルと OGP は商品ごと（「Éclat Automatic 41 | MAISON」） */
export async function generateMetadata({ params }) {
  const { id } = await params;
  const product = getProductById(id);
  if (!product) return { title: "ページが見つかりません" };
  const description = product.tagline ?? SITE_DESCRIPTION;
  return {
    title: product.name,
    description,
    openGraph: {
      ...SITE_OPEN_GRAPH,
      title: `${product.name} | ${SITE_NAME}`,
      description,
    },
  };
}

/**
 * 商品詳細ページ（サーバ）
 * 存在しない id は上の dynamicParams = false で 404 になる。notFound() は念のための保険
 * （開発サーバでは dynamicParams に関わらずここを通る）。
 */
export default async function ProductDetailPage({ params }) {
  const { id } = await params;
  if (!getProductById(id)) notFound();
  return <ProductDetail id={id} />;
}
