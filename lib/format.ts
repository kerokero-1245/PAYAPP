/** 金額を日本円表記に整形（例: 248000 -> "¥248,000"） */
export const formatYen = (price: number): string =>
  `¥${new Intl.NumberFormat("ja-JP").format(Number(price) || 0)}`;

/**
 * ISO 日付を「2026年7月5日」形式に整形。日本時間の日付にする。
 * 注文履歴はサーバ（Vercel は UTC）で整えるので、環境の時間帯に任せると、日本時間の 0 時〜9 時の注文が前の日の日付で出る。
 */
export const formatDate = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(d);
};
