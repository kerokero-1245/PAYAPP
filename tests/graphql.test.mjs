// GraphQL API（/api/graphql）のテスト。サーバは起動せず、Stripe にも通信しない。実行: npm test
//
// なぜあるか: GraphQL は /checkout と同じ決済経路への入口なので、
// 「価格はカタログから決める」「入力値をエラー文に入れない」「16KB の上限」
// 「Stripe の例外文を返さない」を GraphQL 経由でも崩さないことを固定する。
// さらに GraphQL 特有の「エイリアスで Mutation を何個も並べて Stripe に多重要求させる」を塞ぐ。
// handler は lib/graphql/handler.ts を Node 22 の型消去でそのまま import する。
import { test } from "node:test";
import assert from "node:assert/strict";

import { PRODUCTS, getProductById } from "../lib/catalog.mjs";
import { CHECKOUT_ERRORS, buildLineItems, encodeOrderMetadata } from "../lib/checkout.mjs";
import {
  UNSUPPORTED_MEDIA_TYPE,
  createCheckoutSessionCore,
  isJsonContentType,
} from "../lib/checkout-session.mjs";
import {
  MAX_GRAPHQL_BODY_BYTES,
  TOO_MANY_FIELDS,
  TOO_MANY_MUTATIONS,
  TOO_MANY_STRIPE_FIELDS,
  createGraphqlHandler,
} from "../lib/graphql/handler.ts";
import { STRIPE_UNAVAILABLE_MESSAGE } from "../lib/graphql/schema.ts";
import { createCheckoutSession as clientCreateCheckoutSession } from "../lib/graphql/client.ts";

const URL_ = "http://localhost/api/graphql";
const SECRET = "sk_live_SECRET_DETAIL stack at Stripe.request";

/** 呼ばれた引数を記録する偽の Stripe。retrieve は session id で返し分ける */
function fakeStripe() {
  const created = [];
  const retrieved = [];
  const sessions = {
    cs_test_paid: {
      id: "cs_test_paid",
      payment_status: "paid",
      metadata: encodeOrderMetadata([{ id: "1", quantity: 2 }, { id: "5", quantity: 1 }]),
    },
    cs_test_unpaid: { id: "cs_test_unpaid", payment_status: "unpaid", metadata: {} },
  };
  return {
    created,
    retrieved,
    checkout: {
      sessions: {
        async create(args) {
          created.push(args);
          return { url: "https://checkout.stripe.test/x" };
        },
        async retrieve(id) {
          retrieved.push(id);
          if (sessions[id]) return sessions[id];
          if (id === "cs_test_missing") throw Object.assign(new Error("No such session"), { statusCode: 404 });
          throw Object.assign(new Error(SECRET), { statusCode: 500 });
        },
      },
    },
  };
}

function setup({ getStripe, baseUrl } = {}) {
  const stripe = fakeStripe();
  const handler = createGraphqlHandler({ getStripe: getStripe ?? (() => stripe), baseUrl });
  return { stripe, handler };
}

async function post(handler, query, variables) {
  const res = await handler.fetch(
    new Request(URL_, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query, variables }),
    })
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

  const watches = await post(handler, `{ products(category: "watches") { id category } }`);
  assert.equal(watches.body.data.products.length, 2);
  assert.ok(watches.body.data.products.every((p) => p.category === "watches"));

  const categories = await post(handler, `{ categories { slug label jp } }`);
  assert.equal(categories.body.data.categories.length, 5);
});

test("GraphQL: products(q:) は商品一覧ページと同じ規則（name / tagline / description の小文字部分一致）", async () => {
  const { handler } = setup();
  // app/product/page.js の絞り込みをそのまま書き写した期待値
  const expected = PRODUCTS.filter((p) =>
    `${p.name} ${p.tagline ?? ""} ${p.description ?? ""}`.toLowerCase().includes("gold")
  ).map((p) => p.id);
  assert.ok(expected.length > 0, "前提: gold に当たる商品がある");
  const r = await post(handler, `{ products(q: "  GOLD ") { id } }`);
  assert.deepEqual(r.body.data.products.map((p) => p.id), expected);
});

/* ---------- ⑤-2 存在しない商品 ---------- */

test("GraphQL: product(id) は商品を返し、存在しない id は null", async () => {
  const { handler } = setup();
  const found = await post(handler, `{ product(id: "1") { id name price badge images } }`);
  assert.equal(found.body.data.product.name, getProductById("1").name);
  assert.equal(found.body.data.product.price, getProductById("1").price);
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
    items: [{ id: "1", quantity: 1 }, { id: "5", quantity: 1 }, { id: "1", quantity: 1 }],
  });
  const { quote, errors } = r.body.data.cartQuote;
  assert.deepEqual(errors, []);
  assert.equal(quote.total, 248000 * 2 + 26800);
  assert.equal(quote.totalQuantity, 3);
  assert.deepEqual(quote.items.map((i) => [i.product.id, i.quantity, i.subtotal]), [
    ["1", 2, 496000],
    ["5", 1, 26800],
  ]);
});

test("GraphQL: CartItemInput は price を受け付けない（送られた価格で見積もる経路が無い）", async () => {
  const { handler } = setup();
  const r = await post(handler, QUOTE, { items: [{ id: "1", quantity: 1, price: 1 }] });
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
    [[{ id: "1", quantity: 60 }, { id: "1", quantity: 60 }], "BAD_QUANTITY", CHECKOUT_ERRORS.badQuantity],
    [Array.from({ length: 101 }, () => ({ id: "1", quantity: 1 })), "TOO_MANY", CHECKOUT_ERRORS.tooMany],
  ];
  for (const [items, code, message] of cases) {
    const quote = await post(handler, QUOTE, { items });
    assert.equal(quote.body.data.cartQuote.quote, null);
    assert.deepEqual(quote.body.data.cartQuote.errors, [{ code, message }]);
    assert.ok(!quote.text.includes("<script>"), quote.text);

    const create = await post(handler, CREATE, { items });
    assert.equal(create.body.data.createCheckoutSession.url, null);
    assert.deepEqual(create.body.data.createCheckoutSession.errors, [{ code, message }]);
    assert.ok(!create.text.includes("<script>"), create.text);
  }
  assert.equal(stripe.created.length, 0, "不正な入力では Stripe を呼ばない");
});

/* ---------- ⑤-5 Stripe に渡す内容 ---------- */

test("GraphQL: createCheckoutSession は buildLineItems と同じ line_items、metadata は id:数量 の並びで Stripe に渡す", async () => {
  const { handler, stripe } = setup();
  const items = [{ id: "1", quantity: 2 }, { id: "5", quantity: 1 }];
  const r = await post(handler, CREATE, { items });
  assert.deepEqual(r.body.data.createCheckoutSession, {
    url: "https://checkout.stripe.test/x",
    errors: [],
  });
  assert.equal(stripe.created.length, 1);
  const args = stripe.created[0];
  assert.deepEqual(args.line_items, buildLineItems(items).lineItems);
  // 期待値は encodeOrderMetadata で作らず、リテラルで固定する（エンコードの変更に気づくため）
  assert.deepEqual(args.metadata, { order_items_0: "1:2,5:1" });
  assert.deepEqual(args.line_items.map((l) => l.price_data.unit_amount), [248000, 26800]);
  assert.equal(args.mode, "payment");
  assert.equal(args.success_url, "http://localhost/success?session_id={CHECKOUT_SESSION_ID}");
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
    errors: [{ code: "STRIPE_UNAVAILABLE", message: STRIPE_UNAVAILABLE_MESSAGE }],
  });
  assert.ok(!r.text.includes("SECRET"), r.text);
});

/* ---------- ⑤-6 本文の上限 ---------- */

/** ちょうど size バイトの JSON 本文（query は categories。長さはクエリ内のコメントで合わせる） */
function bodyOfSize(size) {
  const make = (pad) => JSON.stringify({ query: `#${pad}\n{ categories { slug } }` });
  const body = make("x".repeat(size - make("").length));
  assert.equal(Buffer.byteLength(body), size);
  return body;
}

test("GraphQL: 本文は 4KB まで（4,096 バイトは通り、4,097 バイトは 413。Stripe を呼ばない）", async () => {
  const { handler, stripe } = setup();
  const send = (body) =>
    handler.fetch(
      new Request(URL_, { method: "POST", headers: { "content-type": "application/json" }, body })
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
    })
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
      body: "query=" + encodeURIComponent(`mutation { createCheckoutSession(items: [{ id: "1", quantity: 1 }]) { url } }`),
    })
  );
  assert.equal(res.status, 415);
  assert.deepEqual(await res.json(), { errors: [{ message: UNSUPPORTED_MEDIA_TYPE }] });
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.equal(stripe.created.length, 0);
});

test("Content-Type の判定: application/json（引数・大文字可）だけを受け付ける", () => {
  for (const ok of ["application/json", "application/json; charset=utf-8", "APPLICATION/JSON", "application/json ;charset=UTF-8"]) {
    assert.equal(isJsonContentType(ok), true, ok);
  }
  for (const ng of [null, "", "text/plain", "application/graphql-response+json", "application/json-seq", "application/jsonx", "application/x-www-form-urlencoded", "multipart/form-data"]) {
    assert.equal(isJsonContentType(ng), false, String(ng));
  }
});

/* ---------- ⑤-7 決済の照会 ---------- */

const LOOKUP = `query Lookup($id: ID!) {
  orderBySession(sessionId: $id) {
    state
    order { sessionId total items { quantity subtotal product { id price } } }
  }
}`;

test("GraphQL: orderBySession は支払い済みなら PAID と注文、未払い・存在しない・形の不正は UNPAID", async () => {
  const { handler } = setup();
  const paid = await post(handler, LOOKUP, { id: "cs_test_paid" });
  assert.equal(paid.body.data.orderBySession.state, "PAID");
  assert.deepEqual(paid.body.data.orderBySession.order, {
    sessionId: "cs_test_paid",
    total: 248000 * 2 + 26800,
    items: [
      { quantity: 2, subtotal: 496000, product: { id: "1", price: 248000 } },
      { quantity: 1, subtotal: 26800, product: { id: "5", price: 26800 } },
    ],
  });
  for (const id of ["cs_test_unpaid", "cs_test_missing", "not-a-session"]) {
    const r = await post(handler, LOOKUP, { id });
    assert.deepEqual(r.body.data.orderBySession, { state: "UNPAID", order: null }, id);
  }
});

test("GraphQL: orderBySession で Stripe がその他の例外なら GraphQL エラーにし、例外文を隠す", async () => {
  const { handler } = setup();
  const r = await post(handler, LOOKUP, { id: "cs_test_boom" });
  assert.equal(r.body.data?.orderBySession ?? null, null);
  assert.ok(Array.isArray(r.body.errors) && r.body.errors.length > 0);
  assert.ok(!r.text.includes("SECRET"), r.text);
  assert.ok(!r.text.includes("stack"), r.text);
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
    assert.ok(r.body.errors.some((e) => e.message === TOO_MANY_MUTATIONS), r.text);
  }
  assert.equal(stripe.created.length, 0);

  // 1 つだけ（__typename 付き）なら通る
  const one = await post(handler, `mutation { __typename createCheckoutSession(${item}) { url } }`);
  assert.equal(one.body.data.createCheckoutSession.url, "https://checkout.stripe.test/x");
  assert.equal(stripe.created.length, 1);
});

/* ---------- Stripe を呼ぶフィールドとクエリのコスト ---------- */

test("GraphQL: orderBySession を 2 つ並べると拒否し、Stripe の retrieve を呼ばない（エイリアス・フラグメント・@include）", async () => {
  const { handler, stripe } = setup();
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
    assert.ok(r.body.errors.some((e) => e.message === TOO_MANY_STRIPE_FIELDS), r.text);
  }
  assert.equal(stripe.retrieved.length, 0);

  // 1 つだけなら通る
  const one = await post(handler, `{ orderBySession(sessionId: "cs_test_paid") { state } }`);
  assert.equal(one.body.data.orderBySession.state, "PAID");
  assert.equal(stripe.retrieved.length, 1);
});

test("GraphQL: 選択するフィールドは 200 まで（同名の重複・フラグメントの展開も数える）", async () => {
  const { handler } = setup();
  const many = `{${"products{id}".repeat(300)}}`;
  const r = await post(handler, many);
  assert.equal(r.body.data, undefined);
  assert.ok(r.body.errors.some((e) => e.message === TOO_MANY_FIELDS), r.text.slice(0, 300));

  // フラグメントを入れ子で何度も展開して数を増やす形も弾く（2^8 = 256 回展開される）
  const nested = `{ ...A } fragment A on Query { ...B ...B } fragment B on Query { ...C ...C }
    fragment C on Query { ...D ...D } fragment D on Query { ...E ...E } fragment E on Query { ...G ...G }
    fragment G on Query { ...H ...H } fragment H on Query { ...I ...I } fragment I on Query { ...J ...J }
    fragment J on Query { categories { slug } }`;
  const r2 = await post(handler, nested);
  assert.equal(r2.body.data, undefined);
  assert.ok(r2.body.errors.some((e) => e.message === TOO_MANY_FIELDS), r2.text.slice(0, 300));

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
      headers: { "content-type": "application/json", origin: "https://evil.example" },
      body: JSON.stringify({ query: "{ categories { slug } }" }),
    })
  );
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("access-control-allow-origin"), null);
  assert.equal(res.headers.get("cache-control"), "no-store");

  const preflight = await handler.fetch(
    new Request(URL_, {
      method: "OPTIONS",
      headers: { origin: "https://evil.example", "access-control-request-method": "POST" },
    })
  );
  assert.equal(preflight.headers.get("access-control-allow-origin"), null);
});

test("GraphQL: GraphiQL は本番（NODE_ENV=production）では返さない", async () => {
  const saved = process.env.NODE_ENV;
  const html = (h) =>
    h.fetch(new Request(URL_, { headers: { accept: "text/html" } })).then(async (r) => ({
      status: r.status,
      text: await r.text(),
    }));
  try {
    process.env.NODE_ENV = "production";
    const prod = await html(setup().handler);
    assert.ok(!prod.text.includes("GraphiQL"), prod.text.slice(0, 200));
    process.env.NODE_ENV = "development";
    const dev = await html(setup().handler);
    assert.ok(dev.text.includes("GraphiQL"));
  } finally {
    if (saved === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = saved;
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
  assert.equal(stripe.created[0].line_items[0].price_data.product_data.name, "Éclat Automatic 41");
  assert.deepEqual(stripe.created[0].metadata, { order_items_0: "1:2" });
});

test("GraphQL: handler に渡した baseUrl が戻り先（success_url / cancel_url）になる", async () => {
  const { handler, stripe } = setup({ baseUrl: "https://shop.example/some/path" });
  await post(handler, CREATE, { items: [{ id: "1", quantity: 1 }] });
  assert.equal(stripe.created[0].success_url, "https://shop.example/success?session_id={CHECKOUT_SESSION_ID}");
  assert.equal(stripe.created[0].cancel_url, "https://shop.example/cancel");
});

/* ---------- ブラウザ用クライアントの文言の振り分け ---------- */

test("client: createCheckoutSession は UserError と 413 の文言だけを見せ、それ以外は既定の文言にする", async () => {
  const saved = globalThis.fetch;
  const respond = (status, body) => {
    globalThis.fetch = async (url, init) => {
      assert.equal(url, "/api/graphql");
      assert.equal(init.method, "POST");
      return Response.json(body, { status });
    };
  };
  try {
    respond(200, { data: { createCheckoutSession: { url: "https://checkout.stripe.test/x", errors: [] } } });
    assert.deepEqual(await clientCreateCheckoutSession([{ id: "1", quantity: 1 }]), {
      url: "https://checkout.stripe.test/x",
    });

    respond(200, {
      data: { createCheckoutSession: { url: null, errors: [{ code: "EMPTY", message: CHECKOUT_ERRORS.empty }] } },
    });
    assert.deepEqual(await clientCreateCheckoutSession([]), { error: CHECKOUT_ERRORS.empty });

    respond(413, { errors: [{ message: "リクエストが大きすぎます" }] });
    assert.deepEqual(await clientCreateCheckoutSession([]), { error: "リクエストが大きすぎます" });

    // 型の検証エラー（GraphQL 層）や隠された例外は見せない → 呼び出し側が既定の文言を出す
    respond(400, { errors: [{ message: 'Variable "$items" got invalid value "<script>"' }] });
    assert.deepEqual(await clientCreateCheckoutSession([]), { error: null });
    respond(200, { data: null, errors: [{ message: "Unexpected error." }] });
    assert.deepEqual(await clientCreateCheckoutSession([]), { error: null });
  } finally {
    globalThis.fetch = saved;
  }
});
