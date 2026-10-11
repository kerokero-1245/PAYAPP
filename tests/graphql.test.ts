// GraphQL API（/api/graphql）のテスト。サーバは起動せず、Stripe にも通信しない。実行: npm test
//
// なぜあるか: GraphQL は /checkout と同じ決済経路への入口なので、
// 「価格はカタログから決める」「入力値をエラー文に入れない」「16KB の上限」
// 「Stripe の例外文を返さない」を GraphQL 経由でも崩さないことを固定する。
// さらに GraphQL 特有の「エイリアスで Mutation を何個も並べて Stripe に多重要求させる」を塞ぐ。
// ログイン中の利用者（viewer）と、購入の持ち主（Checkout Session の client_reference_id）も、ここで固定する
// （本物の Better Auth のセッションを通した確認は tests/auth-viewer.test.ts）。
// handler は lib/graphql/handler.ts を Node 22 の型消去でそのまま import する。
import { test } from "node:test";
import assert from "node:assert/strict";
import type Stripe from "stripe";

import { PRODUCTS, getProductById } from "../lib/catalog.ts";
import {
  CHECKOUT_ERRORS,
  buildLineItems,
  encodeOrderMetadata,
} from "../lib/checkout.ts";
import type { LineItemsResult } from "../lib/checkout.ts";
import {
  UNSUPPORTED_MEDIA_TYPE,
  createCheckoutSessionCore,
  isJsonContentType,
} from "../lib/checkout-session.ts";
import type { StripeLike } from "../lib/checkout-session.ts";
import {
  MAX_GRAPHQL_BODY_BYTES,
  TOO_MANY_FIELDS,
  TOO_MANY_MUTATIONS,
  TOO_MANY_STRIPE_FIELDS,
  createGraphqlHandler,
} from "../lib/graphql/handler.ts";
import { STRIPE_UNAVAILABLE_MESSAGE } from "../lib/graphql/schema.ts";
import { createCheckoutSession as clientCreateCheckoutSession } from "../lib/graphql/client.ts";
import type { Db } from "../lib/db/connect.ts";
import type { Viewer } from "../lib/types.ts";
import { orderItems, orders } from "../lib/db/schema.ts";
import { seedProducts } from "../lib/db/seed.ts";
import { withTestDb } from "../lib/db/test-helpers.ts";
import { eq } from "drizzle-orm";

const URL_ = "http://localhost/api/graphql";
const SECRET = "sk_live_SECRET_DETAIL stack at Stripe.request";

/** 偽の Stripe が記録する create の引数のうち、テストが見る項目 */
type CreatedArgs = {
  mode?: string;
  line_items: {
    price_data: { unit_amount: number; product_data: { name: string } };
  }[];
  metadata: Record<string, string>;
  client_reference_id?: string;
  success_url: string;
  cancel_url: string;
};

/** buildLineItems が通した側の結果（期待する line_items を取り出すのに使う） */
type LineItemsOk = Extract<LineItemsResult, { ok: true }>;

/** GraphQL の応答の errors の 1 件 */
type GqlError = { message: string };

type Handler = ReturnType<typeof createGraphqlHandler>;

/** 呼ばれた引数を記録する偽の Stripe。retrieve は session id で返し分ける */
function fakeStripe() {
  const created: CreatedArgs[] = [];
  const retrieved: string[] = [];
  const sessions: Record<string, unknown> = {
    cs_test_paid: {
      id: "cs_test_paid",
      payment_status: "paid",
      metadata: encodeOrderMetadata([
        { id: "1", quantity: 2 },
        { id: "5", quantity: 1 },
      ]),
    },
    cs_test_unpaid: {
      id: "cs_test_unpaid",
      payment_status: "unpaid",
      metadata: {},
    },
  };
  return {
    created,
    retrieved,
    checkout: {
      sessions: {
        async create(args: Stripe.Checkout.SessionCreateParams) {
          created.push(args as CreatedArgs);
          return { url: "https://checkout.stripe.test/x" };
        },
        async retrieve(id: string) {
          retrieved.push(id);
          if (sessions[id]) return sessions[id];
          if (id === "cs_test_missing")
            throw Object.assign(new Error("No such session"), {
              statusCode: 404,
            });
          throw Object.assign(new Error(SECRET), { statusCode: 500 });
        },
      },
    },
  };
}

/**
 * handler と偽の Stripe を作る。db を渡したテストだけが DB を使える
 * （渡さないテストで getDb が呼ばれたら例外にして、DB に触れてはいけないテストが触れたことに気付けるようにする）。
 * ログイン中の利用者は viewer で渡す（無ければゲスト）。引き方そのものを確かめるテストは getViewer を渡す
 */
function setup({
  getStripe,
  baseUrl,
  db,
  viewer,
  getViewer,
}: {
  getStripe?: () => StripeLike;
  baseUrl?: string;
  db?: Db;
  viewer?: Viewer | null;
  getViewer?: () => Promise<Viewer | null>;
} = {}) {
  const stripe = fakeStripe();
  const handler = createGraphqlHandler({
    getStripe: getStripe ?? (() => stripe),
    getDb: async () => {
      if (!db) throw new Error("このテストは DB を使わないはず");
      return db;
    },
    getViewer: getViewer ?? (async () => viewer ?? null),
    baseUrl,
  });
  return { stripe, handler };
}

async function post(handler: Handler, query: string, variables?: unknown) {
  const res = await handler.fetch(
    new Request(URL_, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query, variables }),
    }),
  );
  const text = await res.text();
  return { status: res.status, text, body: JSON.parse(text) };
}

const PRODUCT_FIELDS = "id name price category";

/* ---------- ⑤-1 商品の一覧と絞り込み ---------- */

test("GraphQL: products は全 10 件、category で絞り込める", async () => {
  const { handler } = setup();
  const all = await post(handler, `{ products { ${PRODUCT_FIELDS} } }`);
  assert.equal(all.status, 200);
  assert.equal(all.body.data.products.length, 10);
  assert.equal(all.body.data.products.length, PRODUCTS.length);

  const watches = await post(
    handler,
    `{ products(category: "watches") { id category } }`,
  );
  assert.equal(watches.body.data.products.length, 2);
  assert.ok(
    watches.body.data.products.every(
      (p: { category: string }) => p.category === "watches",
    ),
  );

  const categories = await post(handler, `{ categories { slug label jp } }`);
  assert.equal(categories.body.data.categories.length, 5);
});

test("GraphQL: products(q:) は商品一覧ページと同じ規則（name / tagline / description の小文字部分一致）", async () => {
  const { handler } = setup();
  // app/product/page.tsx の絞り込みをそのまま書き写した期待値
  const expected = PRODUCTS.filter((p) =>
    `${p.name} ${p.tagline ?? ""} ${p.description ?? ""}`
      .toLowerCase()
      .includes("gold"),
  ).map((p) => p.id);
  assert.ok(expected.length > 0, "前提: gold に当たる商品がある");
  const r = await post(handler, `{ products(q: "  GOLD ") { id } }`);
  assert.deepEqual(
    r.body.data.products.map((p: { id: string }) => p.id),
    expected,
  );
});

/* ---------- ⑤-2 存在しない商品 ---------- */

test("GraphQL: product(id) は商品を返し、存在しない id は null", async () => {
  const { handler } = setup();
  const found = await post(
    handler,
    `{ product(id: "1") { id name price badge images } }`,
  );
  assert.equal(found.body.data.product.name, getProductById("1")!.name);
  assert.equal(found.body.data.product.price, getProductById("1")!.price);
  const missing = await post(handler, `{ product(id: "999") { id } }`);
  assert.equal(missing.status, 200);
  assert.equal(missing.body.data.product, null);
  assert.equal(missing.body.errors, undefined);
});

/* ---------- ⑤-3 見積もりはカタログの価格 ---------- */

const QUOTE = `query Quote($items: [CartItemInput!]!) {
  cartQuote(items: $items) {
    quote { total totalQuantity items { quantity subtotal product { id price } } }
    errors { code message }
  }
}`;

test("GraphQL: cartQuote はカタログの価格で合計し、同じ id は合算する", async () => {
  const { handler } = setup();
  const r = await post(handler, QUOTE, {
    items: [
      { id: "1", quantity: 1 },
      { id: "5", quantity: 1 },
      { id: "1", quantity: 1 },
    ],
  });
  const { quote, errors } = r.body.data.cartQuote;
  assert.deepEqual(errors, []);
  assert.equal(quote.total, 248000 * 2 + 26800);
  assert.equal(quote.totalQuantity, 3);
  assert.deepEqual(
    quote.items.map(
      (i: { product: { id: string }; quantity: number; subtotal: number }) => [
        i.product.id,
        i.quantity,
        i.subtotal,
      ],
    ),
    [
      ["1", 2, 496000],
      ["5", 1, 26800],
    ],
  );
});

test("GraphQL: CartItemInput は price を受け付けない（送られた価格で見積もる経路が無い）", async () => {
  const { handler } = setup();
  const r = await post(handler, QUOTE, {
    items: [{ id: "1", quantity: 1, price: 1 }],
  });
  assert.equal(r.body.data, undefined);
  assert.ok(r.body.errors.length > 0);
});

/* ---------- ⑤-4 不正入力は CHECKOUT_ERRORS の文言だけ ---------- */

const CREATE = `mutation Create($items: [CartItemInput!]!) {
  createCheckoutSession(items: $items) { url errors { code message } }
}`;

test("GraphQL: 不正な入力は CHECKOUT_ERRORS の文言とコードで返し、入力値を含めない", async () => {
  const { handler, stripe } = setup();
  const evil = "<script>alert(1)</script>";
  const cases = [
    [[], "EMPTY", CHECKOUT_ERRORS.empty],
    [[{ id: evil, quantity: 1 }], "UNKNOWN_ITEM", CHECKOUT_ERRORS.unknownItem],
    [[{ id: "1", quantity: 0 }], "BAD_QUANTITY", CHECKOUT_ERRORS.badQuantity],
    [
      [
        { id: "1", quantity: 60 },
        { id: "1", quantity: 60 },
      ],
      "BAD_QUANTITY",
      CHECKOUT_ERRORS.badQuantity,
    ],
    [
      Array.from({ length: 101 }, () => ({ id: "1", quantity: 1 })),
      "TOO_MANY",
      CHECKOUT_ERRORS.tooMany,
    ],
  ];
  for (const [items, code, message] of cases) {
    const quote = await post(handler, QUOTE, { items });
    assert.equal(quote.body.data.cartQuote.quote, null);
    assert.deepEqual(quote.body.data.cartQuote.errors, [{ code, message }]);
    assert.ok(!quote.text.includes("<script>"), quote.text);

    const create = await post(handler, CREATE, { items });
    assert.equal(create.body.data.createCheckoutSession.url, null);
    assert.deepEqual(create.body.data.createCheckoutSession.errors, [
      { code, message },
    ]);
    assert.ok(!create.text.includes("<script>"), create.text);
  }
  assert.equal(stripe.created.length, 0, "不正な入力では Stripe を呼ばない");
});

/* ---------- ⑤-5 Stripe に渡す内容 ---------- */

test("GraphQL: createCheckoutSession は buildLineItems と同じ line_items、metadata は id:数量 の並びで Stripe に渡す", async () => {
  const { handler, stripe } = setup();
  const items = [
    { id: "1", quantity: 2 },
    { id: "5", quantity: 1 },
  ];
  const r = await post(handler, CREATE, { items });
  assert.deepEqual(r.body.data.createCheckoutSession, {
    url: "https://checkout.stripe.test/x",
    errors: [],
  });
  assert.equal(stripe.created.length, 1);
  const args = stripe.created[0];
  assert.deepEqual(
    args.line_items,
    (buildLineItems(items) as LineItemsOk).lineItems,
  );
  // 期待値は encodeOrderMetadata で作らず、リテラルで固定する（エンコードの変更に気づくため）
  assert.deepEqual(args.metadata, { order_items_0: "1:2,5:1" });
  assert.deepEqual(
    args.line_items.map((l) => l.price_data.unit_amount),
    [248000, 26800],
  );
  assert.equal(args.mode, "payment");
  assert.equal(
    args.success_url,
    "http://localhost/success?session_id={CHECKOUT_SESSION_ID}",
  );
  assert.equal(args.cancel_url, "http://localhost/cancel");
});

test("GraphQL: Stripe が失敗したら固定の文言だけを返す（例外文を返さない）", async () => {
  const { handler } = setup({
    getStripe: () => {
      throw new Error(SECRET);
    },
  });
  const r = await post(handler, CREATE, { items: [{ id: "1", quantity: 1 }] });
  assert.deepEqual(r.body.data.createCheckoutSession, {
    url: null,
    errors: [
      { code: "STRIPE_UNAVAILABLE", message: STRIPE_UNAVAILABLE_MESSAGE },
    ],
  });
  assert.ok(!r.text.includes("SECRET"), r.text);
});

/* ---------- ⑤-6 本文の上限 ---------- */

/** ちょうど size バイトの JSON 本文（query は categories。長さはクエリ内のコメントで合わせる） */
function bodyOfSize(size: number) {
  const make = (pad: string) =>
    JSON.stringify({ query: `#${pad}\n{ categories { slug } }` });
  const body = make("x".repeat(size - make("").length));
  assert.equal(Buffer.byteLength(body), size);
  return body;
}

test("GraphQL: 本文は 4KB まで（4,096 バイトは通り、4,097 バイトは 413。Stripe を呼ばない）", async () => {
  const { handler, stripe } = setup();
  const send = (body: string) =>
    handler.fetch(
      new Request(URL_, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      }),
    );
  assert.equal(MAX_GRAPHQL_BODY_BYTES, 4096);
  assert.equal((await send(bodyOfSize(4096))).status, 200);
  const over = await send(bodyOfSize(4097));
  assert.equal(over.status, 413);
  assert.equal(over.headers.get("cache-control"), "no-store");

  // content-length の無いストリームの本文でも上限を当てる
  const stream = new ReadableStream({
    start(c) {
      c.enqueue(new TextEncoder().encode(bodyOfSize(4097)));
      c.close();
    },
  });
  const res2 = await handler.fetch(
    new Request(URL_, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: stream,
      duplex: "half",
    } as RequestInit), // duplex は Node の fetch の項目で、lib.dom の RequestInit には無い
  );
  assert.equal(res2.status, 413);
  assert.equal(stripe.created.length, 0);
});

test("GraphQL: POST は application/json だけ受け付ける（フォーム送信は 415）", async () => {
  const { handler, stripe } = setup();
  const res = await handler.fetch(
    new Request(URL_, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body:
        "query=" +
        encodeURIComponent(
          `mutation { createCheckoutSession(items: [{ id: "1", quantity: 1 }]) { url } }`,
        ),
    }),
  );
  assert.equal(res.status, 415);
  assert.deepEqual(await res.json(), {
    errors: [{ message: UNSUPPORTED_MEDIA_TYPE }],
  });
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.equal(stripe.created.length, 0);
});

test("Content-Type の判定: application/json（引数・大文字可）だけを受け付ける", () => {
  for (const ok of [
    "application/json",
    "application/json; charset=utf-8",
    "APPLICATION/JSON",
    "application/json ;charset=UTF-8",
  ]) {
    assert.equal(isJsonContentType(ok), true, ok);
  }
  for (const ng of [
    null,
    "",
    "text/plain",
    "application/graphql-response+json",
    "application/json-seq",
    "application/jsonx",
    "application/x-www-form-urlencoded",
    "multipart/form-data",
  ]) {
    assert.equal(isJsonContentType(ng), false, String(ng));
  }
});

/* ---------- ⑤-7 決済の照会 ---------- */

const LOOKUP = `query Lookup($id: ID!) {
  orderBySession(sessionId: $id) {
    state
    order { orderNo sessionId total items { quantity subtotal product { id price } } }
  }
}`;

/** 注文番号の形（lib/fulfillment.ts の generateOrderNo） */
const ORDER_NO = /^ORD-[0-9A-Z]{10}$/;

test("GraphQL: orderBySession は支払い済みなら DB に確定した注文（注文番号つき）と PAID、未払い・存在しない・形の不正は UNPAID で何も確定しない", () =>
  withTestDb(async ({ db }) => {
    await seedProducts(db);
    const { handler } = setup({ db });
    const paid = await post(handler, LOOKUP, { id: "cs_test_paid" });
    assert.equal(paid.body.data.orderBySession.state, "PAID");
    const { orderNo } = paid.body.data.orderBySession.order;
    assert.match(orderNo, ORDER_NO);
    assert.deepEqual(paid.body.data.orderBySession.order, {
      orderNo,
      sessionId: "cs_test_paid",
      total: 248000 * 2 + 26800,
      items: [
        { quantity: 2, subtotal: 496000, product: { id: "1", price: 248000 } },
        { quantity: 1, subtotal: 26800, product: { id: "5", price: 26800 } },
      ],
    });
    // 返した注文は DB にある
    const [row, ...others] = await db.select().from(orders);
    assert.deepEqual(others, []);
    assert.equal(row.orderNo, orderNo);
    assert.equal(row.stripeSessionId, "cs_test_paid");

    for (const id of ["cs_test_unpaid", "cs_test_missing", "not-a-session"]) {
      const r = await post(handler, LOOKUP, { id });
      assert.deepEqual(
        r.body.data.orderBySession,
        { state: "UNPAID", order: null },
        id,
      );
    }
    assert.equal((await db.select().from(orders)).length, 1, "注文は増えない");
  }));

test("GraphQL: orderBySession は同じ決済を何度照会しても同じ注文を返し、確定済みなら Stripe に問い合わせない", () =>
  withTestDb(async ({ db }) => {
    await seedProducts(db);
    const { handler, stripe } = setup({ db });
    const first = await post(handler, LOOKUP, { id: "cs_test_paid" });
    const second = await post(handler, LOOKUP, { id: "cs_test_paid" });

    assert.equal(first.body.data.orderBySession.state, "PAID");
    assert.deepEqual(second.body.data, first.body.data);
    assert.equal((await db.select().from(orders)).length, 1);
    assert.deepEqual(stripe.retrieved, ["cs_test_paid"]);
  }));

test("GraphQL: orderBySession の小計は購入した時点の単価（DB の写し）× 数量で、product.price はカタログの今の価格", () =>
  withTestDb(async ({ db }) => {
    await seedProducts(db);
    const { handler } = setup({ db });
    await post(handler, LOOKUP, { id: "cs_test_paid" });
    // カタログの価格が変わった想定ではなく、注文の側の写しを変えて、どちらを読んでいるかを見分ける
    await db
      .update(orderItems)
      .set({ unitPrice: 1000 })
      .where(eq(orderItems.productId, "1"));

    const r = await post(handler, LOOKUP, { id: "cs_test_paid" });
    const item = r.body.data.orderBySession.order.items[0];
    assert.equal(item.product.price, 248000, "カタログの今の価格");
    assert.equal(item.subtotal, 1000 * 2, "注文の写しの単価 × 数量");
  }));

test("GraphQL: orderBySession で Stripe がその他の例外なら GraphQL エラーにし、例外文を隠す", () =>
  withTestDb(async ({ db }) => {
    await seedProducts(db);
    const { handler, stripe } = setup({ db });
    const r = await post(handler, LOOKUP, { id: "cs_test_boom" });
    assert.deepEqual(stripe.retrieved, ["cs_test_boom"], "Stripe の失敗である");
    assert.equal(r.body.data?.orderBySession ?? null, null);
    assert.ok(Array.isArray(r.body.errors) && r.body.errors.length > 0);
    assert.ok(!r.text.includes("SECRET"), r.text);
    assert.ok(!r.text.includes("stack"), r.text);
    assert.equal((await db.select().from(orders)).length, 0);
  }));

test("GraphQL: orderBySession で DB に繋げなければ GraphQL エラーにし、例外文を隠す。形の不正な id は DB にも Stripe にも触れず UNPAID", async () => {
  const stripe = fakeStripe();
  const handler = createGraphqlHandler({
    getStripe: () => stripe,
    getDb: async () => {
      throw new Error("connect ECONNREFUSED db.internal.example:5432");
    },
    getViewer: async () => null,
  });
  const savedError = console.error;
  console.error = () => {};
  try {
    const r = await post(handler, LOOKUP, { id: "cs_test_paid" });
    assert.equal(r.body.data?.orderBySession ?? null, null);
    assert.ok(Array.isArray(r.body.errors) && r.body.errors.length > 0);
    assert.ok(!r.text.includes("ECONNREFUSED"), r.text);
    assert.ok(!r.text.includes("db.internal"), r.text);
    assert.deepEqual(
      stripe.retrieved,
      [],
      "DB に繋げないなら Stripe も呼ばない",
    );

    const bad = await post(handler, LOOKUP, { id: "not-a-session" });
    assert.deepEqual(bad.body.data.orderBySession, {
      state: "UNPAID",
      order: null,
    });
  } finally {
    console.error = savedError;
  }
});

/* ---------- ⑤-8 Mutation の多重実行 ---------- */

test("GraphQL: 1 リクエストに Mutation を 2 つ以上並べると拒否し、Stripe を呼ばない", async () => {
  const { handler, stripe } = setup();
  const item = `items: [{ id: "1", quantity: 1 }]`;
  const aliased = `mutation {
    a: createCheckoutSession(${item}) { url }
    b: createCheckoutSession(${item}) { url }
  }`;
  const viaFragment = `mutation { ...F c: createCheckoutSession(${item}) { url } }
    fragment F on Mutation { d: createCheckoutSession(${item}) { url } }`;
  for (const query of [aliased, viaFragment]) {
    const r = await post(handler, query);
    assert.equal(r.body.data, undefined);
    assert.ok(
      r.body.errors.some((e: GqlError) => e.message === TOO_MANY_MUTATIONS),
      r.text,
    );
  }
  assert.equal(stripe.created.length, 0);

  // 1 つだけ（__typename 付き）なら通る
  const one = await post(
    handler,
    `mutation { __typename createCheckoutSession(${item}) { url } }`,
  );
  assert.equal(
    one.body.data.createCheckoutSession.url,
    "https://checkout.stripe.test/x",
  );
  assert.equal(stripe.created.length, 1);
});

/* ---------- Stripe を呼ぶフィールドとクエリのコスト ---------- */

test("GraphQL: orderBySession を 2 つ並べると拒否し、Stripe の retrieve を呼ばない（エイリアス・フラグメント・@include）", () =>
  withTestDb(async ({ db }) => {
    await seedProducts(db);
    const { handler, stripe } = setup({ db });
    const queries = [
      `{ a: orderBySession(sessionId: "cs_test_paid") { state } b: orderBySession(sessionId: "cs_test_paid") { state } }`,
      `{ ...F b: orderBySession(sessionId: "cs_test_paid") { state } }
     fragment F on Query { a: orderBySession(sessionId: "cs_test_paid") { state } }`,
      `{ ...F ...F } fragment F on Query { orderBySession(sessionId: "cs_test_paid") { state } }`,
      `{ a: orderBySession(sessionId: "cs_test_paid") @include(if: false) { state }
       b: orderBySession(sessionId: "cs_test_paid") { state } }`,
    ];
    for (const query of queries) {
      const r = await post(handler, query);
      assert.equal(r.body.data, undefined, query);
      assert.ok(
        r.body.errors.some(
          (e: GqlError) => e.message === TOO_MANY_STRIPE_FIELDS,
        ),
        r.text,
      );
    }
    assert.equal(stripe.retrieved.length, 0);

    // 1 つだけなら通る
    const one = await post(
      handler,
      `{ orderBySession(sessionId: "cs_test_paid") { state } }`,
    );
    assert.equal(one.body.data.orderBySession.state, "PAID");
    assert.equal(stripe.retrieved.length, 1);
  }));

test("GraphQL: 選択するフィールドは 200 まで（同名の重複・フラグメントの展開も数える）", async () => {
  const { handler } = setup();
  const many = `{${"products{id}".repeat(300)}}`;
  const r = await post(handler, many);
  assert.equal(r.body.data, undefined);
  assert.ok(
    r.body.errors.some((e: GqlError) => e.message === TOO_MANY_FIELDS),
    r.text.slice(0, 300),
  );

  // フラグメントを入れ子で何度も展開して数を増やす形も弾く（2^8 = 256 回展開される）
  const nested = `{ ...A } fragment A on Query { ...B ...B } fragment B on Query { ...C ...C }
    fragment C on Query { ...D ...D } fragment D on Query { ...E ...E } fragment E on Query { ...G ...G }
    fragment G on Query { ...H ...H } fragment H on Query { ...I ...I } fragment I on Query { ...J ...J }
    fragment J on Query { categories { slug } }`;
  const r2 = await post(handler, nested);
  assert.equal(r2.body.data, undefined);
  assert.ok(
    r2.body.errors.some((e: GqlError) => e.message === TOO_MANY_FIELDS),
    r2.text.slice(0, 300),
  );

  // 100 フィールドなら通る
  const ok = await post(handler, `{${"products{id}".repeat(50)}}`);
  assert.equal(ok.body.errors, undefined);
  assert.equal(ok.body.data.products.length, 10);
});

/* ---------- 応答ヘッダー・GraphiQL ---------- */

test("GraphQL: CORS ヘッダーを返さず、応答は no-store", async () => {
  const { handler } = setup();
  const res = await handler.fetch(
    new Request(URL_, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://evil.example",
      },
      body: JSON.stringify({ query: "{ categories { slug } }" }),
    }),
  );
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("access-control-allow-origin"), null);
  assert.equal(res.headers.get("cache-control"), "no-store");

  const preflight = await handler.fetch(
    new Request(URL_, {
      method: "OPTIONS",
      headers: {
        origin: "https://evil.example",
        "access-control-request-method": "POST",
      },
    }),
  );
  assert.equal(preflight.headers.get("access-control-allow-origin"), null);
});

test("GraphQL: GraphiQL は本番（NODE_ENV=production）では返さない", async () => {
  const saved = process.env.NODE_ENV;
  // NODE_ENV は Next の型で読み取り専用なので、書き換えるときは文字列の辞書として扱う
  const env = process.env as Record<string, string | undefined>;
  const html = (h: Handler) =>
    h
      .fetch(new Request(URL_, { headers: { accept: "text/html" } }))
      .then(async (r) => ({
        status: r.status,
        text: await r.text(),
      }));
  try {
    env.NODE_ENV = "production";
    const prod = await html(setup().handler);
    assert.ok(!prod.text.includes("GraphiQL"), prod.text.slice(0, 200));
    env.NODE_ENV = "development";
    const dev = await html(setup().handler);
    assert.ok(dev.text.includes("GraphiQL"));
  } finally {
    if (saved === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = saved;
  }
});

/* ---------- 共有の本体・戻り先 ---------- */

test("createCheckoutSessionCore: REST 形の本文の price は無視し、カタログの価格で作る", async () => {
  const stripe = fakeStripe();
  const r = await createCheckoutSessionCore({
    items: [{ id: "1", quantity: 2, price: 1, name: "書き換えた名前" }],
    requestUrl: "http://localhost/checkout",
    getStripe: () => stripe,
  });
  assert.deepEqual(r, { ok: true, url: "https://checkout.stripe.test/x" });
  assert.equal(stripe.created[0].line_items[0].price_data.unit_amount, 248000);
  assert.equal(
    stripe.created[0].line_items[0].price_data.product_data.name,
    "Éclat Automatic 41",
  );
  assert.deepEqual(stripe.created[0].metadata, { order_items_0: "1:2" });
});

test("createCheckoutSessionCore: userId があれば client_reference_id に付け、無い・空ならゲストとして付けない。本文（REST 形の items）の値は使わない", async () => {
  const items = [
    {
      id: "1",
      quantity: 1,
      userId: "user_other",
      client_reference_id: "user_other",
    },
  ];
  for (const [userId, expected] of [
    ["user_1", "user_1"],
    [undefined, undefined],
    [null, undefined],
    ["", undefined],
  ] as const) {
    const stripe = fakeStripe();
    const r = await createCheckoutSessionCore({
      items,
      requestUrl: "http://localhost/checkout",
      userId,
      getStripe: () => stripe,
    });
    assert.equal(r.ok, true);
    assert.equal(
      stripe.created[0].client_reference_id,
      expected,
      String(userId),
    );
    assert.equal(
      "client_reference_id" in stripe.created[0],
      expected !== undefined,
      "ゲストには client_reference_id のキーごと付けない",
    );
  }
});

test("GraphQL: handler に渡した baseUrl が戻り先（success_url / cancel_url）になる", async () => {
  const { handler, stripe } = setup({
    baseUrl: "https://shop.example/some/path",
  });
  await post(handler, CREATE, { items: [{ id: "1", quantity: 1 }] });
  assert.equal(
    stripe.created[0].success_url,
    "https://shop.example/success?session_id={CHECKOUT_SESSION_ID}",
  );
  assert.equal(stripe.created[0].cancel_url, "https://shop.example/cancel");
});

/* ---------- ログイン中の利用者（viewer）と、購入の持ち主 ---------- */

const VIEWER = `query { viewer { id email name } }`;
const HANAKO: Viewer = {
  id: "user_hanako",
  email: "hanako@example.com",
  name: "山田 花子",
};

test("GraphQL: viewer は、ログインしていなければ null（エラーにしない）、ログイン中は id・email・name だけを返す", async () => {
  const guest = await post(setup().handler, VIEWER);
  assert.equal(guest.status, 200);
  assert.deepEqual(guest.body, { data: { viewer: null } });

  const member = await post(setup({ viewer: HANAKO }).handler, VIEWER);
  assert.deepEqual(member.body, { data: { viewer: HANAKO } });
});

test("GraphQL: Viewer 型は id・email・name だけを持つ（パスワードのハッシュ・セッションの識別子・IP を取り出す経路が無い）", async () => {
  const r = await post(
    setup().handler,
    `{ __type(name: "Viewer") { fields { name } } }`,
  );
  const fields: { name: string }[] = r.body.data.__type.fields;
  assert.deepEqual(fields.map((f) => f.name).sort(), ["email", "id", "name"]);
});

test("GraphQL: 利用者は必要なリクエストでだけ引き、1 リクエストにつき 1 回だけ（エイリアスで並べても 1 回）。別のリクエストに持ち越さない", async () => {
  let calls = 0;
  const { handler } = setup({
    getViewer: async () => {
      calls += 1;
      return HANAKO;
    },
  });
  await post(handler, `{ products { id } }`);
  assert.equal(calls, 0, "viewer を要求しないリクエストは、利用者を引かない");

  const r = await post(handler, `{ a: viewer { id } b: viewer { email } }`);
  assert.deepEqual(r.body.data, {
    a: { id: HANAKO.id },
    b: { email: HANAKO.email },
  });
  assert.equal(calls, 1, "1 リクエストの中では 1 回");

  await post(handler, VIEWER);
  assert.equal(calls, 2, "リクエストごとに引く");
});

test("GraphQL: createCheckoutSession は、ログイン中なら利用者の id を client_reference_id に付け、ゲストには付けない。持ち主を決める入力は無い", async () => {
  const items = [{ id: "1", quantity: 1 }];

  const guest = setup();
  const g = await post(guest.handler, CREATE, { items });
  assert.deepEqual(g.body.data.createCheckoutSession.errors, []);
  assert.ok(!("client_reference_id" in guest.stripe.created[0]));

  const member = setup({ viewer: HANAKO });
  const m = await post(member.handler, CREATE, { items });
  assert.deepEqual(m.body.data.createCheckoutSession.errors, []);
  assert.equal(member.stripe.created[0].client_reference_id, HANAKO.id);

  // 持ち主を決める入力（userId など）は、CartItemInput に無い。送ると検証で断られ、Stripe に届かない
  const forged = setup({ viewer: HANAKO });
  const f = await post(forged.handler, CREATE, {
    items: [{ id: "1", quantity: 1, userId: "user_other" }],
  });
  assert.ok(Array.isArray(f.body.errors) && f.body.errors.length > 0);
  assert.equal(forged.stripe.created.length, 0);
});

test("GraphQL: createCheckoutSession は、利用者を引けなければ Stripe に要求せず失敗にし、例外の中身を返さない", async () => {
  const { handler, stripe } = setup({
    getViewer: async () => {
      throw new Error("connect ECONNREFUSED db.internal.example:5432");
    },
  });
  const savedError = console.error;
  console.error = () => {};
  try {
    const r = await post(handler, CREATE, {
      items: [{ id: "1", quantity: 1 }],
    });
    assert.ok(Array.isArray(r.body.errors) && r.body.errors.length > 0);
    assert.ok(!r.text.includes("ECONNREFUSED"), r.text);
    assert.ok(!r.text.includes("db.internal"), r.text);
    assert.equal(
      stripe.created.length,
      0,
      "持ち主を決められないので、決済を始めない",
    );
  } finally {
    console.error = savedError;
  }
});

/* ---------- ブラウザ用クライアントの文言の振り分け ---------- */

test("client: createCheckoutSession は UserError と 413 の文言だけを見せ、それ以外は既定の文言にする", async () => {
  const saved = globalThis.fetch;
  const respond = (status: number, body: unknown) => {
    globalThis.fetch = async (url, init) => {
      assert.equal(url, "/api/graphql");
      assert.equal(init!.method, "POST");
      return Response.json(body, { status });
    };
  };
  try {
    respond(200, {
      data: {
        createCheckoutSession: {
          url: "https://checkout.stripe.test/x",
          errors: [],
        },
      },
    });
    assert.deepEqual(
      await clientCreateCheckoutSession([{ id: "1", quantity: 1 }]),
      {
        url: "https://checkout.stripe.test/x",
      },
    );

    respond(200, {
      data: {
        createCheckoutSession: {
          url: null,
          errors: [{ code: "EMPTY", message: CHECKOUT_ERRORS.empty }],
        },
      },
    });
    assert.deepEqual(await clientCreateCheckoutSession([]), {
      error: CHECKOUT_ERRORS.empty,
    });

    respond(413, { errors: [{ message: "リクエストが大きすぎます" }] });
    assert.deepEqual(await clientCreateCheckoutSession([]), {
      error: "リクエストが大きすぎます",
    });

    // 型の検証エラー（GraphQL 層）や隠された例外は見せない → 呼び出し側が既定の文言を出す
    respond(400, {
      errors: [{ message: 'Variable "$items" got invalid value "<script>"' }],
    });
    assert.deepEqual(await clientCreateCheckoutSession([]), { error: null });
    respond(200, { data: null, errors: [{ message: "Unexpected error." }] });
    assert.deepEqual(await clientCreateCheckoutSession([]), { error: null });
  } finally {
    globalThis.fetch = saved;
  }
});
