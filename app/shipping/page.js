import Section from "@/components/ui/Section";
import PageHeader from "@/components/ui/PageHeader";
import SectionHeading from "@/components/ui/SectionHeading";
import InfoList from "@/components/ui/InfoList";
import Actions from "@/components/ui/Actions";
import Button from "@/components/ui/Button";
import { POLICIES } from "@/lib/policies";

export const metadata = {
  title: "配送について",
  description: "送料・お届け日数・ギフト包装・返品について。",
};

const DELIVERY = [
  { term: "送料", desc: `${POLICIES.shippingFee}。ご注文の金額・点数にかかわらず送料はいただきません。` },
  { term: "お届け日数", desc: `ご注文の確定から${POLICIES.deliveryDays}します（土日祝を除く）。` },
  { term: "ギフト包装", desc: `${POLICIES.giftWrap}。${POLICIES.giftBox}。` },
];

const AFTER = [
  { term: "保証", desc: `${POLICIES.warrantyScope}が${POLICIES.warranty}です。` },
  { term: "返品", desc: `${POLICIES.returns}。${POLICIES.returnWindow}で、${POLICIES.returnCondition}。` },
  { term: "お問い合わせ", desc: "配送・返品についてのご質問は、お問い合わせページからご連絡ください（デモ）。" },
];

/** 配送について（/shipping）。文面は lib/policies.ts の約束と同じものを使う */
export default function ShippingPage() {
  return (
    <Section spacing="md">
      <PageHeader eyebrow="Shipping & Returns" title="配送について" dividerClassName="mt-8 mb-10" />

      <div className="flex flex-col gap-14 max-w-3xl">
        <section>
          <SectionHeading align="start" eyebrow="Delivery" title="お届けについて" />
          <InfoList items={DELIVERY} className="mt-8" />
        </section>
        <section>
          <SectionHeading align="start" eyebrow="Warranty & Returns" title="保証と返品" />
          <InfoList items={AFTER} className="mt-8" />
        </section>
      </div>

      <Actions align="start" className="mt-12">
        <Button href="/contact">お問い合わせ</Button>
        <Button href="/faq" variant="outline">
          よくある質問
        </Button>
      </Actions>
    </Section>
  );
}
