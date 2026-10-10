// 決済確認（GET /api/checkout/session）の本体 verifyCheckoutSession のテスト。サーバは起動せず、Stripe にも通信しない。実行: npm test
//
// なぜあるか: 確認ルートは getStripe() を直接呼んでいて、支払い済みの経路（session の metadata とカタログから
// 注文を作って返す）が単体でも E2E でも通っていなかった。本体を lib/checkout-session.ts に出して Stripe を
// 差し込める形にしたので、「支払い済みなら注文を返す」「支払い済みでなければ注文を返さない」を固定する。
// 成功ページはこの応答だけで注文を記録するため、未払いの session に注文を返すと、払っていない注文が履歴に残る。
import { test } from "node:test";
import assert from "node:assert/strict";

import { getProductById } from "../lib/catalog.ts";
import { encodeOrderMetadata } from "../lib/checkout.ts";
import { verifyCheckoutSession } from "../lib/checkout-session.ts";

const BASE_URL = "http://localhost/api/checkout/session";
const SECRET = "sk_live_SECRET_DETAIL stack at Stripe.request";

/** 確認ルートへの GET（session_id が無いときは null を渡す） */
function url(sessionId: string | null): string {
  return sessionId === null
    ? BASE_URL
    : `${BASE_URL}?session_id=${encodeURIComponent(sessionId)}`;
}

/** retrieve に渡された id を記録し、session id ごとに用意した応答を返す偽の Stripe（create は呼ばれない） */
function fakeStripe(sessions: Record<string, unknown>) {
  const retrieved: string[] = [];
  return {
    retrieved,
    getStripe: () => ({
      checkout: {
        sessions: {
          async create(): Promise<{ url: string | null }> {
            throw new Error("決済確認で sessions.create は呼ばれないはず");
          },
          async retrieve(id: string) {
            retrieved.push(id);
            if (id in sessions) return sessions[id];
            if (id === "cs_test_missing")
              throw Object.assign(new Error("No such session"), {
                statusCode: 404,
              });
            throw Object.assign(new Error(SECRET), { statusCode: 500 });
          },
        },
      },
    }),
  };
}

/** 応答を読む（status・本文・Cache-Control） */
async function read(response: Response) {
  return {
    status: response.status,
    cacheControl: response.headers.get("cache-control"),
    body: (await response.json()) as {
      paid?: boolean;
      order?: unknown;
      error?: string;
    },
  };
}

test("決済確認: 支払い済みの session は、metadata とカタログから作った注文を返す", async () => {
  const bought = [
    { id: "1", quantity: 2 },
    { id: "5", quantity: 1 },
  ];
  const stripe = fakeStripe({
    cs_test_paid: {
      id: "cs_test_paid",
      payment_status: "paid",
      metadata: encodeOrderMetadata(bought),
    },
  });

  const res = await read(
    await verifyCheckoutSession({
      requestUrl: url("cs_test_paid"),
      getStripe: stripe.getStripe,
    }),
  );

  // 単価・商品名・画像・カテゴリは session ではなくカタログの値（金額をテストに直書きしない）
  const items = bought.map(({ id, quantity }) => {
    const product = getProductById(id)!;
    return {
      id,
      name: product.name,
      price: product.price,
      quantity,
      image: product.images[0],
      category: product.category,
    };
  });
  const total = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  assert.equal(res.status, 200);
  assert.equal(res.cacheControl, "no-store");
  assert.deepEqual(res.body, {
    paid: true,
    order: { sessionId: "cs_test_paid", items, total },
  });
  assert.deepEqual(stripe.retrieved, ["cs_test_paid"]);
});

test("決済確認: 支払い済みでなければ注文を返さない（未払い・存在しない・形が不正・Stripe の失敗・読めない metadata）", async () => {
  const stripe = fakeStripe({
    cs_test_unpaid: {
      id: "cs_test_unpaid",
      payment_status: "unpaid",
      // 未払いでも metadata は付いている。これを見て注文を作ってはいけない
      metadata: encodeOrderMetadata([{ id: "1", quantity: 1 }]),
    },
    cs_test_broken: {
      id: "cs_test_broken",
      payment_status: "paid",
      metadata: {},
    },
  });
  const savedError = console.error;
  console.error = () => {};
  try {
    const ask = async (sessionId: string | null) =>
      read(
        await verifyCheckoutSession({
          requestUrl: url(sessionId),
          getStripe: stripe.getStripe,
        }),
      );

    // 未払い・存在しない session: 200 { paid: false }（買い直してよい）
    for (const sessionId of ["cs_test_unpaid", "cs_test_missing"]) {
      const res = await ask(sessionId);
      assert.equal(res.status, 200, sessionId);
      assert.deepEqual(res.body, { paid: false }, sessionId);
      assert.equal(res.cacheControl, "no-store", sessionId);
    }

    // 形が不正な session_id（無い・cs_ で始まらない）: 400 で、Stripe を呼ばない
    const calledBefore = stripe.retrieved.length;
    for (const sessionId of [null, "bad", "pi_123", ""]) {
      const res = await ask(sessionId);
      assert.equal(res.status, 400, String(sessionId));
      assert.equal(res.body.paid, false, String(sessionId));
      assert.ok(!("order" in res.body), String(sessionId));
    }
    assert.equal(
      stripe.retrieved.length,
      calledBefore,
      "形が不正な session_id で Stripe を呼んだ",
    );

    // Stripe の失敗: 502 で、例外の中身（秘密を含みうる）を返さない
    const failed = await ask("cs_test_boom");
    assert.equal(failed.status, 502);
    assert.equal(failed.body.paid, false);
    assert.ok(!("order" in failed.body));
    assert.ok(
      !JSON.stringify(failed.body).includes(SECRET),
      JSON.stringify(failed.body),
    );

    // 支払い済みでも metadata から注文を作れない: 500 で、注文を返さない
    const broken = await ask("cs_test_broken");
    assert.equal(broken.status, 500);
    assert.equal(broken.body.paid, false);
    assert.ok(!("order" in broken.body));
  } finally {
    console.error = savedError;
  }
});
