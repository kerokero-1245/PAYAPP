import { getStripe } from "@/lib/stripe";
import { createGraphqlHandler } from "@/lib/graphql/handler";

const handler = createGraphqlHandler({ getStripe, baseUrl: process.env.NEXT_PUBLIC_BASE_URL });

export const GET = (request: Request) => handler.fetch(request);
export const POST = (request: Request) => handler.fetch(request);
