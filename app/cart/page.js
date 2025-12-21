"use client";

import { useCartStore } from "@/store/cartStore";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { loadStripe } from "@stripe/stripe-js";
import { useState } from "react";

export default function CartPage() {
  const [loading, setLoading] = useState(false); 
  const router = useRouter();
  const { items, removeItem, updateQuantity } = useCartStore();
  const totalPrice = useCartStore((state) => state.totalPrice());

  if (items.length === 0) {
    return(
      <div>
       <p>カートは空です。</p>
       <Link href="/product/" className="text-blue-600 underline">製品一覧へ戻る</Link>
      </div>
    );
  }

  const handleCheckout = async () => {
    setLoading(true);

    try {
      const res = await fetch("/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    });

    const data = await res.json();
    if (!data.url) {
      throw new Error("Checkout URL が取得できません");
    }
    window.location.href = data.url;

    } catch (e) {
      console.error("Checkout error:", e);
      alert("決済処理に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1>カート</h1>
      {items.map((item) => (
        <div key={item.id} className="border p-4 my-2">
          <p>{item.name}</p>
          <p>¥{item.price}</p>
          <h2>合計金額: ¥{totalPrice}</h2>


          <input
            type="number"
            min="1"
            value={item.quantity}
            onChange={(e) =>
              updateQuantity(item.id, Number(e.target.value))
            }
            className="border px-2 w-16"
          />

          <button
            className="text-red-500 ml-4"
            onClick={() => removeItem(item.id)}
          >
            削除
          </button>
        </div>
      ))}
      <button
        onClick={handleCheckout}
        disabled={loading}
        className={`px-4 py-2 ${
        loading ? "bg-gray-400" : "bg-green-500"
      } text-white`}
      >
        {loading ? "Stripeへ移動中..." : "購入する"}
      </button>
      <button
        onClick={() => router.back()}
        className="text-blue-600 underline"
      >
        前の画面へ戻る
      </button>
    </div>
  );
}
