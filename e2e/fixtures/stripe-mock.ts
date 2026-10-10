/**
 * Stripe への通信の差し替え
 * ---------------------------------------------------
 * ブラウザから Stripe へ向かう通信は 2 本だけで、どちらもブラウザ発なので page.route で差し替えられる
 * （サーバ側に偽物を入れる必要はない）:
 *  - カートの「購入手続きへ」→ POST /api/graphql の createCheckoutSession → 返った url へ遷移
 *  - /success → GET /api/checkout/session?session_id=… （決済の確認）
 *
 * 既定で閉じる: closeStripeRoutes が、これらをテストのたびに context で塞ぐ（fixtures/index.ts の自動 fixture）。
 * テストが page.route で明示的にモックしたときだけ通る（page の route が context の route より先に効く）。
 * モックし忘れた通信は止めて、テストを失敗させる。
 */
import type { BrowserContext, Page, Request, Route } from "@playwright/test";
import { CHECKOUT_REDIRECT_URL, ORDER_NO } from "../constants.ts";
import { confirmedOrder } from "../support/catalog.ts";
import type { ItemQuantity } from "../../lib/types.ts";

const GRAPHQL_ROUTE = "**/api/graphql";
const VERIFY_ROUTE = "**/api/checkout/session**";
const STRIPE_HOST_ROUTE = "https://checkout.stripe.com/**";

/**
 * Stripe 行きの通信を塞ぐ。モックされずにここへ届いた通信は止めて、記録を返す
 * （呼び出し側が、テストの最後に空であることを確かめる）。
 */
export async function closeStripeRoutes(
  context: BrowserContext,
): Promise<string[]> {
  const leaks: string[] = [];
  const close = (route: Route) => {
    const request = route.request();
    leaks.push(`${request.method()} ${request.url()}`);
    return route.abort("blockedbyclient");
  };
  for (const pattern of [GRAPHQL_ROUTE, VERIFY_ROUTE, STRIPE_HOST_ROUTE]) {
    await context.route(pattern, close);
  }
  return leaks;
}

/* ---------- createCheckoutSession（POST /api/graphql） ---------- */

/** createCheckoutSession への応答 */
export type CheckoutReply =
  /** 決済ページの url を返す（CHECKOUT_REDIRECT_URL） */
  | { kind: "url" }
  /** 利用者に見せてよい理由（GraphQL の UserError） */
  | { kind: "user-error"; code: string; message: string }
  /** GraphQL の隠された例外（yoga の maskedErrors。理由は見せない） */
  | { kind: "masked-error" }
  /** 通信そのものの失敗 */
  | { kind: "network-error" };

/** ブラウザが送った GraphQL の要求 */
export type CheckoutRequest = { query: string; variables: unknown };

export type CheckoutMock = {
  /** 届いた要求（古い順） */
  readonly requests: CheckoutRequest[];
  /** 以後の応答を替える */
  reply(next: CheckoutReply): void;
  /** 応答を返すのを止める。戻り値の関数を呼ぶと返す（待っている間の画面を確かめるため） */
  hold(): () => void;
};

function readGraphqlRequest(request: Request): CheckoutRequest {
  const body: unknown = request.postDataJSON();
  const { query, variables } = (body ?? {}) as {
    query?: unknown;
    variables?: unknown;
  };
  return { query: typeof query === "string" ? query : "", variables };
}

function graphqlBody(
  reply: Exclude<CheckoutReply, { kind: "network-error" }>,
): unknown {
  switch (reply.kind) {
    case "url":
      return {
        data: {
          createCheckoutSession: { url: CHECKOUT_REDIRECT_URL, errors: [] },
        },
      };
    case "user-error":
      return {
        data: {
          createCheckoutSession: {
            url: null,
            errors: [{ code: reply.code, message: reply.message }],
          },
        },
      };
    case "masked-error":
      return { data: null, errors: [{ message: "Unexpected error." }] };
  }
}

/** createCheckoutSession への応答を差し替える */
export async function mockCheckout(
  page: Page,
  initial: CheckoutReply,
): Promise<CheckoutMock> {
  const requests: CheckoutRequest[] = [];
  let current = initial;
  let gate: Promise<void> | null = null;
  await page.route(GRAPHQL_ROUTE, async (route) => {
    requests.push(readGraphqlRequest(route.request()));
    if (gate) await gate;
    const reply = current;
    if (reply.kind === "network-error") return route.abort("failed");
    return route.fulfill({ status: 200, json: graphqlBody(reply) });
  });
  return {
    requests,
    reply(next) {
      current = next;
    },
    hold() {
      let open = () => {};
      gate = new Promise<void>((resolve) => {
        open = resolve;
      });
      return () => {
        gate = null;
        open();
      };
    },
  };
}

/** モックの決済ページの見出し（遷移先に着いたことを確かめるのに使う） */
export const STRIPE_MOCK_HEADING = "Stripe Checkout（モック）";

/** 遷移先の Stripe の決済ページを小さな HTML で返す（外には出ない） */
export async function mockStripeHost(page: Page): Promise<void> {
  await page.route(STRIPE_HOST_ROUTE, (route) =>
    route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: `<!doctype html><html lang="ja"><meta charset="utf-8"><title>${STRIPE_MOCK_HEADING}</title><h1>${STRIPE_MOCK_HEADING}</h1></html>`,
    }),
  );
}

/* ---------- 決済の確認（GET /api/checkout/session） ---------- */

/** 決済の確認への応答 */
export type VerifyReply =
  /**
   * 支払い済み。購入した品目と数量から、実サーバと同じ形の注文（DB に確定した注文。注文番号つき）を返す。
   * 注文番号は orderNo（既定は ORDER_NO）
   */
  | { kind: "paid"; items: ItemQuantity[]; orderNo?: string }
  /** 未払い、または session が存在しない（200 { paid: false }） */
  | { kind: "unpaid" }
  /** 確認できなかった（502 など） */
  | { kind: "error"; status: number }
  /** モックせず実サーバに通す（session_id の形が不正なときの 400 は Stripe を呼ばないので、実サーバで確かめられる） */
  | { kind: "real-server" };

/** 確認ルートへの 1 回の問い合わせ */
export type VerifyCall = {
  sessionId: string | null;
  /** real-server のときだけ、実サーバが返した HTTP ステータス */
  realStatus: number | null;
};

export type VerifyMock = {
  /** 届いた問い合わせ（古い順） */
  readonly calls: VerifyCall[];
  /** 以後の応答を替える */
  reply(next: VerifyReply): void;
};

/** 決済の確認への応答を差し替える */
export async function mockVerify(
  page: Page,
  initial: VerifyReply,
): Promise<VerifyMock> {
  const calls: VerifyCall[] = [];
  let current = initial;
  await page.route(VERIFY_ROUTE, async (route) => {
    const sessionId = new URL(route.request().url()).searchParams.get(
      "session_id",
    );
    const reply = current;
    switch (reply.kind) {
      case "real-server": {
        const response = await route.fetch();
        calls.push({ sessionId, realStatus: response.status() });
        return route.fulfill({ response });
      }
      case "paid":
        calls.push({ sessionId, realStatus: null });
        return route.fulfill({
          status: 200,
          json: {
            paid: true,
            order: confirmedOrder(
              sessionId ?? "",
              reply.items,
              reply.orderNo ?? ORDER_NO,
            ),
          },
        });
      case "unpaid":
        calls.push({ sessionId, realStatus: null });
        return route.fulfill({ status: 200, json: { paid: false } });
      case "error":
        calls.push({ sessionId, realStatus: null });
        return route.fulfill({
          status: reply.status,
          json: { paid: false, error: "決済情報を確認できませんでした" },
        });
    }
  });
  return {
    calls,
    reply(next) {
      current = next;
    },
  };
}
