import Link from "next/link";

export default function CancelPage() {
  return (
    <div className="container-lux py-24 text-center max-w-xl mx-auto animate-fade-up">
      {/* ゴールドのキャンセルマーク（円 + ×） */}
      <div className="flex justify-center">
        <svg
          className="text-gold"
          width="88"
          height="88"
          viewBox="0 0 88 88"
          fill="none"
          aria-hidden="true"
        >
          <circle
            cx="44"
            cy="44"
            r="40"
            stroke="currentColor"
            strokeWidth="1.5"
            opacity="0.5"
          />
          <path
            d="M32 32 L56 56 M56 32 L32 56"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </div>

      <p className="eyebrow mt-8">MAISON</p>

      <h1 className="font-display text-3xl md:text-4xl text-cream mt-4">
        決済がキャンセルされました
      </h1>

      <div className="flex justify-center mt-5">
        <span className="rule-gold" />
      </div>

      <p className="text-muted leading-relaxed mt-6">
        お支払いは完了していません。ご請求は発生しておりませんのでご安心ください。
        カートの内容はそのまま保持されていますので、いつでもお手続きを再開いただけます。
      </p>

      <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-10">
        <Link href="/cart" className="btn btn-gold">
          カートに戻る
        </Link>
        <Link href="/product" className="btn btn-outline">
          買い物を続ける
        </Link>
      </div>
    </div>
  );
}