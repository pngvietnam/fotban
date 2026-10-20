import { createDatabaseClient } from "../lib/database-client";
import { createMatchDetailApi } from "../lib/match-runtime";
import { prismaSyncDatabase } from "../lib/sync-database";
import { relinkMatchDetails, scheduleDetailRefetch, syncMatchDetails } from "../services/match-details";

/**
 * Usage: npm.cmd run matches:details            one pass of events/lineups/statistics for due matches; safe to rerun.
 *        npm.cmd run matches:details -- --relink re-link stored names to squad players (no provider request).
 *        npm.cmd run matches:details -- --refetch schedule finished matches to be read again by the worker (within the daily allowance).
 */
async function main() {
  const relink = process.argv.includes("--relink"); const refetch = process.argv.includes("--refetch");
  const apiKey = process.env.HIGHLIGHTLY_API_KEY?.trim();
  if ((!apiKey && !relink && !refetch) || !process.env.DATABASE_URL) { console.error("DATABASE_URL and HIGHLIGHTLY_API_KEY are required."); process.exitCode = 1; return; }
  const db = createDatabaseClient(process.env.DATABASE_URL);
  try { console.log(JSON.stringify(refetch ? await scheduleDetailRefetch(prismaSyncDatabase(db)) : relink ? await relinkMatchDetails(prismaSyncDatabase(db)) : await syncMatchDetails(prismaSyncDatabase(db), createMatchDetailApi(db, apiKey!)))); }
  finally { await db.$disconnect(); }
}
main().catch(() => { console.error("Match detail sync stopped. Check the database and the key; no raw error is logged."); process.exitCode = 1; });
