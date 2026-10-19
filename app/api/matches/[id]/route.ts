import { z } from "zod";
import { getDatabase } from "@/lib/db";
import { logger } from "@/lib/logger";
import { readMatch } from "@/services/match-queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) return Response.json({ error: "Match not found." }, { status: 404 });
  const requestId = crypto.randomUUID();
  try {
    const db = getDatabase();
    if (!db) return Response.json({ error: "Database is not configured.", requestId }, { status: 503 });
    const match = await readMatch(db, id);
    return match ? Response.json({ match }, { headers: { "Cache-Control": "no-store" } }) : Response.json({ error: "Match not found." }, { status: 404 });
  } catch {
    logger.error({ requestId }, "matches.detail_failed");
    return Response.json({ error: "Match data is temporarily unavailable.", requestId }, { status: 503 });
  }
}
