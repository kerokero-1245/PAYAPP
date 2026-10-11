// 決済確認（GET /api/checkout/session）の本体 verifyCheckoutSession のテスト。サーバは起動せず、Stripe にも外部の DB にも通信しない。実行: npm test
//
// なぜあるか: 成功ページはこの応答だけで「ご購入ありがとうございます」を出し、購入分をカートから外す。
// 確認ルートは決済を fulfillCheckout（Webhook と同じ関数）で DB に確定してから、DB の注文を返す。
// ここでは次を固定する。
//  - 支払い済みなら、metadata とカタログから作った注文が DB に 1 件でき、その注文（注文番号つき）を返す
//  - 支払い済みでなければ、注文を返さず、DB にも何も書かない（未払いの session に注文を返すと、払っていない注文が確定する）
//  - Webhook が先でも、成功ページが先でも、同時でも、注文は 1 件で、どちらも同じ注文番号を受け取る
//  - DB に確定できなければ、確認できなかったこと（500）を返す
// DB は PGlite をテストごとにメモリ上に立て（lib/db/test-helpers.ts）、Stripe は偽物を差し込む。
import { test } from "node:test";
import assert from "node:assert/strict";

import { getProductById } from "../lib/catalog.ts";
import { verifyCheckoutSession } from "../lib/checkout-session.ts";
import type { Db } from "../lib/db/connect.ts";
import { orders } from "../lib/db/schema.ts";
import { seedProducts } from "../lib/db/seed.ts";
import { withTestDb } from "../lib/db/test-helpers.ts";
import { handleStripeWebhook } from "../lib/stripe-webhook.ts";
import type { ItemQuantity } from "../lib/types.ts";
import { captureConsole } from "./support/console.ts";
import { NOTHING, counts } from "./support/orders.ts";
import {
  STRIPE_ERROR_TEXT,
  fakeStripe,
  paidSession,
  totalOf,
} from "./support/stripe.ts";
import {
  WEBHOOK_SECRET,
  constructEvent,
  sessionEvent,
  webhookRequest,
} from "./support/webhook.ts";

const BASE_URL = "http://localhost/api/checkout/session";

/** 確認ルートへの GET（session_id が無いときは null を渡す） */
function url(sessionId: string | null): string {
  return sessionId === null
    ? BASE_URL
    : `${BASE_URL}?session_id=${encodeURIComponent(sessionId)}`;
}

type FakeStripe = ReturnType<typeof fakeStripe>;

/** 確認ルートを呼ぶ（本番と同じ引数。Stripe は偽物、DB はテスト用） */
function verify(stripe: FakeStripe, db: Db, sessionId: string | null) {
  return verifyCheckoutSession({
    requestUrl: url(sessionId),
    getStripe: stripe.getStripe,
    getDb: async () => db,
  });
}

/** 応答を読む（status・本文・Cache-Control） */
async function read(response: Response) {
  return {
    status: response.status,
    cacheControl: response.headers.get("cache-control"),
    body: (await response.json()) as {
      paid?: boolean;
      order?: {
        orderNo: string;
        sessionId: string;
        items: unknown[];
        total: number;
      };
      error?: string;
    },
  };
}

const BOUGHT: ItemQuantity[] = [
  { id: "1", quantity: 2 },
  { id: "5", quantity: 1 },
];

test("決済確認: 支払い済みの session は、DB に確定した注文（metadata とカタログから作った品目・単価・数量・合計と注文番号）を返す", () =>
  withTestDb(async ({ db }) => {
    await seedProducts(db);
    const stripe = fakeStripe({
      cs_test_paid: paidSession("cs_test_paid", BOUGHT),
    });

    const res = await read(await verify(stripe, db, "cs_test_paid"));

    // 単価・商品名・画像・カテゴリは session ではなくカタログの値（金額をテストに直書きしない）
    const items = BOUGHT.map(({ id, quantity }) => {
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
    assert.equal(res.status, 200);
    assert.equal(res.cacheControl, "no-store");
    assert.ok(res.body.paid === true && res.body.order);
    assert.match(res.body.order.orderNo, /^ORD-[0-9A-Z]{10}$/);
    assert.deepEqual(res.body, {
      paid: true,
      order: {
        orderNo: res.body.order.orderNo,
        sessionId: "cs_test_paid",
        items,
        total: totalOf(BOUGHT),
      },
    });
    assert.deepEqual(stripe.retrieved, ["cs_test_paid"]);

    // 返した注文は DB にある。ブラウザではなくサーバに 1 件できている
    const [row, ...others] = await db.select().from(orders);
    assert.deepEqual(others, []);
    assert.equal(row.orderNo, res.body.order.orderNo);
    assert.equal(row.stripeSessionId, "cs_test_paid");
    assert.equal(row.total, totalOf(BOUGHT));
    assert.deepEqual(await counts(db), {
      orders: 1,
      orderItems: BOUGHT.length,
      stripeEvents: 0,
    });
  }));

test("決済確認: 支払い済みでなければ注文を返さず、DB にも書かない（未払い・存在しない・形が不正・Stripe の失敗・読めない metadata）", () =>
  withTestDb(async ({ db }) => {
    await seedProducts(db);
    const stripe = fakeStripe({
      cs_test_unpaid: paidSession(
        "cs_test_unpaid",
        [{ id: "1", quantity: 1 }],
        {
          // 未払いでも metadata は付いている。これを見て注文を作ってはいけない
          payment_status: "unpaid",
        },
      ),
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
        read(await verify(stripe, db, sessionId));

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
        !JSON.stringify(failed.body).includes(STRIPE_ERROR_TEXT),
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

    // どの場合も、DB には何も書かない
    assert.deepEqual(await counts(db), NOTHING);
  }));

test("決済確認: 同じ決済を何度確認しても（成功ページの再読み込み）、同じ注文番号を返し、注文は 1 件のまま", () =>
  withTestDb(async ({ db }) => {
    await seedProducts(db);
    const stripe = fakeStripe({
      cs_test_paid: paidSession("cs_test_paid", BOUGHT),
    });

    const first = await read(await verify(stripe, db, "cs_test_paid"));
    const second = await read(await verify(stripe, db, "cs_test_paid"));
    const third = await read(await verify(stripe, db, "cs_test_paid"));

    assert.equal(first.status, 200);
    assert.deepEqual(second.body, first.body);
    assert.deepEqual(third.body, first.body);
    assert.deepEqual(await counts(db), {
      orders: 1,
      orderItems: BOUGHT.length,
      stripeEvents: 0,
    });
    assert.deepEqual(
      stripe.retrieved,
      ["cs_test_paid"],
      "確定済みなら Stripe に問い合わせない",
    );
  }));

test("決済確認: Webhook が先に確定していれば、Stripe に問い合わせずに、その注文を返す", () =>
  withTestDb(async ({ db }) => {
    await seedProducts(db);
    const stripe = fakeStripe({
      cs_test_paid: paidSession("cs_test_paid", BOUGHT),
    });

    const webhook = await handleStripeWebhook(
      webhookRequest(
        sessionEvent("checkout.session.completed", "cs_test_paid"),
      ),
      {
        constructEvent,
        secret: WEBHOOK_SECRET,
        getDb: async () => db,
        getStripe: stripe.getStripe,
      },
    );
    assert.equal(webhook.status, 200);
    const [row] = await db.select().from(orders);

    const res = await read(await verify(stripe, db, "cs_test_paid"));

    assert.equal(res.status, 200);
    assert.ok(res.body.paid === true && res.body.order);
    assert.equal(res.body.order.orderNo, row.orderNo, "Webhook が作った注文");
    assert.deepEqual(await counts(db), {
      orders: 1,
      orderItems: BOUGHT.length,
      stripeEvents: 1,
    });
    assert.deepEqual(stripe.retrieved, ["cs_test_paid"]);
  }));

test("Webhook と成功ページが同時に来ても、注文は 1 件で、どちらが先でも成功ページは DB の注文番号を受け取る", async () => {
  for (const firstToArrive of ["webhook", "success"] as const) {
    await withTestDb(async ({ db }) => {
      await seedProducts(db);
      // 2 つとも「DB にまだ注文が無い」と見てから、そろって書き込みに進む（偽の Stripe が両方の到着を待つ）
      const stripe = fakeStripe(
        { cs_test_paid: paidSession("cs_test_paid", BOUGHT) },
        { waitFor: 2 },
      );
      const callWebhook = () =>
        handleStripeWebhook(
          webhookRequest(
            sessionEvent("checkout.session.completed", "cs_test_paid"),
          ),
          {
            constructEvent,
            secret: WEBHOOK_SECRET,
            getDb: async () => db,
            getStripe: stripe.getStripe,
          },
        );
      const callSuccess = () => verify(stripe, db, "cs_test_paid");

      // 先に呼んだ方が先に DB を見る
      let webhookPending: Promise<Response>;
      let successPending: Promise<Response>;
      if (firstToArrive === "webhook") {
        webhookPending = callWebhook();
        successPending = callSuccess();
      } else {
        successPending = callSuccess();
        webhookPending = callWebhook();
      }
      const [webhook, success] = await Promise.all([
        webhookPending,
        successPending,
      ]);

      assert.equal(webhook.status, 200, firstToArrive);
      const res = await read(success);
      assert.equal(res.status, 200, firstToArrive);
      assert.ok(res.body.paid === true && res.body.order);
      const [row, ...others] = await db.select().from(orders);
      assert.deepEqual(others, [], `${firstToArrive} が先: 注文は 1 件`);
      assert.equal(
        res.body.order.orderNo,
        row.orderNo,
        `${firstToArrive} が先: 成功ページが受け取った番号は DB の注文`,
      );
      assert.deepEqual(await counts(db), {
        orders: 1,
        orderItems: BOUGHT.length,
        stripeEvents: 1,
      });
    });
  }
});

test("決済確認: DB に確定できなければ 500 で注文を返さず（全部取り消す）、直したあとに確認し直せば確定する", () =>
  withTestDb(async ({ db }) => {
    // products を seed していない = 明細の外部キーを満たせない
    const stripe = fakeStripe({
      cs_test_paid: paidSession("cs_test_paid", BOUGHT),
    });
    const savedError = console.error;
    console.error = () => {};
    try {
      const failed = await read(await verify(stripe, db, "cs_test_paid"));
      assert.equal(failed.status, 500);
      assert.equal(failed.body.paid, false);
      assert.ok(!("order" in failed.body));
      assert.deepEqual(await counts(db), NOTHING, "半端な注文を残さない");
    } finally {
      console.error = savedError;
    }

    await seedProducts(db);
    const retried = await read(await verify(stripe, db, "cs_test_paid"));
    assert.equal(retried.status, 200);
    assert.ok(retried.body.paid === true);
    assert.equal((await counts(db)).orders, 1);
  }));

test("決済確認: DB に繋げなければ 500 で返し、接続の例外文を応答に出さず、Stripe も呼ばない", async () => {
  const stripe = fakeStripe({
    cs_test_paid: paidSession("cs_test_paid", BOUGHT),
  });
  const savedError = console.error;
  console.error = () => {};
  try {
    const res = await read(
      await verifyCheckoutSession({
        requestUrl: url("cs_test_paid"),
        getStripe: stripe.getStripe,
        getDb: async () => {
          throw new Error(`connect ECONNREFUSED ${STRIPE_ERROR_TEXT}`);
        },
      }),
    );
    assert.equal(res.status, 500);
    assert.equal(res.body.paid, false);
    assert.ok(!JSON.stringify(res.body).includes("ECONNREFUSED"));
    assert.deepEqual(stripe.retrieved, []);
  } finally {
    console.error = savedError;
  }
});

test("決済確認: 請求額・通貨が注文の合計と合わない決済は 500（確認できなかった）で注文を返さず、DB に何も書かない。値を含まない記録は 1 件", () =>
  withTestDb(async ({ db }) => {
    await seedProducts(db);
    const stripe = fakeStripe({
      cs_test_drift: paidSession("cs_test_drift", BOUGHT, {
        amount_total: totalOf(BOUGHT) + 100,
      }),
    });

    const capture = captureConsole();
    let res: Awaited<ReturnType<typeof read>>;
    try {
      res = await read(await verify(stripe, db, "cs_test_drift"));
    } finally {
      capture.restore();
    }
    assert.equal(res.status, 500);
    assert.equal(res.body.paid, false);
    assert.ok(!("order" in res.body));
    assert.equal(res.cacheControl, "no-store");
    assert.deepEqual(await counts(db), NOTHING);
    assert.deepEqual(
      capture.events().map(({ event, sessionId, field }) => ({
        event,
        sessionId,
        field,
      })),
      [
        {
          event: "fulfillment.payment-mismatch",
          sessionId: "cs_test_drift",
          field: "amount_total",
        },
      ],
    );
  }));

test("決済確認: Stripe が知らない session（利用者が好きな id を送れる経路）は、警告の記録を残さない", () =>
  withTestDb(async ({ db }) => {
    await seedProducts(db);
    const stripe = fakeStripe({});
    const capture = captureConsole();
    let res: Awaited<ReturnType<typeof read>>;
    try {
      res = await read(await verify(stripe, db, "cs_test_missing"));
    } finally {
      capture.restore();
    }
    assert.deepEqual(res.body, { paid: false });
    assert.deepEqual(capture.lines, []);
  }));
