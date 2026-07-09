import Stripe from "stripe";

/** リクエストごとに Stripe クライアントを生成（キー未設定を分かりやすく検知） */
function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY が設定されていません");
  return new Stripe(key, { apiVersion: "2023-10-16" });
}

export async function POST(request) {
  try {
    const { items } = await request.json();

    if (!Array.isArray(items) || items.length === 0) {
      return Response.json({ error: "カートが空です" }, { status: 400 });
    }

    // 成功 / キャンセルの戻り先はリクエストの origin から動的に決定する。
    // これで localhost でも Vercel でも、環境変数の設定なしに正しく戻れる
    // （NEXT_PUBLIC_BASE_URL はフォールバックとしてのみ利用）。
    const origin =
      request.headers.get("origin") ??
      process.env.NEXT_PUBLIC_BASE_URL ??
      "http://localhost:3000";

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      line_items: items.map((item) => ({
        price_data: {
          currency: "jpy",
          product_data: { name: item.name },
          unit_amount: item.price,
        },
        quantity: item.quantity,
      })),
      success_url: `${origin}/success`,
      cancel_url: `${origin}/cancel`,
    });

    return Response.json({ url: session.url });
  } catch (err) {
    console.error("Checkout error:", err);
    return Response.json(
      { error: "決済セッションの作成に失敗しました" },
      { status: 500 }
    );
  }
}
