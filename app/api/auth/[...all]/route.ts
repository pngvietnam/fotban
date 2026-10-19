import { getAuth } from "../../../../lib/auth";
import { env } from "../../../../lib/env";
import { logger } from "../../../../lib/logger";
import { authRequest } from "../../../../services/auth-http";

async function handle(request: Request) {
  const auth = getAuth();
  return authRequest(request, { appUrl: env.NEXT_PUBLIC_APP_URL, handler: auth ? (request) => auth.handler(request) : null, onError: () => logger.warn({ event: "auth_request_failed", category: "AUTH" }) });
}
export const GET = handle;
export const POST = handle;
