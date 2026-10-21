import { parseEnvironment } from "../lib/config";
import { createDatabaseClient } from "../lib/database-client";
import { createMatchDetailApi } from "../lib/match-runtime";
import { prismaSyncDatabase } from "../lib/sync-database";
import { syncPlayerProfiles } from "../services/player-profiles";

/** One pass of the player-profile sync (the worker runs it on every pass): npm.cmd run players:profiles */
async function main() {
  const env = parseEnvironment(process.env);
  if (!env.DATABASE_URL || !env.HIGHLIGHTLY_API_KEY) { console.error("DATABASE_URL and HIGHLIGHTLY_API_KEY are required."); process.exitCode = 1; return; }
  const db = createDatabaseClient(env.DATABASE_URL);
  try { console.log(JSON.stringify(await syncPlayerProfiles(prismaSyncDatabase(db), createMatchDetailApi(db, env.HIGHLIGHTLY_API_KEY)))); } finally { await db.$disconnect(); }
}
void main().catch(() => { console.error("Player profile sync failed."); process.exitCode = 1; });
