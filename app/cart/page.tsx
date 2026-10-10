"use client";

import { useState } from "react";
import Link from "next/link";
import CartItem from "@/components/CartItem";
import { useCartStore } from "@/store/cartStore";
import { useMounted } from "@/lib/useMounted";
import { createCheckoutSession } from "@/lib/graphql/client";
import Section from "@/components/ui/Section";
import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";
import Card from "@/components/ui/Card";
import Heading from "@/components/ui/Heading";
import Divider from "@/components/ui/Divider";
import Price from "@/components/ui/Price";
import Button from "@/components/ui/Button";
import Loading from "@/components/ui/Loading";

export default function CartPage() {
  const items = useCartStore((s) => s.items);
  const totalPrice = useCartStore((s) => s.totalPrice());
  const totalItems = useCartStore((s) => s.totalItems());

  const mounted = useMounted();
  const [loading, setLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  // GraphQL の createCheckoutSession → url → Stripe へ遷移。失敗したらサーバが返した理由を出す
  const handleCheckout = async () => {
    setLoading(true);
    setCheckoutError(null);
    try {
      // 価格と商品名はサーバがカタログから引くので、id と数量だけを送る
      const result = await createCheckoutSession(
        items.map(({ id, quantity }) => ({ id, quantity })),
      );
      if (!("url" in result)) {
        setCheckoutError(
          result.error ??
            "決済処理に失敗しました。時間をおいてもう一度お試しください",
        );
        setLoading(false);
        return;
      }
      window.location.href = result.url;
    } catch {
      setCheckoutError(
        "通信に失敗しました。時間をおいてもう一度お試しください",
      );
      setLoading(false);
    }
  };

  // hydration 対策: persist ストアの動的値が固まるまでは簡易スケルトンを出す
  if (!mounted) {
    return (
      <Section spacing="sm" as="div">
        <PageHeader
          animate={false}
          eyebrow="SHOPPING CART"
          title="カート"
          titleClassName="mt-2"
          dividerClassName="mt-6"
        />
        <Loading className="mt-10" />
      </Section>
    );
  }

  // 空カート状態
  if (items.length === 0) {
    return (
      <Section spacing="sm" as="div">
        <EmptyState
          className="max-w-md mx-auto animate-fade-up"
          icon={
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="34"
              height="34"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.25"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
              <path d="M3 6h18" />
              <path d="M16 10a4 4 0 0 1-8 0" />
            </svg>
          }
          eyebrow="SHOPPING CART"
          title="カートは空です"
          titleAs="h1"
          titleSize="page"
          titleClassName="mt-3"
          description="まだ商品が追加されていません。コレクションから、あなたにふさわしい一品をお選びください。"
          descriptionClassName="mt-4"
          action={{
            href: "/product",
            label: "コレクションを見る",
            variant: "outline",
          }}
        />
      </Section>
    );
  }

  // カート中身
  return (
    <Section spacing="sm" as="div">
      <PageHeader
        eyebrow="SHOPPING CART"
        title={
          <>
            カート
            <span className="title-meta ml-3">（{totalItems}点）</span>
          </>
        }
        titleClassName="mt-2"
        dividerClassName="mt-6"
      />

      {/* grid-cols-1（minmax(0,1fr)）で、長い商品名が列幅を押し広げて横スクロールが出るのを防ぐ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 mt-8">
        {/* 左: 商品リスト */}
        <div className="lg:col-span-2">
          {items.map((item) => (
            <CartItem key={item.id} item={item} />
          ))}
        </div>

        {/* 右: 注文サマリー（合計は map 外・1回だけ） */}
        <aside className="lg:col-span-1">
          <Card variant="panel" padding="sm" className="sticky top-24">
            <Heading size="card">注文サマリー</Heading>
            <Divider className="my-5" />

            <dl className="summary-list flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <dt className="summary-term">小計（{totalItems}点）</dt>
                <Price as="dd" amount={totalPrice} tone="cream" tabular />
              </div>
              <div className="flex items-center justify-between">
                <dt className="summary-term">送料</dt>
                <dd className="summary-free">無料</dd>
              </div>
            </dl>

            <Divider className="my-5" />

            <div className="flex items-baseline justify-between">
              <span className="summary-total-label">合計</span>
              <Price
                amount={totalPrice}
                display
                size="xl"
                tone="gold"
                tabular
              />
            </div>

            <Button
              block
              onClick={handleCheckout}
              disabled={loading}
              className="mt-6"
            >
              {loading ? "Stripeへ移動中…" : "購入手続きへ"}
            </Button>

            {checkoutError && (
              <p role="alert" className="form-error mt-3">
                {checkoutError}
              </p>
            )}

            <Link
              href="/product"
              className="link-quiet link-quiet-sm block text-center mt-4"
            >
              買い物を続ける
            </Link>

            <p className="summary-note mt-5 text-center">
              決済は Stripe の安全な決済ページで行われます。
            </p>
          </Card>
        </aside>
      </div>
    </Section>
  );
}
