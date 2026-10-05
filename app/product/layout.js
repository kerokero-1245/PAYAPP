// 商品一覧（/product）のタイトル。ページ本体は "use client" で metadata を書けないため、ここで指定する。
// 子（商品詳細）のタイトルにも「| MAISON」を付けるため、template も持たせる。
export const metadata = {
  title: { default: "ショップ", template: "%s | MAISON" },
};

export default function Layout({ children }) {
  return children;
}
