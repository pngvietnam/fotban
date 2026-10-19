import "server-only";
import { activeUser } from "./auth";
import { getDatabase } from "./db";
import { env } from "./env";
import { logger } from "./logger";
import { prismaSyncDatabase } from "./sync-database";
import { accountRequest, privateHeaders } from "../services/account-http";

export async function handleAccountRequest(request: Request) {
  const db = getDatabase();
  if (!db) return Response.json({ error: "Tài khoản tạm thời chưa khả dụng." }, { status: 503, headers: privateHeaders });
  return accountRequest(request, { database: prismaSyncDatabase(db), session: () => activeUser(request.headers), appUrl: env.NEXT_PUBLIC_APP_URL, onError: () => logger.warn({ event: "account_request_failed", category: "INTERNAL" }) });
}
