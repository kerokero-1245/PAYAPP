import Section from "@/components/ui/Section";
import PageHeader from "@/components/ui/PageHeader";
import InfoList from "@/components/ui/InfoList";
import DemoNote from "@/components/ui/DemoNote";
import { POLICIES, TEST_MODE_NOTE } from "@/lib/policies.mjs";

export const metadata = {
  title: "特定商取引法に基づく表記",
  description: "販売事業者・支払方法・返品などの表記（デモ）。",
};

/** 事業者の情報は架空のものも作らない（実在の情報と誤認されないように） */
const NOT_LISTED = "デモのため記載していません";

const ITEMS = [
  { term: "販売事業者", desc: NOT_LISTED },
  { term: "運営責任者", desc: NOT_LISTED },
  { term: "所在地", desc: NOT_LISTED },
  { term: "連絡先", desc: `${NOT_LISTED}。ご質問はお問い合わせページ（デモ）からどうぞ。` },
  { term: "販売価格", desc: "各商品ページに表示した価格（税込）" },
  { term: "商品代金以外の費用", desc: `送料はかかりません（${POLICIES.shippingFee}）` },
  { term: "支払方法", desc: `クレジットカード（Stripe の決済ページ。${TEST_MODE_NOTE}）` },
  { term: "支払時期", desc: "ご注文の確定時" },
  { term: "引渡時期", desc: `ご注文の確定から${POLICIES.deliveryDays}` },
  { term: "返品・交換", desc: `${POLICIES.returns}（${POLICIES.returnWindow}、${POLICIES.returnCondition}）` },
];

/** 特定商取引法に基づく表記（/legal） */
export default function LegalPage() {
  return (
    <Section spacing="md">
      <PageHeader eyebrow="Legal Notice" title="特定商取引法に基づく表記" dividerClassName="mt-8 mb-10" />
      <div className="max-w-3xl">
        <DemoNote>このサイトはポートフォリオ用のデモで、実際の販売は行っていません。事業者の情報は記載していません。</DemoNote>
        <InfoList items={ITEMS} className="mt-8" />
      </div>
    </Section>
  );
}
