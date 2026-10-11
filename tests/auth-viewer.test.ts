// ログイン中の利用者（viewer）と購入の持ち主を、本物の Better Auth のセッション（cookie）を通して確かめるテスト。実行: npm test
//
// なぜあるか: 認証の結果が、画面と API に届く道は 3 本ある。
//  - GraphQL の viewer（cookie → セッション → 利用者）
//  - 購入手続き（createCheckoutSession が、ログイン中の利用者の id を Stripe の client_reference_id に付ける）
//  - 注文の確定（Webhook・成功ページの確認が、その id を orders.user_id に入れる）
// どれもテストの単位（lib/graphql/handler.ts・lib/fulfillment.ts）は別のファイルで固定している。ここでは、本物のセッションを使って
// 「cookie の無い要求は DB に触れない」「別の人の cookie ではその人が返る」「期限切れ・改ざん・ログアウト済みは null」
// 「ログインして買った注文は、Webhook でも成功ページでも、その利用者の注文になる（ゲストの買い物は持ち主なし）」を端から端まで確かめる。
// DB は PGlite、Stripe は偽物（create で受けた client_reference_id と metadata を、retrieve の session に写す）。外部には通信しない。
import assert from "node:assert/strict";
import { test } from "node:test";
import { eq } from "drizzle-orm";
import type Stripe from "stripe";

import type { Auth } from "../lib/auth/config.ts";
import { viewerFromHeaders } from "../lib/auth/viewer.ts";
import { verifyCheckoutSession } from "../lib/checkout-session.ts";
import type { StripeLike } from "../lib/checkout-session.ts";
import type { Db } from "../lib/db/connect.ts";
import { orders, session, user } from "../lib/db/schema.ts";
import { seedProducts } from "../lib/db/seed.ts";
import { withTestDb } from "../lib/db/test-helpers.ts";
import { createGraphqlHandler } from "../lib/graphql/handler.ts";
import { handleStripeWebhook } from "../lib/stripe-webhook.ts";
import { SAMPLE_USER, createTestAuth, signIn, signUp } from "./support/auth.ts";
import {
  WEBHOOK_SECRET,
  constructEvent,
  sessionEvent,
  webhookRequest,
} from "./support/webhook.ts";

const VIEWER = `query { viewer { id email name } }`;
const CREATE = `mutation Create($items: [CartItemInput!]!) {
  createCheckoutSession(items: $items) { url errors { code message } }
}`;
const ITEMS = [
  { id: "1", quantity: 2 },
  { id: "5", quantity: 1 },
];

const HANAKO = SAMPLE_USER;
const TARO = {
  name: "鈴木 太郎",
  email: "taro@example.com",
  password: "another strong passphrase 2026",
};

/**
 * Stripe の偽物。create で受けた client_reference_id と metadata を session に持ち、retrieve で（支払い済みとして）返す。
 * 本物の Stripe は、Checkout Session を作ったときの client_reference_id と metadata を、取得した session にそのまま返す
 */
function recordingStripe() {
  const created: Stripe.Checkout.SessionCreateParams[] = [];
  const sessions: Record<string, unknown> = {};
  const stripe: StripeLike = {
    checkout: {
      sessions: {
        async create(params) {
          created.push(params);
          const id = `cs_test_flow_${created.length}`;
          sessions[id] = {
            id,
            payment_status: "paid",
            metadata: params.metadata,
            client_reference_id: params.client_reference_id ?? null,
          };
          return { url: `https://checkout.stripe.test/${id}` };
        },
        async retrieve(id) {
          if (id in sessions) return sessions[id];
          throw Object.assign(new Error("No such session"), {
            statusCode: 404,
          });
        },
      },
    },
  };
  return { created, getStripe: () => stripe };
}

/** 本物の Better Auth のセッションから利用者を引く GraphQL の handler（app/api/graphql/route.ts と同じ配線） */
function appHandler(
  auth: Auth,
  db: Db,
  stripe: ReturnType<typeof recordingStripe>,
) {
  return createGraphqlHandler({
    getStripe: stripe.getStripe,
    getDb: async () => db,
    getViewer: (request) =>
      viewerFromHeaders(async () => auth, request.headers),
  });
}

/** 応答の本文の形（読む項目だけ） */
type ViewerBody = {
  data: { viewer: { id: string; email: string; name: string } | null };
};
type CreateBody = {
  data: { createCheckoutSession: { url: string | null; errors: unknown[] } };
};

/** cookie（無ければゲスト）つきで GraphQL を呼び、本文を T として返す */
async function gql<T>(
  handler: ReturnType<typeof appHandler>,
  query: string,
  { variables, cookie }: { variables?: unknown; cookie?: string } = {},
): Promise<T> {
  const headers = new Headers({ "content-type": "application/json" });
  if (cookie) headers.set("cookie", cookie);
  const res = await handler.fetch(
    new Request("http://localhost/api/graphql", {
      method: "POST",
      headers,
      body: JSON.stringify({ query, variables }),
    }),
  );
  return (await res.json()) as T;
}

test("viewer: セッションの cookie が無い要求（無関係な cookie だけの要求を含む）は null で、Better Auth にも DB にも触れない。引けなかったとき（DB に繋がらないなど）はゲスト扱いにせず例外にする", async () => {
  let authCalls = 0;
  const getAuth = async (): Promise<Auth> => {
    authCalls += 1;
    throw new Error("connect ECONNREFUSED db.internal.example:5432");
  };

  assert.equal(await viewerFromHeaders(getAuth, new Headers()), null);
  assert.equal(
    await viewerFromHeaders(getAuth, new Headers({ "user-agent": "x" })),
    null,
  );
  assert.equal(
    await viewerFromHeaders(
      getAuth,
      new Headers({ cookie: "theme=dark; __vercel_live_token=x" }),
    ),
    null,
    "セッションの cookie ではない cookie だけを持つ人",
  );
  assert.equal(
    authCalls,
    0,
    "セッションの cookie の無い要求は、認証を作りにも行かない",
  );

  // cookie があるのに引けない: null（ゲスト）にすると、ログイン中の人の購入が持ち主なしになる。例外にして呼び出し側に失敗として扱わせる
  await assert.rejects(
    viewerFromHeaders(
      getAuth,
      new Headers({ cookie: "better-auth.session_token=x" }),
    ),
    /ECONNREFUSED/,
  );
  assert.equal(authCalls, 1);
});

test("viewer: ログイン中は自分の id・email・name、別の人の cookie ならその人。期限切れ・改ざん・ログアウト済み・利用者が消えた cookie は null", () =>
  withTestDb(async ({ db }) => {
    const auth = createTestAuth(db);
    const handler = appHandler(auth, db, recordingStripe());
    const hanako = await signUp(auth, HANAKO);
    const taro = await signUp(auth, TARO);
    const [hanakoRow, taroRow] = await Promise.all([
      db.select().from(user).where(eq(user.email, HANAKO.email)),
      db.select().from(user).where(eq(user.email, TARO.email)),
    ]).then(([a, b]) => [a[0]!, b[0]!]);

    const as = (cookie?: string) =>
      gql<ViewerBody>(handler, VIEWER, { cookie });

    assert.deepEqual(await as(hanako.cookie), {
      data: {
        viewer: { id: hanakoRow.id, email: HANAKO.email, name: HANAKO.name },
      },
    });
    assert.deepEqual(await as(taro.cookie), {
      data: { viewer: { id: taroRow.id, email: TARO.email, name: TARO.name } },
    });
    assert.deepEqual(await as(undefined), { data: { viewer: null } });

    // 署名を壊した cookie・別の秘密で署名した cookie
    const [name, value = ""] = hanako.cookie.split("=") as [string, string];
    const tampered = `${name}=${value.slice(0, -3)}AAA`;
    assert.deepEqual(await as(tampered), { data: { viewer: null } });
    const foreign = (
      await signIn(
        createTestAuth(db, {
          secret: "another-secret-0123456789abcdef0123456789",
        }),
        HANAKO,
      )
    ).cookie;
    assert.deepEqual(await as(foreign), { data: { viewer: null } });

    // 期限切れ
    await db.update(session).set({ expiresAt: new Date(Date.now() - 1000) });
    assert.deepEqual(await as(hanako.cookie), { data: { viewer: null } });
    assert.deepEqual(await as(taro.cookie), { data: { viewer: null } });

    // ログアウト済み・利用者が消えた
    const again = await signIn(auth, HANAKO);
    assert.equal((await as(again.cookie)).data.viewer?.id, hanakoRow.id);
    await auth.handler(
      new Request("http://localhost:3000/api/auth/sign-out", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:3000",
          cookie: again.cookie,
        },
        body: "{}",
      }),
    );
    assert.deepEqual(await as(again.cookie), { data: { viewer: null } });
    const last = await signIn(auth, TARO);
    await db.delete(user).where(eq(user.id, taroRow.id));
    assert.deepEqual(await as(last.cookie), { data: { viewer: null } });
  }));

test("購入の持ち主: ログイン中の createCheckoutSession は利用者の id を client_reference_id に付ける。ゲスト・改ざんした cookie には付けない", () =>
  withTestDb(async ({ db }) => {
    const auth = createTestAuth(db);
    const stripe = recordingStripe();
    const handler = appHandler(auth, db, stripe);
    const hanako = await signUp(auth, HANAKO);
    const [hanakoRow] = await db.select().from(user);

    const member = await gql<CreateBody>(handler, CREATE, {
      variables: { items: ITEMS },
      cookie: hanako.cookie,
    });
    assert.deepEqual(member.data.createCheckoutSession.errors, []);
    assert.equal(stripe.created[0]!.client_reference_id, hanakoRow!.id);

    const guest = await gql<CreateBody>(handler, CREATE, {
      variables: { items: ITEMS },
    });
    assert.deepEqual(guest.data.createCheckoutSession.errors, []);
    assert.ok(!("client_reference_id" in stripe.created[1]!));

    // 署名を壊した cookie はログインしていない扱い（他人の id を名乗れない）
    const [name, value = ""] = hanako.cookie.split("=") as [string, string];
    const forged = await gql<CreateBody>(handler, CREATE, {
      variables: { items: ITEMS },
      cookie: `${name}=${value.slice(0, -3)}AAA`,
    });
    assert.deepEqual(forged.data.createCheckoutSession.errors, []);
    assert.ok(!("client_reference_id" in stripe.created[2]!));
  }));

test("購入の持ち主: ログインして買った注文は、Webhook でも成功ページの確認でも、その利用者の注文として確定する。ゲストの買い物は持ち主なし。応答に持ち主は出さない", () =>
  withTestDb(async ({ db }) => {
    await seedProducts(db);
    const auth = createTestAuth(db);
    const stripe = recordingStripe();
    const handler = appHandler(auth, db, stripe);
    const hanako = await signUp(auth, HANAKO);
    const taro = await signUp(auth, TARO);
    const idOf = async (email: string) =>
      (await db.select().from(user).where(eq(user.email, email)))[0]!.id;

    // 購入手続き → Stripe の session（花子・太郎・ゲスト）。支払いは済んだものとして扱う
    for (const cookie of [hanako.cookie, taro.cookie, undefined]) {
      const r = await gql<CreateBody>(handler, CREATE, {
        variables: { items: ITEMS },
        cookie,
      });
      assert.deepEqual(r.data.createCheckoutSession.errors, []);
    }
    const [hanakoSession, taroSession, guestSession] = [1, 2, 3].map(
      (n) => `cs_test_flow_${n}`,
    ) as [string, string, string];

    // 花子の決済: Webhook が先に確定する
    const webhook = await handleStripeWebhook(
      webhookRequest(
        sessionEvent("checkout.session.completed", hanakoSession, "evt_hanako"),
      ),
      {
        constructEvent,
        secret: WEBHOOK_SECRET,
        getDb: async () => db,
        getStripe: stripe.getStripe,
      },
    );
    assert.equal(webhook.status, 200);
    assert.equal(
      ((await webhook.json()) as { result: string }).result,
      "fulfilled",
    );

    // 太郎・ゲストの決済: 成功ページの確認（GET /api/checkout/session）が確定する。確認ルートは cookie を見ない
    const verify = async (sessionId: string) => {
      const res = await verifyCheckoutSession({
        requestUrl: `http://localhost/api/checkout/session?session_id=${sessionId}`,
        getStripe: stripe.getStripe,
        getDb: async () => db,
      });
      return {
        status: res.status,
        body: (await res.json()) as {
          paid: boolean;
          order?: Record<string, unknown>;
        },
      };
    };
    const taroResult = await verify(taroSession);
    const guestResult = await verify(guestSession);
    for (const result of [taroResult, guestResult]) {
      assert.equal(result.status, 200);
      assert.equal(result.body.paid, true);
      // 画面に返す注文には持ち主（user_id）を含めない
      assert.ok(
        !JSON.stringify(result.body).includes("userId"),
        JSON.stringify(result.body),
      );
      assert.ok(!JSON.stringify(result.body).includes("user_id"));
    }

    // Webhook の確定のあとに成功ページが開いても、持ち主は変わらない（同じ決済の確定は 1 件）
    assert.equal((await verify(hanakoSession)).body.paid, true);

    const rows = await db.select().from(orders);
    const ownerOf = (sessionId: string) =>
      rows.find((row) => row.stripeSessionId === sessionId)!.userId;
    assert.equal(rows.length, 3);
    assert.equal(ownerOf(hanakoSession), await idOf(HANAKO.email));
    assert.equal(ownerOf(taroSession), await idOf(TARO.email));
    assert.equal(ownerOf(guestSession), null);
  }));
