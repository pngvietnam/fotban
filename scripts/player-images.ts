import { createDatabaseClient } from "../lib/database-client";
import { prismaSyncDatabase } from "../lib/sync-database";
import { syncPlayerImages, wikimediaApi } from "../services/player-images";

/** Usage: npm.cmd run players:images -- [maxPlayers] [maxMinutes]. Resumable; safe to rerun. */
async function main() {
  const [limitArg, minutesArg] = process.argv.slice(2);
  const limit = Number(limitArg ?? 100); const minutes = Number(minutesArg ?? 10);
  if (!Number.isInteger(limit) || limit < 1 || limit > 2000 || !Number.isFinite(minutes) || minutes <= 0 || minutes > 120) { console.error("Usage: npm.cmd run players:images -- [maxPlayers 1-2000] [maxMinutes 1-120]"); process.exitCode = 1; return; }
  const userAgent = process.env.WIKIMEDIA_USER_AGENT;
  if (!userAgent || !process.env.DATABASE_URL) { console.error("DATABASE_URL and a contact-bearing WIKIMEDIA_USER_AGENT are required."); process.exitCode = 1; return; }
  const db = createDatabaseClient(process.env.DATABASE_URL);
  try { console.log(JSON.stringify(await syncPlayerImages(prismaSyncDatabase(db), { api: wikimediaApi(userAgent), limit, timeBudgetMs: minutes * 60_000 }))); }
  finally { await db.$disconnect(); }
}
main().catch(() => { console.error("Player image sync failed. Check database readiness and migrations; no raw error is logged."); process.exitCode = 1; });
