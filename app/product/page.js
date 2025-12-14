"use client";

import Link from "next/link";
import HeroSlider from "@/components/HeroSlider";
import SideMenu from "@/components/SideMenu";
import { useProductStore } from "@/store/productStore";
import { useCartStore } from "@/store/cartStore";

export default function ProductListPage() {
  const products = useProductStore((state) => state.products);
  const addItem = useCartStore((state) => state.addItem);

  return (
    <>
      <HeroSlider />

      <div className="flex">
        <SideMenu />

        <main className="flex-1 p-6">
          <h1 className="text-2xl font-bold mb-6">商品一覧</h1>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
            {products.map((p) => (
              <div
                key={p.id}
                className="bg-white rounded shadow hover:shadow-lg transition"
              >

                <img
                  src={p.image}
                  alt={p.name}
                  className="h-48 w-full object-cover rounded-t"
                />

                <div className="p-4">
                  <p className="font-semibold">{p.name}</p>
                  <p>¥{p.price}</p>

                  <div className="flex justify-between mt-3">
                    <Link
                      href={`/product/${p.id}`}
                      className="text-blue-600 underline"
                    >
                      詳細を見る
                    </Link>


                    <button
                      onClick={() => addItem(p)}
                      className="bg-blue-500 text-white px-3 py-1 rounded"
                    >
                      カートに追加
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </main>
      </div>
    </>
  );
}
