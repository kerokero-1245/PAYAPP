import { getViewerFromHeaders } from "@/lib/auth/server";
import { getDb } from "@/lib/db/client";
import { getStripe } from "@/lib/stripe";
import { createGraphqlHandler } from "@/lib/graphql/handler";

const handler = createGraphqlHandler({
  getStripe,
  getDb,
  // ログイン中の利用者は cookie から引く（cookie が無い要求は DB に触れない）
  getViewer: (request) => getViewerFromHeaders(request.headers),
  baseUrl: process.env.NEXT_PUBLIC_BASE_URL,
});

export const GET = (request: Request) => handler.fetch(request);
export const POST = (request: Request) => handler.fetch(request);
// Next の既定の OPTIONS（204）ではなく handler に返させる（no-store・CORS なしをそろえる）
export const OPTIONS = (request: Request) => handler.fetch(request);
