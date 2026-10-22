import { createDatabaseClient } from "../lib/database-client";
import { prismaSyncDatabase } from "../lib/sync-database";
import { liveFanReader, syncFanThreads } from "../services/fan-threads";

async function main() {
  if (!process.env.DATABASE_URL) { console.error("DATABASE_URL is required."); process.exitCode = 1; return; }
  const db = createDatabaseClient(process.env.DATABASE_URL);
  try { console.log(JSON.stringify(await syncFanThreads(prismaSyncDatabase(db), liveFanReader))); } finally { await db.$disconnect(); }
}
main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
