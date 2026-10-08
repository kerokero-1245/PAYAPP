import { getStripe } from "@/lib/stripe";
import { createGraphqlHandler } from "@/lib/graphql/handler";

const handler = createGraphqlHandler({ getStripe, baseUrl: process.env.NEXT_PUBLIC_BASE_URL });

export const GET = (request: Request) => handler.fetch(request);
export const POST = (request: Request) => handler.fetch(request);
// Next の既定の OPTIONS（204）ではなく handler に返させる（no-store・CORS なしをそろえる）
export const OPTIONS = (request: Request) => handler.fetch(request);
