import { writeFile } from "node:fs/promises";
import { createDatabaseClient } from "../lib/database-client";
import { prismaSyncDatabase } from "../lib/sync-database";
import { createAIRuntime } from "../lib/ai-runtime";
import { parseEnvironment } from "../lib/config";
import { GdeltNewsProvider } from "../providers/gdelt/provider";
import { NewsDiscoveryService } from "../services/news-discovery";
import { processArticle } from "../services/ai-processing";
import { ReliabilityService } from "../services/reliability-service";
import { StoryClusteringService } from "../services/story-clustering";

async function main() {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== "--output" || !/^docs\/samples\/[a-z0-9-]+\.json$/.test(args[1]))) throw new Error("Use --output docs/samples/<name>.json");
  const env = parseEnvironment(process.env);
  if (!env.DATABASE_URL) throw new Error("DATABASE_URL required");
  const client = createDatabaseClient(env.DATABASE_URL);
  try {
    const db = prismaSyncDatabase(client); const { store, provider, identity } = createAIRuntime(client, env);
    const discovery = await new NewsDiscoveryService(db, (query) => new GdeltNewsProvider(query)).run();
    const processing = []; const reliability = [];
    for (const id of discovery.articleIds) {
      processing.push({ articleId: id, ...await processArticle(id, store, provider, { identity }) });
      const assessment = await new ReliabilityService(db).assessArticle(id);
      reliability.push({ articleId: id, eligible: assessment?.result.publishability.eligible ?? false, blockers: assessment?.result.publishability.blockers ?? [] });
    }
    const clusters = discovery.articleIds.length ? await new StoryClusteringService(db).cluster({ since: new Date(Date.now() - 24 * 3600000) }) : [];
    const report = { checkedAt: new Date().toISOString(), discovery, processing, reliability, clusters: clusters.map((c) => ({ id: c.clusterId, changed: c.changed, eligible: c.snapshot.eligible, blockers: c.snapshot.blockers })) };
    const output = JSON.stringify(report, null, 2); console.log(output);
    if (args[1]) await writeFile(args[1], output + "\n", "utf8");
    if (discovery.status === "FAILED") process.exitCode = 1;
  } finally { await client.$disconnect(); }
}
main().catch(() => { console.error("Discovery pipeline failed. Check database, migrations and discovery service configuration. Raw errors withheld."); process.exitCode = 1; });
