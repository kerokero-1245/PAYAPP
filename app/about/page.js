import Section from "@/components/ui/Section";
import PageHeader from "@/components/ui/PageHeader";
import SectionHeading from "@/components/ui/SectionHeading";
import Actions from "@/components/ui/Actions";
import Button from "@/components/ui/Button";
import PledgeGrid from "@/components/PledgeGrid";

export const metadata = {
  title: "ブランドストーリー",
  description: "MAISON が選ぶ品と、その基準について。",
};

/** 段落（はじまり・選ぶ基準・職人） */
const CHAPTERS = [
  {
    eyebrow: "Origin",
    title: "はじまり",
    body: "MAISON は「長く使うほどに愛着が深まるものだけを届けたい」という思いから生まれた、架空のセレクトストアです。流行を追うのではなく、十年後も手に取りたくなる品を、ひとつずつ選んでいます。",
  },
  {
    eyebrow: "Selection",
    title: "選ぶ基準",
    body: "素材の確かさ、仕立ての丁寧さ、修理しながら使い続けられること。この三つを満たすものだけをコレクションに加えます。見た目の華やかさよりも、毎日の手ざわりと使い心地を大切にしています。",
  },
  {
    eyebrow: "Craft",
    title: "職人とともに",
    body: "時計・レザー・フレグランス・ジュエリー、それぞれの分野で手仕事を続ける作り手の品を扱っています。一点ずつ検品し、上質な化粧箱にお包みしてお届けします。",
  },
];

/**
 * ブランドストーリー（/about）
 * ※ ポートフォリオ用の架空のブランドです。実在の会社・人物とは関係ありません。
 */
export default function AboutPage() {
  return (
    <Section spacing="md">
      <PageHeader eyebrow="Our Story" title="ブランドストーリー" dividerClassName="mt-8 mb-10" />

      <div className="flex flex-col gap-12 max-w-2xl">
        {CHAPTERS.map((c) => (
          <SectionHeading key={c.title} align="start" eyebrow={c.eyebrow} title={c.title} lead={c.body} />
        ))}
      </div>

      {/* 約束の帯の h3 が最後の章（職人とともに）の小見出しにならないよう、帯の前に h2 を置く（見た目は変えない） */}
      <section className="mt-16" aria-labelledby="pledges-heading">
        <h2 id="pledges-heading" className="sr-only">
          私たちの約束
        </h2>
        <PledgeGrid />
      </section>

      <Actions align="start" className="mt-12">
        <Button href="/product">コレクションを見る</Button>
        <Button href="/shipping" variant="outline">
          配送について
        </Button>
      </Actions>
    </Section>
  );
}
