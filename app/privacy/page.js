import Section from "@/components/ui/Section";
import PageHeader from "@/components/ui/PageHeader";
import SectionHeading from "@/components/ui/SectionHeading";
import InfoList from "@/components/ui/InfoList";

export const metadata = {
  title: "プライバシーポリシー",
  description: "このデモが保存する情報と、その扱い。",
};

/** ブラウザに保存するもの（store/*.js の persist の name と同じ） */
const STORAGE = [
  { term: "cart-storage", desc: "カートに入れた商品の id と数量。価格や商品名は保存せず、表示のたびにカタログから引き直します。" },
  { term: "order-storage", desc: "決済の確認が取れた注文（注文番号・日時・品目・金額）。注文履歴の表示に使います。" },
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
            lead="次の情報は、お使いのブラウザの localStorage にだけ保存します。サーバには送りません。ブラウザのサイトデータを消すと削除されます。"
          />
          <InfoList items={STORAGE} className="mt-8" />
        </section>

        <SectionHeading
          align="start"
          eyebrow="Payment"
          title="お支払い"
          lead="お支払いは Stripe の決済ページで行います（このサイトはテストモードです）。カード番号などはこのサイトでは受け取らず、Stripe が扱います。決済の後は、注文の内容を確かめるために決済の番号（session_id）を Stripe に問い合わせます。"
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
