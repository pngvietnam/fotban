import { createDatabaseClient } from "../lib/database-client";
import { prismaSyncDatabase } from "../lib/sync-database";
import { decideFeedCard, FeedCardDecisionError, heldFeedCards, publishFeedCards } from "../services/feed-cards";

const usage = `Usage: npm.cmd run news:cards -- publish
       npm.cmd run news:cards -- held
       npm.cmd run news:cards -- approve <article-uuid> --reviewer "<name>" --reason "<reason>" --confirm
       npm.cmd run news:cards -- hide <article-uuid> --reviewer "<name>" --reason "<reason>" --confirm`;
const option = (args: string[], name: string) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; };
async function main() {
  const [mode, target, ...rest] = process.argv.slice(2);
  const decision = mode === "approve" ? "PUBLISHED" as const : mode === "hide" ? "HIDDEN" as const : null;
  const reviewer = option(rest, "--reviewer"); const reason = option(rest, "--reason");
  if (!["publish", "held", "approve", "hide"].includes(mode) || (decision ? !target || !reviewer || !reason || !rest.includes("--confirm") : Boolean(target))) { console.error(usage); process.exitCode = 1; return; }
  if (!process.env.DATABASE_URL) { console.error("DATABASE_URL is required."); process.exitCode = 1; return; }
  const db = createDatabaseClient(process.env.DATABASE_URL);
  try {
    const database = prismaSyncDatabase(db);
    if (mode === "publish") console.log(JSON.stringify(await publishFeedCards(database)));
    else if (mode === "held") for (const card of await heldFeedCards(database)) console.log(JSON.stringify(card));
    else console.log(JSON.stringify(await decideFeedCard(database, { articleId: target, decision: decision!, reviewer: reviewer!, reason: reason! })));
  } finally { await db.$disconnect(); }
}
main().catch((error) => {
  console.error(error instanceof FeedCardDecisionError ? `Decision refused: ${error.code}.` : "Feed card command failed. Check database readiness and migrations; no raw error is logged.");
  process.exitCode = 1;
});
