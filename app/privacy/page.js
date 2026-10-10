import Section from "@/components/ui/Section";
import PageHeader from "@/components/ui/PageHeader";
import SectionHeading from "@/components/ui/SectionHeading";
import InfoList from "@/components/ui/InfoList";
import { TEST_MODE_NOTE } from "@/lib/policies";

export const metadata = {
  title: "プライバシーポリシー",
  description: "このデモが保存する情報と、その扱い。",
};

/**
 * ブラウザに保存するもの（store/*.js の persist の name と同じ）。
 * 中身は実際の localStorage を書き出して確かめた値（カートは lib/cart.ts の行、注文は app/success の記録）
 */
const STORAGE = [
  {
    term: "cart-storage",
    desc: "カートに入れた商品の id・商品名・価格・画像の URL・カテゴリ・数量。表示のたびに id でカタログから引き直すため、保存された価格や商品名は使いません。",
  },
  {
    term: "order-storage",
    desc: "決済の確認が取れた注文（注文番号・日時・品目の id・商品名・単価・数量・画像の URL・カテゴリ・合計金額）と、同じ注文を二重に記録しないための Stripe の決済の番号（session_id）。注文履歴の表示に使います。",
  },
  { term: "auth-storage", desc: "デモのログインで入力したメールアドレスと表示名。パスワードは扱いません。" },
];

/** プライバシーポリシー（/privacy）。このデモが実際に保存・送信するものだけを書く */
export default function PrivacyPage() {
  return (
    <Section spacing="md">
      <PageHeader eyebrow="Privacy Policy" title="プライバシーポリシー" dividerClassName="mt-8 mb-10" />

      <div className="flex flex-col gap-14 max-w-3xl">
        <section>
          <SectionHeading
            align="start"
            eyebrow="Browser Storage"
            title="ブラウザに保存するもの"
            lead="次の情報は、お使いのブラウザの localStorage に保存します。ブラウザのサイトデータを消すと削除されます。購入手続きでは、カートの商品の id と数量を /api/graphql 経由で Stripe に送ります（価格と商品名はサーバがカタログから引きます）。"
          />
          <InfoList items={STORAGE} className="mt-8" />
        </section>

        <SectionHeading
          align="start"
          eyebrow="Payment"
          title="お支払い"
          lead={`お支払いは Stripe の決済ページで行います（${TEST_MODE_NOTE}）。カード番号などはこのサイトでは受け取らず、Stripe が扱います。決済の後は、注文の内容を確かめるために決済の番号（session_id）を Stripe に問い合わせます。`}
        />

        <SectionHeading
          align="start"
          eyebrow="Contact"
          title="お問い合わせ"
          lead="お問い合わせフォームの入力内容は、どこにも送信・保存しません。送信ボタンを押すと、入力内容の確認を画面に表示するだけです。"
        />
      </div>
    </Section>
  );
}
