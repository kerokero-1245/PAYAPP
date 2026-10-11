import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth/server";
import { ORDERS_PATH, loginPathFor } from "@/lib/auth/next-path";
import { getDb } from "@/lib/db/client";
import { formatDate } from "@/lib/format";
import { listAllOrdersByUser } from "@/lib/order-history";
import Section from "@/components/ui/Section";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import Eyebrow from "@/components/ui/Eyebrow";
import Heading from "@/components/ui/Heading";
import Divider from "@/components/ui/Divider";
import EmptyState from "@/components/ui/EmptyState";
import MediaFrame from "@/components/ui/MediaFrame";
import Price from "@/components/ui/Price";

export const metadata: Metadata = { title: "注文履歴" };

/**
 * 注文履歴ページ（サーバ）
 * ---------------------------------------------------
 * ログイン中の利用者の注文だけを、サーバの DB から新しい順に出す（GraphQL の myOrders と同じ lib/order-history.ts を呼ぶ）。
 * ログインせずに買ったゲストの注文は、持ち主がいないのでここには出ない（購入直後の画面の注文番号で確かめる）。
 * 未ログインなら、描画せずに /login?next=/orders へ転送する（ログインしたらここへ戻る）。ブラウザの保存（localStorage）は見ない。
 */
export default async function OrdersPage() {
  const viewer = await getViewer();
  if (!viewer) redirect(loginPathFor(ORDERS_PATH));
  const orders = await listAllOrdersByUser(await getDb(), viewer.id);

  return (
    <Section spacing="md" as="div">
      <PageHeader
        eyebrow="MAISON — ORDER HISTORY"
        title="注文履歴"
        dividerClassName="mt-8 mb-10"
        dividerOutside
      />

      {orders.length === 0 ? (
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
        /* 注文一覧（新しい順） */
        <ul className="flex flex-col gap-5 animate-fade-in">
          {orders.map((order) => (
            <li key={order.orderNo}>
              <Card as="article" padding="sm">
                {/* ヘッダー行: 注文番号 / 日付 / 合計 */}
                <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
                  <div>
                    <Eyebrow size="sm" tone="faint" tracking="sm">
                      ORDER
                    </Eyebrow>
                    <Heading as="p" size="card" className="mt-1">
                      {order.orderNo}
                    </Heading>
                  </div>
                  <div className="text-right">
                    <p className="meta">
                      {formatDate(
                        (order.paidAt ?? order.createdAt).toISOString(),
                      )}
                    </p>
                    <Price
                      as="p"
                      amount={order.total}
                      display
                      size="lg"
                      tone="gold"
                      className="mt-1"
                    />
                  </div>
                </div>

                <Divider className="my-4" />

                {/* サムネイル列（画像がある商品のみ） */}
                {order.items.some((item) => item.image) && (
                  <div className="flex flex-wrap gap-2 mb-4">
                    {order.items
                      .filter((item) => item.image)
                      // 上の filter で image のある品目だけに絞っている
                      .map((item) => (
                        <MediaFrame
                          key={`${order.orderNo}-thumb-${item.id}`}
                          thumb="sm"
                        >
                          <Image
                            src={item.image!}
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
                  {order.items.map((item) => (
                    <li
                      key={`${order.orderNo}-item-${item.id}`}
                      className="flex items-baseline justify-between gap-4"
                    >
                      <span className="order-line-name min-w-0 truncate">
                        {item.name}
                        <span className="order-line-qty">
                          {" "}
                          × {item.quantity}
                        </span>
                      </span>
                      <Price
                        amount={item.price * item.quantity}
                        tone="muted"
                        className="shrink-0"
                      />
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
