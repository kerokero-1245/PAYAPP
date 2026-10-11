// Stripe の Webhook（POST /api/stripe/webhook の本体 handleStripeWebhook）のテスト。実行: npm test
//
// なぜあるか: Webhook は Stripe が決済のあとに呼ぶ、認証のない公開の入口。ここで固定するのは次の点。
//  - 署名が合わないものは 400 で、DB にも Stripe にも触れない（秘密が未設定なら 503）
//  - 同じイベントが 2 回（同時でも）届いても、注文は 1 件
//  - 未払いのものは注文にしない。本文の金額や品目は信じず、Stripe から取り直した session で決める
//  - 失敗したイベントは「処理済み」にならず、Stripe の再送で拾い直せる
// 署名は Stripe のライブラリで本物を作り、検証も本物の constructEvent で行う（秘密は固定のダミー）。
// DB は PGlite をテストごとにメモリ上に立て、Stripe は偽物を差し込む。外部には通信しない。
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import type { Db } from "../lib/db/connect.ts";
import { orderItems, orders, stripeEvents } from "../lib/db/schema.ts";
import { seedProducts } from "../lib/db/seed.ts";
import { withTestDb } from "../lib/db/test-helpers.ts";
import {
  FULFILLMENT_EVENT_TYPES,
  MAX_WEBHOOK_BODY_BYTES,
  createWebhookDeps,
  handleStripeWebhook,
  parseWebhookEvent,
} from "../lib/stripe-webhook.ts";
import type { WebhookDeps } from "../lib/stripe-webhook.ts";
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
  WEBHOOK_URL,
  constructEvent,
  sessionEvent,
  webhookRequest,
} from "./support/webhook.ts";

const COMPLETED = "checkout.session.completed";
const ASYNC_SUCCEEDED = "checkout.session.async_payment_succeeded";
const BOUGHT: ItemQuantity[] = [
  { id: "1", quantity: 2 },
  { id: "5", quantity: 1 },
];

// このファイルのテストは、失敗の経路で console.error を出す（本番のログ）。出力を静かにして、出た内容を logged に集める
const logged: string[] = [];
const savedConsoleError = console.error;
before(() => {
  console.error = (...args: unknown[]) => {
    logged.push(
      args.map((a) => (a instanceof Error ? a.message : String(a))).join(" "),
    );
  };
});
after(() => {
  console.error = savedConsoleError;
});

type FakeStripe = ReturnType<typeof fakeStripe>;

/** 本番と同じ依存（署名検証は本物）に、テストの DB と偽の Stripe を差し込む */
function depsFor(
  db: Db,
  stripe: FakeStripe,
  overrides: Partial<WebhookDeps> = {},
): WebhookDeps {
  return {
    constructEvent,
    secret: WEBHOOK_SECRET,
    getDb: async () => db,
    getStripe: stripe.getStripe,
    ...overrides,
  };
}

type WebhookBody = { received?: boolean; result?: string; error?: string };

/** Webhook を呼んで、status と本文を読む */
async function send(request: Request, deps: WebhookDeps) {
  const response = await handleStripeWebhook(request, deps);
  return {
    status: response.status,
    body: (await response.json()) as WebhookBody,
  };
}

const ONE_ORDER = { orders: 1, orderItems: BOUGHT.length, stripeEvents: 1 };

/* ---------- イベントの読み取り（純粋な関数） ---------- */

test("parseWebhookEvent: 対象は 2 種だけで、取り出すのはイベント id と Checkout Session の id。形が違えば不正", () => {
  assert.deepEqual([...FULFILLMENT_EVENT_TYPES].sort(), [
    ASYNC_SUCCEEDED,
    COMPLETED,
  ]);
  for (const type of [COMPLETED, ASYNC_SUCCEEDED]) {
    assert.deepEqual(
      parseWebhookEvent(sessionEvent(type, "cs_test_a", "evt_test_a")),
      { kind: "fulfill", eventId: "evt_test_a", sessionId: "cs_test_a" },
      type,
    );
  }

  // 対象外の種類は、データの形に関係なく無視する（片付けて 2xx を返す）
  for (const type of [
    "checkout.session.expired",
    "checkout.session.async_payment_failed",
    "payment_intent.succeeded",
    "charge.refunded",
  ]) {
    assert.deepEqual(
      parseWebhookEvent({ id: "evt_test_a", type, data: null }),
      { kind: "ignore", type },
      type,
    );
  }

  // 不正: オブジェクトでない・id や type が無い/形が違う・対象なのに session の id が取れない
  const withData = (data: unknown) => ({
    id: "evt_test_a",
    type: COMPLETED,
    data,
  });
  const invalid: unknown[] = [
    null,
    undefined,
    "checkout.session.completed",
    42,
    [],
    {},
    { type: COMPLETED, data: { object: { id: "cs_test_a" } } },
    { id: "evt_test_a", data: { object: { id: "cs_test_a" } } },
    { id: 5, type: COMPLETED, data: { object: { id: "cs_test_a" } } },
    { id: "cs_test_a", type: COMPLETED, data: { object: { id: "cs_test_a" } } },
    { id: "evt_", type: COMPLETED, data: { object: { id: "cs_test_a" } } },
    { id: "evt_test_a", type: 7 },
    withData(undefined),
    withData(null),
    withData("cs_test_a"),
    withData({}),
    withData({ object: null }),
    withData({ object: [] }),
    withData({ object: {} }),
    withData({ object: { id: 1 } }),
    withData({ object: { id: "pi_123" } }),
    withData({ object: { id: "bad" } }),
    withData({ object: { id: `cs_${"a".repeat(300)}` } }),
  ];
  for (const event of invalid) {
    assert.deepEqual(
      parseWebhookEvent(event),
      { kind: "invalid" },
      JSON.stringify(event),
    );
  }
});

/* ---------- 注文を確定する ---------- */

test("Webhook: 署名つきの checkout.session.completed で、支払い済みの session から注文を 1 件確定する", () =>
  withTestDb(async ({ db }) => {
    await seedProducts(db);
    const stripe = fakeStripe({
      cs_test_paid: paidSession("cs_test_paid", BOUGHT),
    });

    const res = await send(
      webhookRequest(sessionEvent(COMPLETED, "cs_test_paid", "evt_test_1")),
      depsFor(db, stripe),
    );

    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { received: true, result: "fulfilled" });
    const [order, ...others] = await db.select().from(orders);
    assert.deepEqual(others, []);
    assert.equal(order.stripeSessionId, "cs_test_paid");
    assert.equal(order.status, "paid");
    assert.equal(order.total, totalOf(BOUGHT));
    assert.equal(order.userId, null, "未ログインの購入（ゲスト）");
    assert.match(order.orderNo, /^ORD-[0-9A-Z]{10}$/);
    assert.deepEqual(await counts(db), ONE_ORDER);
    assert.deepEqual(
      (await db.select().from(stripeEvents)).map((row) => row.id),
      ["evt_test_1"],
    );
    assert.deepEqual(stripe.retrieved, ["cs_test_paid"]);
  }));

test("Webhook: イベントの本文の金額・支払い状態・品目は信じず、Stripe から取り直した session で決める", () =>
  withTestDb(async ({ db }) => {
    await seedProducts(db);
    const stripe = fakeStripe({
      // Stripe の答えは「未払い」。本文は「支払い済み・品目 1 を 99 点・金額 1 円」と言い張る
      cs_test_liar: paidSession("cs_test_liar", BOUGHT, {
        payment_status: "unpaid",
      }),
      // Stripe の答えは「支払い済み・BOUGHT」。本文は「未払い・metadata 無し」と言い張る
      cs_test_real: paidSession("cs_test_real", BOUGHT),
    });
    const deps = depsFor(db, stripe);

    const liar = await send(
      webhookRequest(
        sessionEvent(COMPLETED, "cs_test_liar", "evt_test_liar", {
          payment_status: "paid",
          amount_total: 1,
          metadata: { order_items_0: "1:99" },
        }),
      ),
      deps,
    );
    assert.deepEqual(liar.body, { received: true, result: "unpaid" });
    assert.deepEqual(await counts(db), NOTHING);

    const real = await send(
      webhookRequest(
        sessionEvent(COMPLETED, "cs_test_real", "evt_test_real", {
          payment_status: "unpaid",
          metadata: {},
        }),
      ),
      deps,
    );
    assert.deepEqual(real.body, { received: true, result: "fulfilled" });
    const items = await db.select().from(orderItems);
    assert.deepEqual(
      items
        .map(({ productId, quantity }) => ({ id: productId, quantity }))
        .sort((a, b) => a.id.localeCompare(b.id)),
      [...BOUGHT].sort((a, b) => a.id.localeCompare(b.id)),
      "品目と数量は Stripe の session の metadata から",
    );
    assert.equal((await db.select().from(orders))[0].total, totalOf(BOUGHT));
  }));

/* ---------- 冪等 ---------- */

test("Webhook: 同じイベントが 2 回届いても注文は 1 件で、2 回目は処理済みとして Stripe にも問い合わせない", () =>
  withTestDb(async ({ db }) => {
    await seedProducts(db);
    const stripe = fakeStripe({
      cs_test_paid: paidSession("cs_test_paid", BOUGHT),
    });
    const deps = depsFor(db, stripe);
    const event = sessionEvent(COMPLETED, "cs_test_paid", "evt_test_1");

    const first = await send(webhookRequest(event), deps);
    const second = await send(webhookRequest(event), deps);

    assert.deepEqual(first.body, { received: true, result: "fulfilled" });
    assert.equal(second.status, 200, "再送されないよう 2xx で返す");
    assert.deepEqual(second.body, { received: true, result: "duplicate" });
    assert.deepEqual(await counts(db), ONE_ORDER);
    assert.deepEqual(stripe.retrieved, ["cs_test_paid"]);
  }));

test("Webhook: 同じイベントが同時に 2 通届いても、注文は 1 件・処理済みのイベントも 1 件", () =>
  withTestDb(async ({ db }) => {
    await seedProducts(db);
    // 2 通とも「処理済みではない」と見てから、そろって書き込みに進む
    const stripe = fakeStripe(
      { cs_test_paid: paidSession("cs_test_paid", BOUGHT) },
      { waitFor: 2 },
    );
    const deps = depsFor(db, stripe);
    const event = sessionEvent(COMPLETED, "cs_test_paid", "evt_test_1");

    const results = await Promise.all([
      send(webhookRequest(event), deps),
      send(webhookRequest(event), deps),
    ]);

    for (const res of results) assert.equal(res.status, 200);
    assert.deepEqual(await counts(db), ONE_ORDER);
  }));

test("Webhook: 同じ決済の別のイベント（completed のあとの async_payment_succeeded）が来ても注文は増えない", () =>
  withTestDb(async ({ db }) => {
    await seedProducts(db);
    const stripe = fakeStripe({
      cs_test_paid: paidSession("cs_test_paid", BOUGHT),
    });
    const deps = depsFor(db, stripe);

    const first = await send(
      webhookRequest(sessionEvent(COMPLETED, "cs_test_paid", "evt_test_1")),
      deps,
    );
    const second = await send(
      webhookRequest(
        sessionEvent(ASYNC_SUCCEEDED, "cs_test_paid", "evt_test_2"),
      ),
      deps,
    );

    assert.deepEqual(first.body, { received: true, result: "fulfilled" });
    assert.deepEqual(second.body, {
      received: true,
      result: "already-fulfilled",
    });
    assert.deepEqual(await counts(db), { ...ONE_ORDER, stripeEvents: 2 });
    assert.deepEqual(stripe.retrieved, ["cs_test_paid"]);
  }));

/* ---------- 署名 ---------- */

test("Webhook: 署名が合わないものは 400 で、DB にも Stripe にも触れない", () =>
  withTestDb(async ({ db }) => {
    await seedProducts(db);
    const stripe = fakeStripe({
      cs_test_paid: paidSession("cs_test_paid", BOUGHT),
    });
    const deps = depsFor(db, stripe);
    const event = sessionEvent(COMPLETED, "cs_test_paid", "evt_test_1");
    const payload = JSON.stringify(event);
    const signed = webhookRequest(event);
    const now = Math.floor(Date.now() / 1000);

    const unsigned: [string, Request][] = [
      ["別の秘密で署名した", webhookRequest(event, { secret: "whsec_other" })],
      [
        "署名したあとで本文を書き換えた",
        new Request(WEBHOOK_URL, {
          method: "POST",
          headers: signed.headers,
          body: payload.replace("cs_test_paid", "cs_test_evil"),
        }),
      ],
      ["署名のヘッダーが無い", webhookRequest(event, { signature: null })],
      ["署名のヘッダーが空", webhookRequest(event, { signature: "" })],
      ["署名が壊れている", webhookRequest(event, { signature: "t=1,v1=abc" })],
      ["署名が読めない", webhookRequest(event, { signature: "garbage" })],
      [
        "v1 ではない方式の署名だけ",
        webhookRequest(event, { signature: `t=${now},v0=abc` }),
      ],
      [
        "5 分より古い署名（使い回し）",
        webhookRequest(event, { timestamp: now - 3600 }),
      ],
      ["本文が空", webhookRequest("", { signature: `t=${now},v1=abc` })],
    ];
    for (const [label, request] of unsigned) {
      const res = await send(request, deps);
      assert.equal(res.status, 400, label);
      assert.equal(typeof res.body.error, "string", label);
      assert.ok(!res.body.received, label);
    }
    assert.deepEqual(
      await counts(db),
      NOTHING,
      "署名の合わないものは DB を変えない",
    );
    assert.deepEqual(stripe.retrieved, [], "Stripe にも問い合わせない");

    // 同じ内容でも、正しい署名なら通る（上の 400 は署名のせい）
    const ok = await send(signed, deps);
    assert.equal(ok.status, 200);
    assert.deepEqual(await counts(db), ONE_ORDER);
  }));

test("Webhook: 署名の秘密（STRIPE_WEBHOOK_SECRET）が未設定なら 503 で、正しい署名でも何もしない", () =>
  withTestDb(async ({ db }) => {
    await seedProducts(db);
    const stripe = fakeStripe({
      cs_test_paid: paidSession("cs_test_paid", BOUGHT),
    });
    const event = sessionEvent(COMPLETED, "cs_test_paid", "evt_test_1");

    for (const secret of [undefined, "", "   \n"]) {
      const res = await send(
        webhookRequest(event),
        depsFor(db, stripe, { secret }),
      );
      assert.equal(res.status, 503, JSON.stringify(secret));
      assert.equal(typeof res.body.error, "string");
    }
    assert.deepEqual(await counts(db), NOTHING);
    assert.deepEqual(stripe.retrieved, []);
    assert.ok(
      logged.some((line) => line.includes("STRIPE_WEBHOOK_SECRET")),
      "未設定はログに残す",
    );

    // 秘密の前後の空白（Vercel の画面に貼ったときの改行など）は取り除いて検証する
    const padded = await send(
      webhookRequest(event),
      depsFor(db, stripe, { secret: `${WEBHOOK_SECRET}\n` }),
    );
    assert.equal(padded.status, 200);
  }));

test("Webhook: 本文が大きすぎるものは、署名を調べる前に 413 で断る", async () => {
  const stripe = fakeStripe({});
  const deps: WebhookDeps = {
    constructEvent: () => {
      throw new Error("大きすぎる本文は署名の検証まで進まないはず");
    },
    secret: WEBHOOK_SECRET,
    getDb: async () => {
      throw new Error("DB に触れないはず");
    },
    getStripe: stripe.getStripe,
  };
  const request = (size: number) =>
    webhookRequest("x".repeat(size), { signature: "t=1,v1=abc" });

  const tooLarge = await send(request(MAX_WEBHOOK_BODY_BYTES + 1), deps);
  assert.equal(tooLarge.status, 413);

  // ちょうど上限の本文は読む（署名が通らないので 400。ここでは constructEvent が呼ばれる）
  const atLimit = await send(request(MAX_WEBHOOK_BODY_BYTES), {
    ...deps,
    constructEvent,
  });
  assert.equal(atLimit.status, 400);
  assert.deepEqual(stripe.retrieved, []);
});

/* ---------- 注文にしないもの ---------- */

test("Webhook: 未払いの session は注文にもイベントの記録にもせず 200 で返し、支払われたあとの再送で確定する", () =>
  withTestDb(async ({ db }) => {
    await seedProducts(db);
    const stripe = fakeStripe({
      // 未払いでも metadata は付いている。これを見て注文を作ってはいけない
      cs_test_async: paidSession("cs_test_async", BOUGHT, {
        payment_status: "unpaid",
      }),
    });
    const deps = depsFor(db, stripe);
    const completed = sessionEvent(COMPLETED, "cs_test_async", "evt_test_1");

    const early = await send(webhookRequest(completed), deps);
    assert.equal(early.status, 200, "未払いは失敗ではない（再送を求めない）");
    assert.deepEqual(early.body, { received: true, result: "unpaid" });
    assert.deepEqual(await counts(db), NOTHING, "注文 0 件・イベントも未記録");

    // あとから入金された。入金のイベントが届く
    stripe.sessions.cs_test_async = paidSession("cs_test_async", BOUGHT);
    const late = await send(
      webhookRequest(
        sessionEvent(ASYNC_SUCCEEDED, "cs_test_async", "evt_test_2"),
      ),
      deps,
    );
    assert.deepEqual(late.body, { received: true, result: "fulfilled" });
    assert.deepEqual(await counts(db), { ...ONE_ORDER, stripeEvents: 1 });

    // 未払いのときに届いた最初のイベントを Stripe が再送しても、いまは支払い済みなので処理される（記録していなかったため）
    const resent = await send(webhookRequest(completed), deps);
    assert.deepEqual(resent.body, {
      received: true,
      result: "already-fulfilled",
    });
    assert.deepEqual(await counts(db), { ...ONE_ORDER, stripeEvents: 2 });
  }));

test("Webhook: 対象外のイベントは 200 で片付け、DB にも Stripe にも触れない", () =>
  withTestDb(async ({ db }) => {
    await seedProducts(db);
    const stripe = fakeStripe({
      cs_test_paid: paidSession("cs_test_paid", BOUGHT),
    });
    for (const type of [
      "checkout.session.expired",
      "checkout.session.async_payment_failed",
      "payment_intent.succeeded",
    ]) {
      const res = await send(
        webhookRequest(sessionEvent(type, "cs_test_paid", "evt_test_other")),
        depsFor(db, stripe),
      );
      assert.equal(res.status, 200, type);
      assert.deepEqual(res.body, { received: true, result: "ignored" }, type);
    }
    assert.deepEqual(await counts(db), NOTHING);
    assert.deepEqual(stripe.retrieved, []);
  }));

test("Webhook: 署名が正しくても、イベントの形が不正なら 400（JSON でない本文・session の id が無い・形が違う）", () =>
  withTestDb(async ({ db }) => {
    await seedProducts(db);
    const stripe = fakeStripe({
      cs_test_paid: paidSession("cs_test_paid", BOUGHT),
    });
    const deps = depsFor(db, stripe);
    const bodies: unknown[] = [
      "これは JSON ではない",
      "null",
      "[]",
      "123",
      {},
      { id: "evt_test_1", type: COMPLETED },
      { id: "evt_test_1", type: COMPLETED, data: { object: {} } },
      sessionEvent(COMPLETED, "pi_123"),
      sessionEvent(COMPLETED, "bad"),
      sessionEvent(COMPLETED, "cs_test_paid", "not-an-event-id"),
    ];
    for (const body of bodies) {
      const res = await send(webhookRequest(body), deps);
      assert.equal(res.status, 400, JSON.stringify(body));
      assert.equal(typeof res.body.error, "string");
    }
    assert.deepEqual(await counts(db), NOTHING);
    assert.deepEqual(stripe.retrieved, []);
  }));

test("Webhook: 支払い済みでも metadata から注文を作れなければ 422 で、何も記録しない（2xx にして取りこぼさない）", () =>
  withTestDb(async ({ db }) => {
    await seedProducts(db);
    logged.length = 0;
    const stripe = fakeStripe({
      cs_test_nometa: {
        id: "cs_test_nometa",
        payment_status: "paid",
        metadata: {},
      },
    });

    const res = await send(
      webhookRequest(sessionEvent(COMPLETED, "cs_test_nometa", "evt_test_1")),
      depsFor(db, stripe),
    );

    assert.equal(res.status, 422);
    assert.deepEqual(await counts(db), NOTHING);
    assert.ok(
      logged.some((line) => line.includes("cs_test_nometa")),
      `どの session かをログに残す: ${logged.join(" / ")}`,
    );
  }));

/* ---------- 失敗したイベントは、再送で拾い直せる ---------- */

test("Webhook: Stripe から session を取れなかったら 502 で、イベントを処理済みにせず、再送で確定する", () =>
  withTestDb(async ({ db }) => {
    await seedProducts(db);
    const stripe = fakeStripe({}); // cs_test_retry はまだ引けない（500）
    const deps = depsFor(db, stripe);
    const event = sessionEvent(COMPLETED, "cs_test_retry", "evt_test_1");

    const failed = await send(webhookRequest(event), deps);
    assert.equal(failed.status, 502);
    assert.ok(
      !JSON.stringify(failed.body).includes(STRIPE_ERROR_TEXT),
      "例外文（秘密を含みうる）を応答に出さない",
    );
    assert.deepEqual(await counts(db), NOTHING);

    stripe.sessions.cs_test_retry = paidSession("cs_test_retry", BOUGHT);
    const resent = await send(webhookRequest(event), deps);
    assert.deepEqual(resent.body, { received: true, result: "fulfilled" });
    assert.deepEqual(await counts(db), ONE_ORDER);
  }));

test("Webhook: DB に書けなかったら 500 で全部取り消し、直したあとの再送で確定する", () =>
  withTestDb(async ({ db }) => {
    // products を seed していない = 明細の外部キーを満たせない
    const stripe = fakeStripe({
      cs_test_paid: paidSession("cs_test_paid", BOUGHT),
    });
    const deps = depsFor(db, stripe);
    const event = sessionEvent(COMPLETED, "cs_test_paid", "evt_test_1");

    const failed = await send(webhookRequest(event), deps);
    assert.equal(failed.status, 500);
    assert.deepEqual(
      await counts(db),
      NOTHING,
      "orders だけが残った・イベントだけが処理済みになった、がない",
    );

    await seedProducts(db);
    const resent = await send(webhookRequest(event), deps);
    assert.deepEqual(resent.body, { received: true, result: "fulfilled" });
    assert.deepEqual(await counts(db), ONE_ORDER);
  }));

test("Webhook: DB に繋げなくても 500 で返し、接続の例外文を応答に出さない", () =>
  withTestDb(async ({ db }) => {
    const stripe = fakeStripe({
      cs_test_paid: paidSession("cs_test_paid", BOUGHT),
    });
    const res = await send(
      webhookRequest(sessionEvent(COMPLETED, "cs_test_paid", "evt_test_1")),
      depsFor(db, stripe, {
        getDb: async () => {
          throw new Error(`connect ECONNREFUSED ${STRIPE_ERROR_TEXT}`);
        },
      }),
    );
    assert.equal(res.status, 500);
    assert.ok(!JSON.stringify(res.body).includes("ECONNREFUSED"));
    assert.ok(!JSON.stringify(res.body).includes(STRIPE_ERROR_TEXT));
    assert.deepEqual(
      stripe.retrieved,
      [],
      "DB に繋げないなら Stripe も呼ばない",
    );
    assert.deepEqual(await counts(db), NOTHING);
  }));

/* ---------- 請求額・通貨が合わない決済、未払い・知らない決済の記録 ---------- */

test("Webhook: 請求額（amount_total）・通貨が注文の合計と合わない決済は 422 で、注文もイベントの処理済みの記録も残さず、値を含まない記録を残す。session が直った再送で確定する", () =>
  withTestDb(async ({ db }) => {
    await seedProducts(db);
    const total = totalOf(BOUGHT);
    const stripe = fakeStripe({
      cs_test_amount: paidSession("cs_test_amount", BOUGHT, {
        amount_total: total + 100,
      }),
      cs_test_currency: paidSession("cs_test_currency", BOUGHT, {
        currency: "usd",
      }),
    });
    const deps = depsFor(db, stripe);

    const capture = captureConsole();
    let amount: Awaited<ReturnType<typeof send>>;
    let currency: Awaited<ReturnType<typeof send>>;
    try {
      amount = await send(
        webhookRequest(sessionEvent(COMPLETED, "cs_test_amount", "evt_amount")),
        deps,
      );
      currency = await send(
        webhookRequest(
          sessionEvent(COMPLETED, "cs_test_currency", "evt_currency"),
        ),
        deps,
      );
    } finally {
      capture.restore();
    }
    for (const res of [amount, currency]) {
      assert.equal(res.status, 422);
      assert.equal(typeof res.body.error, "string");
    }
    assert.deepEqual(await counts(db), NOTHING);
    assert.deepEqual(capture.events(), [
      {
        level: "error",
        event: "fulfillment.payment-mismatch",
        eventId: "evt_amount",
        sessionId: "cs_test_amount",
        field: "amount_total",
      },
      {
        level: "error",
        event: "fulfillment.payment-mismatch",
        eventId: "evt_currency",
        sessionId: "cs_test_currency",
        field: "currency",
      },
    ]);
    assert.ok(!capture.text().includes(String(total)), "金額をログに出さない");

    // 手で直したあとの再送（イベントは処理済みになっていない）で確定する
    stripe.sessions.cs_test_amount = paidSession("cs_test_amount", BOUGHT);
    const resent = await send(
      webhookRequest(sessionEvent(COMPLETED, "cs_test_amount", "evt_amount")),
      deps,
    );
    assert.deepEqual(resent.body, { received: true, result: "fulfilled" });
    assert.deepEqual(await counts(db), ONE_ORDER);
  }));

test("Webhook: 未払いの completed と、Stripe が知らない決済（鍵の取り違えの疑い）は、200 で片付けたうえで警告の記録を残す", () =>
  withTestDb(async ({ db }) => {
    await seedProducts(db);
    const stripe = fakeStripe({
      cs_test_unpaid: paidSession("cs_test_unpaid", BOUGHT, {
        payment_status: "unpaid",
      }),
    });
    const deps = depsFor(db, stripe);

    const capture = captureConsole();
    const results = [];
    try {
      for (const [sessionId, eventId] of [
        ["cs_test_unpaid", "evt_unpaid"],
        ["cs_test_missing", "evt_missing"],
      ] as const) {
        results.push(
          await send(
            webhookRequest(sessionEvent(COMPLETED, sessionId, eventId)),
            deps,
          ),
        );
      }
    } finally {
      capture.restore();
    }
    for (const res of results) {
      assert.deepEqual(res, {
        status: 200,
        body: { received: true, result: "unpaid" },
      });
    }
    assert.deepEqual(
      capture.events().map(({ level, event, eventId, sessionId }) => ({
        level,
        event,
        eventId,
        sessionId,
      })),
      [
        {
          level: "warn",
          event: "fulfillment.session-unpaid",
          eventId: "evt_unpaid",
          sessionId: "cs_test_unpaid",
        },
        {
          level: "warn",
          event: "fulfillment.session-not-found",
          eventId: "evt_missing",
          sessionId: "cs_test_missing",
        },
      ],
    );
    assert.deepEqual(await counts(db), NOTHING);
  }));

/* ---------- Route Handler の配線（createWebhookDeps） ---------- */

test("Webhook の配線: Route Handler が使う依存（createWebhookDeps）は、環境変数 STRIPE_WEBHOOK_SECRET の秘密で本物の署名を検証する。STRIPE_SECRET_KEY を秘密にしてしまうと常に失敗する", () =>
  withTestDb(async ({ db }) => {
    await seedProducts(db);
    const stripe = fakeStripe({
      cs_test_paid: paidSession("cs_test_paid", BOUGHT),
    });
    const wired = (env: Record<string, string | undefined>) =>
      createWebhookDeps(env, {
        getDb: async () => db,
        getStripe: stripe.getStripe,
      });
    const event = sessionEvent(COMPLETED, "cs_test_paid", "evt_wired");

    // 正しい配線: STRIPE_WEBHOOK_SECRET で署名した本文が通り、注文が確定する
    const ok = await send(
      webhookRequest(event),
      wired({
        STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
        STRIPE_SECRET_KEY: "sk_test_x",
      }),
    );
    assert.deepEqual(ok.body, { received: true, result: "fulfilled" });
    assert.deepEqual(await counts(db), ONE_ORDER);

    // 別の秘密で署名した本文は 400（検証は本物の constructEvent。this を失うと、正しい署名でも失敗する）
    const forged = await send(
      webhookRequest(event, { secret: "whsec_someone_else" }),
      wired({ STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET }),
    );
    assert.equal(forged.status, 400);

    // STRIPE_WEBHOOK_SECRET が無ければ 503。STRIPE_SECRET_KEY など、ほかの変数を秘密にしない
    for (const env of [
      {},
      { STRIPE_WEBHOOK_SECRET: "" },
      { STRIPE_SECRET_KEY: WEBHOOK_SECRET },
    ]) {
      const res = await send(webhookRequest(event), wired(env));
      assert.equal(res.status, 503, JSON.stringify(env));
    }
  }));

test("Webhook: DB に書けなかったときのログには SQL の引数（注文番号・利用者の id など）を出さず、失敗の種類（SQLSTATE）と session・イベントの番号だけを残す", () =>
  withTestDb(async ({ db }) => {
    // products を seed していない = 明細の外部キー（SQLSTATE 23503）を満たせない
    const stripe = fakeStripe({
      cs_test_paid: paidSession("cs_test_paid", BOUGHT),
    });
    const capture = captureConsole();
    let res: Awaited<ReturnType<typeof send>>;
    try {
      res = await send(
        webhookRequest(sessionEvent(COMPLETED, "cs_test_paid", "evt_db_down")),
        depsFor(db, stripe),
      );
    } finally {
      capture.restore();
    }
    assert.equal(res.status, 500);
    assert.deepEqual(capture.events(), [
      {
        level: "error",
        event: "webhook.failed",
        eventId: "evt_db_down",
        sessionId: "cs_test_paid",
        errorName: "Error",
        errorCode: "23503",
      },
    ]);
    assert.ok(
      !/params|Failed query|insert into/i.test(capture.text()),
      capture.text().slice(0, 300),
    );
  }));
