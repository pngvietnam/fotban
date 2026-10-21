import { parseEnvironment } from "../lib/config";
import { createDatabaseClient } from "../lib/database-client";
import { createMatchDetailApi } from "../lib/match-runtime";
import { prismaSyncDatabase } from "../lib/sync-database";
import { h2hCandidates, syncHeadToHead } from "../services/head-to-head";

/** One pass of the head-to-head sync (the worker runs it on every pass): npm.cmd run matches:h2h */
async function main() {
  const env = parseEnvironment(process.env);
  if (!env.DATABASE_URL || !env.HIGHLIGHTLY_API_KEY) { console.error("DATABASE_URL and HIGHLIGHTLY_API_KEY are required."); process.exitCode = 1; return; }
  const db = createDatabaseClient(env.DATABASE_URL);
  try {
    const database = prismaSyncDatabase(db);
    console.log(JSON.stringify({ candidates: (await h2hCandidates(database, new Date())).length }));
    console.log(JSON.stringify(await syncHeadToHead(database, createMatchDetailApi(db, env.HIGHLIGHTLY_API_KEY))));
  } finally { await db.$disconnect(); }
}
void main().catch(() => { console.error("Head-to-head sync failed."); process.exitCode = 1; });
