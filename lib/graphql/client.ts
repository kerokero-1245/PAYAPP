/**
 * ブラウザから /api/graphql を呼ぶ小さな関数（キャッシュ層は持たない）
 * ---------------------------------------------------
 * 戻り値の型は codegen が SDL から作った型（__generated__/types.ts）で付ける。
 * サーバ専用のもの（server-only の Stripe クライアントなど）は import しない。
 */
import type {
  CartItemInput,
  CheckoutSessionPayload,
  Mutation,
  MutationCreateCheckoutSessionArgs,
} from "./__generated__/types.ts";

export const GRAPHQL_PATH = "/api/graphql";

export type GqlResult<TData> = {
  data?: TData | null;
  errors?: { message: string }[];
};

/** GraphQL を POST で呼ぶ。HTTP や JSON の失敗は例外（呼び出し側で「通信に失敗」として扱う） */
export async function gql<TData, TVariables extends Record<string, unknown> = Record<string, never>>(
  query: string,
  variables?: TVariables
): Promise<{ status: number; body: GqlResult<TData> | null }> {
  const res = await fetch(GRAPHQL_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  let body: GqlResult<TData> | null = null;
  try {
    body = (await res.json()) as GqlResult<TData>;
  } catch {
    body = null;
  }
  return { status: res.status, body };
}

const CREATE_CHECKOUT_SESSION = /* GraphQL */ `
  mutation CreateCheckoutSession($items: [CartItemInput!]!) {
    createCheckoutSession(items: $items) {
      url
      errors {
        code
        message
      }
    }
  }
`;

/**
 * Stripe Checkout Session を作る。価格はサーバがカタログから決めるので、id と数量だけを送る。
 * 戻り値: 成功なら { url }、利用者に見せる理由があれば { error }、どちらでもなければ { error: null }。
 */
export async function createCheckoutSession(
  items: CartItemInput[]
): Promise<{ url: string } | { error: string | null }> {
  const { status, body } = await gql<
    Pick<Mutation, "createCheckoutSession">,
    MutationCreateCheckoutSessionArgs
  >(CREATE_CHECKOUT_SESSION, { items: items.map(({ id, quantity }) => ({ id, quantity })) });
  const payload: CheckoutSessionPayload | undefined = body?.data?.createCheckoutSession;
  if (payload?.url) return { url: payload.url };
  // 見せてよいのは UserError（CHECKOUT_ERRORS の文言）と本文上限の 413 だけ。
  // それ以外の GraphQL エラー（隠された例外・検証エラー）は既定の文言にする
  const message =
    payload?.errors?.[0]?.message ?? (status === 413 ? body?.errors?.[0]?.message : undefined);
  return { error: typeof message === "string" && message ? message : null };
}
