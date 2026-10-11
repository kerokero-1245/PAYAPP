import "server-only";
import { headers } from "next/headers";
import { getDb } from "../db/client.ts";
import type { Viewer } from "../types.ts";
import { createAuth, resolveAuthSettings } from "./config.ts";
import type { Auth } from "./config.ts";
import { viewerFromHeaders } from "./viewer.ts";

/**
 * アプリ（Route Handler・サーバコンポーネント）が認証を受け取る入口
 * ---------------------------------------------------
 * - getAuth: Better Auth の本体。プロセスで 1 つだけ作る（lib/db/client.ts の getDb と同じ流儀。next dev は
 *   モジュールを読み直すので globalThis に持たせ、作るのに失敗したら覚えず次の呼び出しでやり直す）
 * - getViewerFromHeaders: リクエストのヘッダー（cookie）からログイン中の利用者を引く。Route Handler と GraphQL が使う
 * - getViewer: サーバコンポーネント（ページ）がセッションを取る 1 か所の関数。リクエストのヘッダーを Next から受ける
 *
 * "server-only" により、クライアントのコードから import するとビルドが失敗する（lib/stripe.ts・lib/db/client.ts と同じ）。
 * そのためテストはここを読まず、lib/auth/config.ts の createAuth に PGlite を差し込む。
 */
const store = globalThis as typeof globalThis & {
  __payappAuth?: Promise<Auth>;
};

export function getAuth(): Promise<Auth> {
  if (store.__payappAuth === undefined) {
    const pending = getDb().then((db) =>
      createAuth(db, resolveAuthSettings(process.env)),
    );
    pending.catch(() => {
      if (store.__payappAuth === pending) store.__payappAuth = undefined;
    });
    store.__payappAuth = pending;
  }
  return store.__payappAuth;
}

/** リクエストのヘッダー（cookie）から、ログイン中の利用者を引く（ログインしていなければ null）。Route Handler と GraphQL が使う */
export function getViewerFromHeaders(
  requestHeaders: Headers,
): Promise<Viewer | null> {
  return viewerFromHeaders(getAuth, requestHeaders);
}

/** サーバコンポーネント（ページ）がログイン中の利用者を引く（ログインしていなければ null） */
export async function getViewer(): Promise<Viewer | null> {
  return getViewerFromHeaders(new Headers(await headers()));
}
