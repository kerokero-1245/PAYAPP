import type { Metadata } from "next";
import Section from "@/components/ui/Section";
import PageHeader from "@/components/ui/PageHeader";
import SectionHeading from "@/components/ui/SectionHeading";
import FaqItem from "@/components/ui/FaqItem";
import Actions from "@/components/ui/Actions";
import Button from "@/components/ui/Button";
import { POLICIES, TEST_MODE_NOTE } from "@/lib/policies";

export const metadata: Metadata = {
  title: "よくある質問",
  description: "ご注文・お支払い・配送についてのよくある質問。",
};

const GROUPS = [
  {
    eyebrow: "Order",
    title: "ご注文について",
    items: [
      {
        q: "注文の内容はどこで確かめられますか？",
        a: "ログインして購入し、決済が確認できた注文は「注文履歴」に表示されます。注文履歴はサーバに保存されるため、別の端末やブラウザでも、同じアカウントでログインすれば見られます。ログインせずに購入した注文は注文履歴には表示されないので、購入直後の画面に出る注文番号をお控えください。",
      },
      {
        q: "ログインしないと購入できませんか？",
        a: "ログインしなくてもカートに入れて購入手続きへ進めます。ログインするには、メールアドレスとパスワードで新規登録してください。",
      },
    ],
  },
  {
    eyebrow: "Payment",
    title: "お支払いについて",
    items: [
      {
        q: "どの支払い方法が使えますか？",
        a: `Stripe の決済ページでのクレジットカード払いです。${TEST_MODE_NOTE}。`,
      },
      {
        q: "テスト用のカード番号はありますか？",
        a: "Stripe のテストカード 4242 4242 4242 4242（有効期限は未来の日付、セキュリティコードは任意の 3 桁）が使えます。",
      },
      {
        q: "決済の画面から戻ったら「確認が取れていません」と出ました。",
        a: "通信の状況などで支払いの確認ができなかったときの表示です。二重に購入せず、少し時間をおいて「もう一度確認する」を押してください。",
      },
    ],
  },
  {
    eyebrow: "Shipping",
    title: "配送・返品について",
    items: [
      { q: "送料はかかりますか？", a: `${POLICIES.shippingFee}です。` },
      {
        q: "どのくらいで届きますか？",
        a: `ご注文の確定から${POLICIES.deliveryDays}します。`,
      },
      {
        q: "返品はできますか？",
        a: `${POLICIES.returns}があります。${POLICIES.returnWindow}で、${POLICIES.returnCondition}。`,
      },
    ],
  },
];

/** よくある質問（/faq）。開閉は <details> で JS を使わない */
export default function FaqPage() {
  return (
    <Section spacing="md">
      <PageHeader
        eyebrow="FAQ"
        title="よくある質問"
        dividerClassName="mt-8 mb-10"
      />

      <div className="flex flex-col gap-14 max-w-3xl">
        {GROUPS.map((g) => (
          <section key={g.title}>
            <SectionHeading align="start" eyebrow={g.eyebrow} title={g.title} />
            <div className="mt-6">
              {g.items.map((item) => (
                <FaqItem key={item.q} question={item.q}>
                  {item.a}
                </FaqItem>
              ))}
            </div>
          </section>
        ))}
      </div>

      <Actions align="start" className="mt-12">
        <Button href="/contact">お問い合わせ</Button>
        <Button href="/shipping" variant="outline">
          配送について
        </Button>
      </Actions>
    </Section>
  );
}
