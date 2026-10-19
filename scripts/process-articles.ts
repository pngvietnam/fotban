import { z } from "zod";
import { parseEnvironment } from "../lib/config";
import { createDatabaseClient } from "../lib/database-client";
import { createAIRuntime } from "../lib/ai-runtime";
import { createLogger } from "../lib/logging";
import { processArticle } from "../services/ai-processing";

async function main() {
  const [mode, value, flag, ...extra] = process.argv.slice(2);
  if (extra.length || !["article", "batch"].includes(mode) || (mode === "article" ? !z.uuid().safeParse(value).success : !/^([1-9]|[1-4][0-9]|50)$/.test(value ?? "")) || (flag && flag !== "--retry-failed")) {
    console.error("Usage: npm.cmd run ai:process -- article <uuid> [--retry-failed] | batch <1-50> [--retry-failed]"); process.exitCode = 1; return;
  }
  const env = parseEnvironment(process.env);
  if (!env.DATABASE_URL) { console.error("DATABASE_URL is required."); process.exitCode = 1; return; }
  const db = createDatabaseClient(env.DATABASE_URL);
  try {
    const { store, provider, mode: configuredMode, identity } = createAIRuntime(db, env);
    console.log(JSON.stringify({ mode: configuredMode, provider: provider.name }));
    const articles = mode === "article" ? [{ id: value }] : await store.candidates(Number(value));
    for (const article of articles) {
      const result = await processArticle(article.id, store, provider, { retryFailed: flag === "--retry-failed", identity, logger: createLogger(env.LOG_LEVEL) });
      console.log(JSON.stringify({ articleId: article.id, ...result }));
      if (result.status === "FAILED") process.exitCode = 1;
    }
  } finally { await db.$disconnect(); }
}
main().catch(() => { console.error("Article processing failed. Check configuration, database and migrations. No raw provider error is logged."); process.exitCode = 1; });
