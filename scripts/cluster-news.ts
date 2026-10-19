import { parseEnvironment } from "../lib/config";
import { createDatabaseClient } from "../lib/database-client";
import { prismaSyncDatabase } from "../lib/sync-database";
import { StoryClusteringService } from "../services/story-clustering";

async function main() {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== "--since" || !/^[1-9]\d{0,3}h$/.test(args[1]))) { console.error("Usage: npm.cmd run news:cluster [-- --since 24h]"); process.exitCode = 1; return; }
  const env = parseEnvironment(process.env);
  if (!env.DATABASE_URL) { console.error("DATABASE_URL is required."); process.exitCode = 1; return; }
  const db = createDatabaseClient(env.DATABASE_URL);
  try {
    const now = new Date(); const since = args[1] ? new Date(now.getTime() - Number(args[1].slice(0, -1)) * 3600000) : undefined;
    const results = await new StoryClusteringService(prismaSyncDatabase(db)).cluster({ since, now });
    for (const result of results) console.log(JSON.stringify({ clusterId: result.clusterId, changed: result.changed, revision: result.revision, articleCount: result.snapshot.articleCount, sourceCount: result.snapshot.sourceCount, independentSourceCount: result.snapshot.independentSourceCount, disputed: result.snapshot.disputed, eligible: result.snapshot.eligible, blockers: result.snapshot.blockers }));
    console.log(JSON.stringify({ clustersAssessed: results.length, changed: results.filter((result) => result.changed).length }));
  } finally { await db.$disconnect(); }
}
main().catch((error: unknown) => { const code = error instanceof Error && error.message === "CLUSTER_BATCH_TOO_LARGE" ? "CLUSTER_BATCH_TOO_LARGE: narrow --since; selected clusters must fit the batch." : "Clustering failed. Check database, migrations and configuration; raw errors withheld."; console.error(code); process.exitCode = 1; });
