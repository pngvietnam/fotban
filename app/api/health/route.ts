import { randomUUID } from "node:crypto";
import { getDatabase } from "@/lib/db";
import { checkHealth } from "@/lib/health";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const requestId = randomUUID();
  const db = getDatabase();
  const result = await checkHealth(db ? () => db.$queryRaw`SELECT 1` : null, requestId);
  if (result.status !== 200) logger.warn({ requestId, database: result.body.database }, "health.database_not_ready");
  return Response.json(result.body, {
    status: result.status,
    headers: { "Cache-Control": "no-store", "X-Request-Id": requestId },
  });
}
