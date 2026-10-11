/**
 * GraphQL の認可（ログインしているかの確認）
 * ---------------------------------------------------
 * ログインが要るフィールドは、resolver の中で毎回 `if (!viewer) throw …` と書かずに、requireViewer を 1 回呼ぶ。
 * 未ログインのエラーは extensions.code = "UNAUTHENTICATED" と固定の文言（maskedErrors を通っても、この文言とコードは残る）。
 * 持ち主かどうか（他の人の注文を返さない）は、ここではなく DB の where で決める（lib/order-history.ts）。
 * 管理者の確認（FORBIDDEN）は、管理画面の段で requireAdmin としてここに足す。
 */
import { GraphQLError } from "graphql";
import type { Viewer } from "../types.ts";

/** extensions.code の値 */
export const UNAUTHENTICATED = "UNAUTHENTICATED";
export const BAD_USER_INPUT = "BAD_USER_INPUT";

/** 未ログインのときの文言（固定。利用者の入力や内部の情報は含めない） */
export const UNAUTHENTICATED_MESSAGE = "ログインが必要です";

/**
 * ログイン中の利用者を返す。ログインしていなければ UNAUTHENTICATED のエラーを投げる。
 * 利用者を引けなかった（DB に繋がらないなど）ときは、getViewer の例外がそのまま上がる（ゲスト扱いにしない）。
 */
export async function requireViewer(context: {
  getViewer: () => Promise<Viewer | null>;
}): Promise<Viewer> {
  const viewer = await context.getViewer();
  if (!viewer) {
    throw new GraphQLError(UNAUTHENTICATED_MESSAGE, {
      extensions: { code: UNAUTHENTICATED },
    });
  }
  return viewer;
}
