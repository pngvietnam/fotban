import { createDatabaseClient } from "../lib/database-client";
import { prismaSyncDatabase } from "../lib/sync-database";
import { NewsSyncStore } from "../services/news-store";
import { grantVietnameseSources, NewsGrantError, revokeVietnameseSource, setSourceImages } from "../services/news-grant";

const usage = [
  'Usage: npm.cmd run news:grant -- grant <slug|all> --reviewer "<name>" --reason "<reason>" --confirm',
  '       npm.cmd run news:grant -- images <slug|all> on|off --reviewer "<name>" --reason "<reason>" --confirm',
  '       npm.cmd run news:grant -- revoke <slug> --reviewer "<name>" --reason "<reason>" --confirm',
].join("\n");
function option(args: string[], name: string) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}
async function main() {
  const [mode, target, ...rest] = process.argv.slice(2);
  const reviewer = option(rest, "--reviewer"); const reason = option(rest, "--reason");
  // `images` takes an on|off word before the options.
  const toggle = mode === "images" ? rest[0] : undefined;
  if (!["grant", "revoke", "images"].includes(mode) || !target || !reviewer || !reason || !rest.includes("--confirm") || (mode === "revoke" && target === "all") || (mode === "images" && !["on", "off"].includes(toggle ?? ""))) {
    console.error(usage); process.exitCode = 1; return;
  }
  if (!process.env.DATABASE_URL) { console.error("DATABASE_URL is required."); process.exitCode = 1; return; }
  const db = createDatabaseClient(process.env.DATABASE_URL);
  try {
    const database = prismaSyncDatabase(db);
    // Make sure every registry source exists before changing it.
    await new NewsSyncStore(database).registerSources();
    const slugs = target === "all" ? "all" as const : target.split(",").map((slug) => slug.trim()).filter(Boolean);
    const results = mode === "grant" ? await grantVietnameseSources(database, { slugs, reviewer, reason })
      : mode === "images" ? await setSourceImages(database, { slugs, reviewer, reason, allowed: toggle === "on" })
      : await revokeVietnameseSource(database, { slugs, reviewer, reason });
    for (const result of results) console.log(JSON.stringify(result));
  } finally { await db.$disconnect(); }
}
main().catch((error) => {
  console.error(error instanceof NewsGrantError ? `Grant refused: ${error.code}.` : "Grant command failed. Check database readiness and migrations; no raw error is logged.");
  process.exitCode = 1;
});
