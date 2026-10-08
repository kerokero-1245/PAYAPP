"use client";

import Image from "next/image";
import { useOrderStore } from "@/store/orderStore";
import { formatDate } from "@/lib/format";
import { useMounted } from "@/lib/useMounted";
import Section from "@/components/ui/Section";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import Eyebrow from "@/components/ui/Eyebrow";
import Divider from "@/components/ui/Divider";
import EmptyState from "@/components/ui/EmptyState";
import Loading from "@/components/ui/Loading";
import MediaFrame from "@/components/ui/MediaFrame";
import Price from "@/components/ui/Price";

export default function OrdersPage() {
  const orders = useOrderStore((s) => s.orders);

  // persist ストアの hydration ズレを避けるため mounted 後に描画
  const mounted = useMounted();

  return (
    <Section spacing="md" as="div">
      <PageHeader eyebrow="MAISON — ORDER HISTORY" title="注文履歴" dividerClassName="mt-8 mb-10" dividerOutside />

      {/* mounted 前はプレースホルダ（hydration 対策） */}
      {!mounted ? (
        <Loading />
      ) : orders.length === 0 ? (
        /* 空状態 */
        <EmptyState
          framed="card"
          padding="lg"
          className="animate-fade-in"
          title="まだご注文はありません"
          description="気になる一品を見つけて、最初のご注文をお楽しみください。"
          action={{ href: "/product", label: "商品を見る" }}
        />
      ) : (
        /* 注文一覧（ストアが新しい順で保持） */
        <ul className="flex flex-col gap-5 animate-fade-in">
          {orders.map((order) => (
            <li key={order.id}>
              <Card as="article" padding="sm">
                {/* ヘッダー行: 注文番号 / 日付 / 合計 */}
                <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
                  <div>
                    <Eyebrow size="sm" tone="faint" tracking="sm">
                      ORDER
                    </Eyebrow>
                    <p className="heading heading-card mt-1">{order.id}</p>
                  </div>
                  <div className="text-right">
                    <p className="meta">{formatDate(order.date)}</p>
                    <Price as="p" amount={order.total} display size="lg" tone="gold" className="mt-1" />
                  </div>
                </div>

                <Divider className="my-4" />

                {/* サムネイル列（画像がある商品のみ） */}
                {order.items?.some((item) => item.image) && (
                  <div className="flex flex-wrap gap-2 mb-4">
                    {order.items
                      .filter((item) => item.image)
                      .map((item) => (
                        <MediaFrame key={`${order.id}-thumb-${item.id}`} thumb="sm">
                          <Image
                            src={item.image}
                            alt={item.name}
                            fill
                            sizes="56px"
                            className="object-cover"
                          />
                        </MediaFrame>
                      ))}
                  </div>
                )}

                {/* 商品名 × 数量リスト */}
                <ul className="order-lines flex flex-col gap-1.5">
                  {order.items?.map((item) => (
                    <li
                      key={`${order.id}-item-${item.id}`}
                      className="flex items-baseline justify-between gap-4"
                    >
                      <span className="order-line-name min-w-0 truncate">
                        {item.name}
                        <span className="order-line-qty">
                          {" "}
                          × {item.quantity}
                        </span>
                      </span>
                      <Price amount={item.price * item.quantity} tone="muted" className="shrink-0" />
                    </li>
                  ))}
                </ul>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
