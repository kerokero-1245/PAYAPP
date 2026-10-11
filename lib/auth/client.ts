/**
 * ブラウザから Better Auth（/api/auth/*）を呼ぶクライアント
 * ---------------------------------------------------
 * ログイン・登録・ログアウトの呼び出しと、セッションを読むフック（useSession）を持つ。
 * 登録・ログイン・ログアウトが成功すると、useSession を使っている画面（ヘッダーなど）が自動でセッションを取り直す。
 * 基準の URL は指定しない（今開いているサイトの /api/auth に送る）。
 * クライアントのコード（"use client"）からだけ import する。サーバ側（lib/auth/server.ts・config.ts）は import しない。
 */
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient();
