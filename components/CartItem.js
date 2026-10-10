"use client";

import Link from "next/link";
import Image from "next/image";
import { useCartStore } from "@/store/cartStore";
import { MAX_QUANTITY } from "@/lib/cart.mjs";
import MediaFrame from "@/components/ui/MediaFrame";
import Eyebrow from "@/components/ui/Eyebrow";
import Price from "@/components/ui/Price";
import QuantityStepper from "@/components/ui/QuantityStepper";

/**
 * カート内の1商品を表す行コンポーネント
 *
 * @param {{ item: object }} props
 */
export default function CartItem({ item }) {
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const removeItem = useCartStore((s) => s.removeItem);

  const dec = () => updateQuantity(item.id, item.quantity - 1);
  const inc = () => updateQuantity(item.id, item.quantity + 1);

  return (
    <div className="cart-row flex gap-4 py-5">
      {/* サムネイル */}
      <MediaFrame as={Link} href={`/product/${item.id}`} thumb="md">
        {item.image && (
          <Image src={item.image} alt={item.name} fill sizes="80px" className="object-cover" />
        )}
      </MediaFrame>

      {/* 詳細 */}
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="flex justify-between gap-3">
          <div className="min-w-0">
            <Link
              href={`/product/${item.id}`}
              className="type-display heading heading-item heading-link block truncate"
            >
              {item.name}
            </Link>
            {item.category && (
              <Eyebrow size="sm" tone="faint" tracking="sm" className="mt-0.5">
                {item.category}
              </Eyebrow>
            )}
          </div>
          <button
            type="button"
            onClick={() => removeItem(item.id)}
            className="remove-btn shrink-0"
            aria-label={`${item.name} を削除`}
          >
            削除
          </button>
        </div>

        <div className="mt-auto pt-3 flex items-end justify-between gap-3">
          {/* 数量ステッパー */}
          <QuantityStepper
            size="sm"
            value={item.quantity}
            max={MAX_QUANTITY}
            onDecrement={dec}
            onIncrement={inc}
            label={`${item.name} の`}
          />

          {/* 小計 */}
          <div className="text-right">
            <Price as="p" amount={item.price * item.quantity} tone="cream" wide />
            {item.quantity > 1 && (
              <Price as="p" amount={item.price} size="xs" tone="faint" suffix={<> × {item.quantity}</>} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
