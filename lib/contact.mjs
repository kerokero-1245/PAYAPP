/**
 * お問い合わせフォームの検証（純粋関数）。
 * ---------------------------------------------------
 * フォーム（app/contact/ContactForm.js）とテスト（tests/contact.test.mjs）の両方から使う。
 * このサイトはデモなので、検証が通っても送信・保存はしない（フォーム側で「送信済み」表示に切り替えるだけ）。
 */

/** 種別の選択肢 */
export const CONTACT_TOPICS = [
  { value: "product", label: "商品について" },
  { value: "order", label: "ご注文について" },
  { value: "shipping", label: "配送について" },
  { value: "other", label: "その他" },
];

/** 文字数の上限・下限 */
export const CONTACT_LIMITS = {
  nameMax: 50,
  emailMax: 254,
  messageMin: 10,
  messageMax: 1000,
};

/** 入力欄の並び（先頭のエラー欄へフォーカスを移すときの順番） */
export const CONTACT_FIELDS = ["name", "email", "topic", "orderId", "message"];

/** フォームの初期値 */
export const EMPTY_CONTACT = { name: "", email: "", topic: "product", orderId: "", message: "" };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** 注文番号（決済成功ページが作る ORD-<英大文字と数字>） */
const ORDER_ID_RE = /^ORD-[0-9A-Z]+$/;

/** 文字数（サロゲートペアを 1 文字に数える） */
const length = (s) => [...s].length;

/**
 * 1 項目を検証する。問題が無ければ undefined、あればエラー文言。
 * @param {"name" | "email" | "topic" | "orderId" | "message"} field
 * @param {Partial<typeof EMPTY_CONTACT>} values
 */
export function validateContactField(field, values) {
  const v = String(values?.[field] ?? "").trim();
  switch (field) {
    case "name":
      if (!v) return "お名前を入力してください";
      if (length(v) > CONTACT_LIMITS.nameMax) return `お名前は ${CONTACT_LIMITS.nameMax} 文字以内で入力してください`;
      return undefined;
    case "email":
      if (!v) return "メールアドレスを入力してください";
      if (length(v) > CONTACT_LIMITS.emailMax || !EMAIL_RE.test(v)) return "メールアドレスの形式が正しくありません";
      return undefined;
    case "topic":
      if (!CONTACT_TOPICS.some((t) => t.value === v)) return "お問い合わせの種別を選んでください";
      return undefined;
    case "orderId":
      if (v && !ORDER_ID_RE.test(v.toUpperCase())) return "注文番号は「ORD-」で始まる形式で入力してください";
      return undefined;
    case "message": {
      const n = length(v);
      if (!v) return "お問い合わせ内容を入力してください";
      if (n < CONTACT_LIMITS.messageMin) return `お問い合わせ内容は ${CONTACT_LIMITS.messageMin} 文字以上で入力してください`;
      if (n > CONTACT_LIMITS.messageMax) return `お問い合わせ内容は ${CONTACT_LIMITS.messageMax} 文字以内で入力してください`;
      return undefined;
    }
    default:
      return undefined;
  }
}

/**
 * 全項目を検証する。
 * @param {Partial<typeof EMPTY_CONTACT>} values
 * @returns {{ ok: boolean, errors: Partial<Record<string, string>> }}
 */
export function validateContact(values) {
  const errors = {};
  for (const field of CONTACT_FIELDS) {
    const error = validateContactField(field, values);
    if (error) errors[field] = error;
  }
  return { ok: Object.keys(errors).length === 0, errors };
}
