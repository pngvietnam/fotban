import { parseEnvironment } from "../lib/config";
import { createDatabaseClient } from "../lib/database-client";
import { createMatchRuntime } from "../lib/match-runtime";
import { prismaSyncDatabase } from "../lib/sync-database";
import { leagueNames } from "../services/league-hub";
import { syncLeagueLeaders } from "../services/league-leaders";
import type { LeagueSlug } from "../types/league-hub";

/** Reads every league's top scorers whose stored copy is due (the worker does this on its passes): npm.cmd run leagues:leaders */
async function main() {
  const env = parseEnvironment(process.env);
  if (!env.DATABASE_URL || !env.FOOTBALL_DATA_API_KEY) { console.error("DATABASE_URL and FOOTBALL_DATA_API_KEY are required."); process.exitCode = 1; return; }
  const db = createDatabaseClient(env.DATABASE_URL);
  try {
    const { provider } = createMatchRuntime(db, env);
    const database = prismaSyncDatabase(db);
    for (const slug of Object.keys(leagueNames) as LeagueSlug[]) console.log(JSON.stringify({ slug, read: await syncLeagueLeaders(database, provider, slug) }));
  } finally { await db.$disconnect(); }
}
void main().catch(() => { console.error("League leaders sync failed."); process.exitCode = 1; });
