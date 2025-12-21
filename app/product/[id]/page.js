"use client";

import Link from "next/link";
import Image from "next/image";
import { useParams } from "next/navigation";
import { useProductStore } from "@/store/productStore";
import { useCartStore } from "@/store/cartStore";

const formatYen = (price) => 
  new Intl.NumberFormat("ja-JP").format(price);

export default function ProductPage() {
  const products = useProductStore((state) => state.products);
  const addItem = useCartStore((state) => state.addItem);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">商品一覧</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
        {products.map((p) => (
          <div
            key={p.id}
            className="border rounded-lg p-4 shadow hover:shadow-md transition"
          >
            <Image
              src={p.image}
              alt={p.name}
              width={300}
              height={200}
              className="rounded"
            />

            <h2 className="mt-2 font-semibold">{p.name}</h2>
            <p className="text-gray-700">
              ¥{formatYen(p.price)}
            </p>

            <div className="flex justify-between mt-4">
              <Link
                href={`/product/${p.id}`}
                className="text-blue-600 underline"
              >
                詳細
              </Link>
              <Link
                href={`/cart`}
                className="text-blue-600 underline"
              >
                カートを見る
              </Link>

              <button
                onClick={() => addItem(p)}
                className="bg-blue-500 text-white px-3 py-1 rounded"
              >
                カートに追加
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
        

