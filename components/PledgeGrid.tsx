import Card from "@/components/ui/Card";
import Heading from "@/components/ui/Heading";
import { PLEDGE_TEXT } from "@/lib/policies";

/** ブランドの約束（上品なラインアイコン）。トップとブランドストーリーで共有する */
const PLEDGES = [
  {
    title: "匠の品質",
    desc: "熟練の職人が一点ずつ仕立てる逸品。",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="pledge-svg"
        aria-hidden="true"
      >
        <path d="M6 3h12l3 6-9 12L3 9l3-6Z" />
        <path d="M3 9h18M9 3 6 9l6 12M15 3l3 6-6 12" />
      </svg>
    ),
  },
  {
    title: "無料配送",
    desc: PLEDGE_TEXT.shipping,
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="pledge-svg"
        aria-hidden="true"
      >
        <path d="M3 7h11v9H3zM14 10h4l3 3v3h-7z" />
        <circle cx="7" cy="18" r="1.6" />
        <circle cx="17.5" cy="18" r="1.6" />
      </svg>
    ),
  },
  {
    title: "正規保証",
    desc: PLEDGE_TEXT.warranty,
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="pledge-svg"
        aria-hidden="true"
      >
        <path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6l-7-3Z" />
        <path d="m9 12 2 2 4-4" />
      </svg>
    ),
  },
  {
    title: "ギフト包装",
    desc: PLEDGE_TEXT.giftBox,
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="pledge-svg"
        aria-hidden="true"
      >
        <path d="M4 9h16v11H4zM4 9V7h16v2M12 9v11" />
        <path d="M12 9c-1.5-3-6-3-6 0h6Zm0 0c1.5-3 6-3 6 0h-6Z" />
      </svg>
    ),
  },
];

/** 約束の帯（パネルの中に 1〜4 列） */
export default function PledgeGrid() {
  return (
    <Card variant="panel" className="pledge-band">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10">
        {PLEDGES.map((item) => (
          <div
            key={item.title}
            className="flex flex-col items-center text-center gap-3"
          >
            <span className="pledge-icon">{item.icon}</span>
            <Heading as="h3" size="item">
              {item.title}
            </Heading>
            <p className="lead lead-sm pledge-text">{item.desc}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}
