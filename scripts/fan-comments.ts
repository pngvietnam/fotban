import { parseEnvironment } from "../lib/config";
import { createDatabaseClient } from "../lib/database-client";
import { createLogger } from "../lib/logging";
import { prismaSyncDatabase } from "../lib/sync-database";
import { youTubeCommentApi } from "../providers/youtube/comments";
import { purgeOldFanComments, syncFanComments } from "../services/fan-pulse";

/** One manual pass of the fan pulse (the worker runs it every 30 minutes): reads due videos' comments within the budget. */
async function main() {
  const env = parseEnvironment(process.env);
  if (!env.DATABASE_URL) { console.error("DATABASE_URL is required."); process.exitCode = 1; return; }
  const db = createDatabaseClient(env.DATABASE_URL);
  try {
    const database = prismaSyncDatabase(db);
    if (!env.YOUTUBE_API_KEY) { console.log(JSON.stringify({ skipped: "NOT_CONFIGURED", purged: await purgeOldFanComments(database) })); return; }
    console.log(JSON.stringify(await syncFanComments(database, youTubeCommentApi(env.YOUTUBE_API_KEY), { log: createLogger(env.LOG_LEVEL) })));
  } finally { await db.$disconnect(); }
}
main().catch(() => { console.error("Fan comment sync stopped. Check database readiness and migrations; no raw error is logged."); process.exitCode = 1; });
