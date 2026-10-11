// POST /checkout（REST）の本体 handleCheckoutRequest のテスト。サーバは起動せず、Stripe にも通信しない。実行: npm test
//
// なぜあるか: app/checkout/route.ts は薄い配線だけにして、本体を lib/checkout-session.ts に置いた。route.ts は node --test から
// import できない（"@/" と server-only）ので、配線を壊したときに落ちるテストが無かった（ログイン中の持ち主を渡し忘れても、
// 本文の上限を外しても、どのテストも緑のままだった）。ここで次を固定する。
//  - ログイン中の購入は、セッションから引いた利用者の id が Checkout Session の client_reference_id に付く。ゲストは付かない。
//    本文に持ち主を書いても使わない
//  - 415（JSON でない）・413（16KB 超）・400（読めない・JSON でない・品目が不正）の応答
//  - セッションを引けない（DB の失敗など）ときは、持ち主を決められないので Stripe を呼ばず 500。ログに SQL の引数を出さない
//  - Stripe が失敗しても、例外の中身（秘密を含みうる）を返さない
import assert from "node:assert/strict";
import { test } from "node:test";

import { CHECKOUT_ERRORS, MAX_BODY_BYTES } from "../lib/checkout.ts";
import {
  BAD_REQUEST,
  TOO_LARGE,
  UNSUPPORTED_MEDIA_TYPE,
  handleCheckoutRequest,
} from "../lib/checkout-session.ts";
import type { CheckoutRequestDeps } from "../lib/checkout-session.ts";
import type { Viewer } from "../lib/types.ts";
import { captureConsole } from "./support/console.ts";
import { STRIPE_ERROR_TEXT, fakeCheckoutStripe } from "./support/stripe.ts";

const URL_ = "http://localhost/checkout";
const HANAKO: Viewer = {
  id: "user_hanako",
  email: "h@example.com",
  name: "花子",
};
const ITEMS = [{ id: "1", quantity: 2 }];

function post(body: string, headers: Record<string, string> = {}): Request {
  return new Request(URL_, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });
}

/** 本番と同じ依存に、偽の Stripe と、引数で決めた利用者を差し込む。getViewer が受けたヘッダーも記録する */
function setup(
  viewer: Viewer | null,
  overrides: Partial<CheckoutRequestDeps> = {},
) {
  const stripe = fakeCheckoutStripe();
  const seen: string[] = [];
  const deps: CheckoutRequestDeps = {
    getViewer: async (headers) => {
      seen.push(headers.get("cookie") ?? "");
      return viewer;
    },
    getStripe: stripe.getStripe,
    ...overrides,
  };
  return { stripe, seen, deps };
}

async function jsonOf(response: Response) {
  return (await response.json()) as { url?: string; error?: string };
}

test("POST /checkout: ログイン中の購入は、セッションから引いた利用者の id が client_reference_id に付く。ゲストは付かない", async () => {
  const member = setup(HANAKO);
  const res = await handleCheckoutRequest(
    post(JSON.stringify({ items: ITEMS }), {
      cookie: "better-auth.session_token=abc",
    }),
    member.deps,
  );
  assert.equal(res.status, 200);
  assert.equal((await jsonOf(res)).url, "https://checkout.stripe.test/pay");
  assert.equal(member.stripe.created.length, 1);
  assert.equal(member.stripe.created[0]?.client_reference_id, HANAKO.id);
  assert.deepEqual(
    member.seen,
    ["better-auth.session_token=abc"],
    "持ち主は、この要求のヘッダー（cookie）から引く",
  );

  const guest = setup(null);
  const res2 = await handleCheckoutRequest(
    post(JSON.stringify({ items: ITEMS })),
    guest.deps,
  );
  assert.equal(res2.status, 200);
  assert.equal(guest.stripe.created.length, 1);
  assert.ok(
    !("client_reference_id" in guest.stripe.created[0]!),
    "ゲストの購入には持ち主を付けない",
  );
});

test("POST /checkout: 本文に持ち主（userId・client_reference_id）を書いても使わない。持ち主はセッションだけで決まる", async () => {
  const guest = setup(null);
  await handleCheckoutRequest(
    post(
      JSON.stringify({
        items: ITEMS,
        userId: "user_victim",
        client_reference_id: "user_victim",
      }),
    ),
    guest.deps,
  );
  assert.ok(!("client_reference_id" in guest.stripe.created[0]!));

  const member = setup(HANAKO);
  await handleCheckoutRequest(
    post(JSON.stringify({ items: ITEMS, userId: "user_victim" })),
    member.deps,
  );
  assert.equal(member.stripe.created[0]?.client_reference_id, HANAKO.id);
});

test("POST /checkout: JSON でない Content-Type は 415、16KB を超える本文は 413、読めない・JSON でない本文と不正な品目は 400。どれも Stripe を呼ばない", async () => {
  const { stripe, deps } = setup(HANAKO);
  const call = async (request: Request) => {
    const res = await handleCheckoutRequest(request, deps);
    return { status: res.status, body: await jsonOf(res) };
  };

  assert.deepEqual(
    await call(
      post("items=1", { "content-type": "application/x-www-form-urlencoded" }),
    ),
    { status: 415, body: { error: UNSUPPORTED_MEDIA_TYPE } },
  );
  assert.deepEqual(
    await call(
      post(JSON.stringify({ items: ITEMS, pad: "x".repeat(MAX_BODY_BYTES) })),
    ),
    { status: 413, body: { error: TOO_LARGE } },
  );
  assert.deepEqual(await call(post("{not json")), {
    status: 400,
    body: { error: BAD_REQUEST },
  });
  assert.deepEqual(await call(post(JSON.stringify({ items: [] }))), {
    status: 400,
    body: { error: CHECKOUT_ERRORS.empty },
  });
  assert.deepEqual(
    await call(post(JSON.stringify({ items: [{ id: "nope", quantity: 1 }] }))),
    { status: 400, body: { error: CHECKOUT_ERRORS.unknownItem } },
  );
  assert.equal(stripe.created.length, 0);
});

test("POST /checkout: セッションを引けない（DB の失敗など）ときは Stripe を呼ばず 500。ログには SQL の引数（セッションの識別子）を出さない", async () => {
  const stripe = fakeCheckoutStripe();
  const failure = Object.assign(
    new Error(
      'Failed query: select from "session"\nparams: SESSION_TOKEN_VALUE',
    ),
    { cause: Object.assign(new Error("down"), { code: "57P01" }) },
  );
  const capture = captureConsole();
  let res: Response;
  try {
    res = await handleCheckoutRequest(post(JSON.stringify({ items: ITEMS })), {
      getViewer: async () => {
        throw failure;
      },
      getStripe: stripe.getStripe,
    });
  } finally {
    capture.restore();
  }
  assert.equal(res.status, 500);
  assert.equal(
    stripe.created.length,
    0,
    "持ち主を決められないまま決済を作らない",
  );
  assert.ok(!capture.text().includes("SESSION_TOKEN_VALUE"), capture.text());
  assert.deepEqual(capture.events(), [
    {
      level: "error",
      event: "checkout.viewer-failed",
      errorName: "Error",
      errorCode: "57P01",
    },
  ]);
});

test("POST /checkout: Stripe が失敗したら 500。応答に例外の中身を出さない", async () => {
  const stripe = fakeCheckoutStripe({ fail: true });
  const capture = captureConsole();
  let res: Response;
  try {
    res = await handleCheckoutRequest(
      post(JSON.stringify({ items: ITEMS })),
      setup(null, { getStripe: stripe.getStripe }).deps,
    );
  } finally {
    capture.restore();
  }
  assert.equal(res.status, 500);
  const text = JSON.stringify(await jsonOf(res));
  assert.ok(!text.includes(STRIPE_ERROR_TEXT), text);
  assert.equal(stripe.created.length, 1);
});
