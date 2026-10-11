import { getAuth } from "@/lib/auth/server";

// Node ランタイムで動かす（パスワードのハッシュは node:crypto の scrypt、DB の接続は Neon の Pool / PGlite）
export const runtime = "nodejs";

/**
 * 認証: /api/auth/*（Better Auth）
 * 登録 POST /api/auth/sign-up/email・ログイン POST /api/auth/sign-in/email・ログアウト POST /api/auth/sign-out・
 * セッションの取得 GET /api/auth/get-session を受ける。cookie の発行と削除・試行回数の制限・送信元（Origin）の検査は Better Auth が行う。
 * 設定は lib/auth/config.ts、Better Auth を作るのは lib/auth/server.ts の getAuth。
 * 認証を作れなかったとき（本番で BETTER_AUTH_SECRET が無い・DB に繋がらないなど）は、理由を応答に出さず 500 にする。
 */
async function handle(request: Request): Promise<Response> {
  const auth = await getAuth().catch((cause: unknown) => {
    console.error("Auth setup error:", cause);
    return null;
  });
  if (auth === null) {
    return Response.json(
      { message: "認証を利用できません" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
  return auth.handler(request);
}

export const GET = handle;
export const POST = handle;
