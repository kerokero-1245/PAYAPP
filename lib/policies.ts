/**
 * 配送・保証・返品・お支払いの約束の文面（商品詳細の DETAILS・配送ページ・よくある質問・特商法の表記・
 * プライバシーポリシー・約束の帯・ヘッダーのアナウンスで共有する）。
 * 文面はここ 1 か所にだけ書き、ページはここから組み立てる（ページごとに食い違わないように）。
 */

/** 返品を受け付ける日数 */
export const RETURN_DAYS = 30;

export const POLICIES = {
  shippingFee: "全国送料無料",
  deliveryDays: "2〜4営業日でお届け",
  giftWrap: "ギフトラッピング承ります",
  /** 化粧箱での包装 */
  giftBox: "上質な化粧箱で丁寧にお包みします",
  /** 保証の範囲と中身（範囲は全商品。商品詳細の DETAILS は全商品にこの文を出す） */
  warrantyScope: "全商品",
  warranty: "2年間の国際保証付き",
  returns: `${RETURN_DAYS}日間の返品保証`,
  /** 返品の期限と条件（「お届けから 30 日以内」「未使用のものに限ります」） */
  returnWindow: `お届けから ${RETURN_DAYS} 日以内`,
  returnCondition: "未使用のものに限ります",
};

/** 決済がテストモードであることの注記（特商法の表記・よくある質問・プライバシーポリシー） */
export const TEST_MODE_NOTE =
  "このサイトはテストモードのため、実際の請求は発生しません";

/** 商品詳細の DETAILS の箇条書き */
export const PRODUCT_DETAIL_POINTS = [
  `${POLICIES.shippingFee} ・ ${POLICIES.deliveryDays}`,
  POLICIES.giftWrap,
  POLICIES.warranty,
  POLICIES.returns,
];

/** 約束の帯（components/PledgeGrid.tsx）の説明文のうち、配送・保証・包装の約束 */
export const PLEDGE_TEXT = {
  shipping: "全国どこでも送料無料でお届け。",
  warranty: "全品に国際保証と真正性を保証。",
  giftBox: `${POLICIES.giftBox}。`,
};

/** ヘッダーのアナウンスバー */
export const ANNOUNCEMENT = `${POLICIES.shippingFee} — 選び抜かれた逸品を、あなたのもとへ`;
