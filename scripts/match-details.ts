import { createDatabaseClient } from "../lib/database-client";
import { createMatchDetailApi } from "../lib/match-runtime";
import { prismaSyncDatabase } from "../lib/sync-database";
import { syncMatchDetails } from "../services/match-details";

/** Usage: npm.cmd run matches:details. One pass of events/lineups/statistics for due matches; safe to rerun. */
async function main() {
  const apiKey = process.env.HIGHLIGHTLY_API_KEY?.trim();
  if (!apiKey || !process.env.DATABASE_URL) { console.error("DATABASE_URL and HIGHLIGHTLY_API_KEY are required."); process.exitCode = 1; return; }
  const db = createDatabaseClient(process.env.DATABASE_URL);
  try { console.log(JSON.stringify(await syncMatchDetails(prismaSyncDatabase(db), createMatchDetailApi(db, apiKey)))); }
  finally { await db.$disconnect(); }
}
main().catch(() => { console.error("Match detail sync stopped. Check the database and the key; no raw error is logged."); process.exitCode = 1; });
