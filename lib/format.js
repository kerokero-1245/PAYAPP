/** 金額を日本円表記に整形（例: 248000 -> "¥248,000"） */
export const formatYen = (price) =>
  `¥${new Intl.NumberFormat("ja-JP").format(Number(price) || 0)}`;

/** ISO 日付を「2026年7月5日」形式に整形 */
export const formatDate = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(d);
};