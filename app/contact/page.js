import Section from "@/components/ui/Section";
import PageHeader from "@/components/ui/PageHeader";
import ContactForm from "./ContactForm";

export const metadata = {
  title: "お問い合わせ",
  description: "ご注文・商品・配送についてのお問い合わせ（デモ）。",
};

/** お問い合わせ（/contact）。フォームは送信も保存もしないデモ */
export default function ContactPage() {
  return (
    <Section spacing="md">
      <PageHeader eyebrow="Contact" title="お問い合わせ" dividerClassName="mt-8 mb-10" />
      <div className="max-w-2xl">
        <ContactForm />
      </div>
    </Section>
  );
}
