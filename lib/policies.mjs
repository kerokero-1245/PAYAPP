/**
 * 配送・保証・返品の約束（商品詳細の DETAILS・配送ページ・よくある質問・特商法の表記で共有する）。
 * 文面を 1 か所にまとめ、ページごとに食い違わないようにする。
 */
export const POLICIES = {
  shippingFee: "全国送料無料",
  deliveryDays: "2〜4営業日でお届け",
  giftWrap: "ギフトラッピング承ります",
  warranty: "2年間の国際保証付き",
  returns: "30日間の返品保証",
};

/** 商品詳細の DETAILS の箇条書き */
export const PRODUCT_DETAIL_POINTS = [
  `${POLICIES.shippingFee} ・ ${POLICIES.deliveryDays}`,
  POLICIES.giftWrap,
  POLICIES.warranty,
  POLICIES.returns,
];
