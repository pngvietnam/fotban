import { getDatabase } from "@/lib/db";
import { logger } from "@/lib/logger";
import { defaultMatchWindow, listMatches, matchReadSchema } from "@/services/match-queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = matchReadSchema.safeParse({ ...defaultMatchWindow(), ...params });
  if (!parsed.success) return Response.json({ error: "Invalid match filters. Use UTC dates with a maximum 31-day interval." }, { status: 400 });
  const requestId = crypto.randomUUID();
  try {
    const db = getDatabase();
    if (!db) return Response.json({ error: "Database is not configured.", requestId }, { status: 503 });
    return Response.json(await listMatches(db, parsed.data), { headers: { "Cache-Control": "no-store" } });
  } catch {
    logger.error({ requestId }, "matches.read_failed");
    return Response.json({ error: "Match data is temporarily unavailable.", requestId }, { status: 503 });
  }
}
