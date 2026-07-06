import { create } from "zustand";

/**
 * 商品カタログを管理する Zustand ストア
 *
 * - カタログは静的なモックデータ（将来的に API 連携へ差し替える想定）
 * - 商品は「ソースデータ」であってユーザー状態ではないため persist しない
 *   （persist すると旧 localStorage の古いカタログで上書きされてしまう）
 */

/** カテゴリ定義（サイドメニュー・絞り込みで共有） */
export const CATEGORIES = [
  { slug: "all", label: "すべて", jp: "All" },
  { slug: "watches", label: "時計", jp: "Watches" },
  { slug: "leather", label: "レザー", jp: "Leather" },
  { slug: "fragrance", label: "フレグランス", jp: "Fragrance" },
  { slug: "jewelry", label: "ジュエリー", jp: "Jewelry" },
];

const img = (seed) => `https://picsum.photos/seed/${seed}/900/1100`;

/** ラグジュアリー・カタログ（モック） */
const PRODUCTS = [
  {
    id: "1",
    name: "Éclat Automatic 41",
    price: 248000,
    category: "watches",
    tagline: "スイス製自動巻きムーブメント",
    description:
      "サファイアクリスタルとサンレイダイヤルが織りなす端正な佇まい。41mm ケースに自社開発の自動巻きムーブメントを搭載し、日常から特別な一日までを静かに彩ります。",
    badge: "NEW",
    images: [img("watch1a"), img("watch1b"), img("watch1c")],
  },
  {
    id: "2",
    name: "Noir Chronograph",
    price: 312000,
    category: "watches",
    tagline: "マットブラック・クロノグラフ",
    description:
      "PVD 加工のブラックケースに、視認性を追求したクロノグラフ機構。無駄を削ぎ落としたダイヤルが、腕元に静かな存在感を宿します。",
    badge: "LIMITED",
    images: [img("watch2a"), img("watch2b"), img("watch2c")],
  },
  {
    id: "3",
    name: "Heritage Leather Tote",
    price: 86000,
    category: "leather",
    tagline: "フルグレイン・ベジタブルタンニンレザー",
    description:
      "熟練の職人が一点ずつ仕立てるトートバッグ。使うほどに深まる艶と経年変化を愉しめる、生涯の相棒となる一品です。",
    images: [img("tote3a"), img("tote3b"), img("tote3c")],
  },
  {
    id: "4",
    name: "Bifold Wallet — Cognac",
    price: 42000,
    category: "leather",
    tagline: "手縫いのコニャックレザー",
    description:
      "薄さと収納力を両立した二つ折りウォレット。コバまで丁寧に磨き上げられた縁が、上質な手触りを約束します。",
    badge: "NEW",
    images: [img("wallet4a"), img("wallet4b"), img("wallet4c")],
  },
  {
    id: "5",
    name: "Ambre Noir — Eau de Parfum",
    price: 26800,
    category: "fragrance",
    tagline: "アンバー & サンダルウッド",
    description:
      "夜の帳を思わせる、深く温かなアンバーノート。時間とともに立ち上るサンダルウッドが、記憶に残る余韻を残します。50ml。",
    images: [img("perf5a"), img("perf5b"), img("perf5c")],
  },
  {
    id: "6",
    name: "Blanc Cèdre — Eau de Parfum",
    price: 24800,
    category: "fragrance",
    tagline: "シダーウッド & ホワイトムスク",
    description:
      "清廉なシダーウッドに、柔らかなホワイトムスクを重ねた一本。性別を問わず纏える、洗練されたシグネチャーです。50ml。",
    images: [img("perf6a"), img("perf6b"), img("perf6c")],
  },
  {
    id: "7",
    name: "Solitaire Gold Ring",
    price: 168000,
    category: "jewelry",
    tagline: "18K イエローゴールド",
    description:
      "一粒石を高く掲げる、普遍のソリテールリング。18K ゴールドの温もりある輝きが、指先に永遠の煌めきを添えます。",
    badge: "LIMITED",
    images: [img("ring7a"), img("ring7b"), img("ring7c")],
  },
  {
    id: "8",
    name: "Fine Chain Necklace",
    price: 94000,
    category: "jewelry",
    tagline: "18K ゴールド・フィリグリーチェーン",
    description:
      "繊細に編み込まれたフィリグリーチェーン。重ね付けにも映える、日常に寄り添うファインジュエリーです。",
    images: [img("neck8a"), img("neck8b"), img("neck8c")],
  },
  {
    id: "9",
    name: "Cuir Card Holder",
    price: 21000,
    category: "leather",
    tagline: "スリムカードホルダー",
    description:
      "厳選したレザーを一枚革で仕立てた、極薄のカードホルダー。ミニマルを愛する人へ贈る、静かな贅沢。",
    images: [img("card9a"), img("card9b"), img("card9c")],
  },
  {
    id: "10",
    name: "Onyx Cufflinks",
    price: 58000,
    category: "jewelry",
    tagline: "オニキス & ゴールドプレート",
    description:
      "漆黒のオニキスをあしらったカフリンクス。フォーマルな装いに、控えめでいて確かな品格を添えます。",
    images: [img("cuff10a"), img("cuff10b"), img("cuff10c")],
  },
];

export const useProductStore = create(() => ({
  products: PRODUCTS,
  categories: CATEGORIES,
}));

/** id から商品を取得（詳細ページ等で使用） */
export const getProductById = (id) =>
  useProductStore.getState().products.find((p) => p.id === id);