// app/api/checkout/route.js
import Stripe from "stripe";
import { NextResponse } from "next/server";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2023-10-16",
});

export async function POST(req) {
  try {
    const { items } = await req.json(); // カートの中身

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: items.map((item) => ({
        price_data: {
          currency: "jpy",
          product_data: {
            name: item.name,
          },
          unit_amount: item.price,
        },
        quantity: item.quantity,
      })),
      success_url: `${process.env.NEXT_PUBLIC_BASE_URL}/success`,
      cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL}/cart`,
    });

    return NextResponse.json({ id: session.id });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
