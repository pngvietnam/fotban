import { z } from "zod";
import { getDatabase } from "@/lib/db";
import { logger } from "@/lib/logger";
import { listStandings } from "@/services/match-queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const league = z.string().regex(/^[a-z0-9-]{1,80}$/).safeParse(new URL(request.url).searchParams.get("league"));
  if (!league.success) return Response.json({ error: "A league slug is required." }, { status: 400 });
  const requestId = crypto.randomUUID();
  try {
    const db = getDatabase();
    if (!db) return Response.json({ error: "Database is not configured.", requestId }, { status: 503 });
    return Response.json(await listStandings(db, league.data), { headers: { "Cache-Control": "no-store" } });
  } catch {
    logger.error({ requestId }, "standings.read_failed");
    return Response.json({ error: "Standings are temporarily unavailable.", requestId }, { status: 503 });
  }
}
