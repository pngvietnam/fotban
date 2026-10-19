import { parseEnvironment } from "../lib/config";
import { createDatabaseClient } from "../lib/database-client";
import { createLogger } from "../lib/logging";
import { createNewsRuntime } from "../lib/news-runtime";
import { syncNews } from "../services/news-sync";
import { vietnameseSource } from "../providers/news/vietnamese-sources";

async function main() {
  const [mode, slug, ...extra] = process.argv.slice(2);
  if (!["all", "source", "smoke", "sources", "vietnamese"].includes(mode) || extra.length || (mode === "source" ? !slug : Boolean(slug))) {
    console.error("Usage: npm.cmd run news:sync -- all | vietnamese | source <slug> | smoke | sources"); process.exitCode = 1; return;
  }
  const env = parseEnvironment(process.env);
  if (!env.DATABASE_URL) { console.error("DATABASE_URL is required for news sync."); process.exitCode = 1; return; }
  const db = createDatabaseClient(env.DATABASE_URL);
  try {
    const { store, createProvider } = createNewsRuntime(db, { wikimediaUserAgent: env.WIKIMEDIA_USER_AGENT });
    await store.registerSources();
    const sources = await store.sources();
    if (mode === "sources") {
      for (const source of sources) console.log(JSON.stringify({ slug: source.slug, name: source.name, enabled: source.enabled, termsReviewed: source.termsReviewed, ingestionAllowed: source.ingestionAllowed, permissionStatus: source.permissionStatus, commercialReuseAllowed: source.commercialReuseAllowed, ingestionMethod: source.ingestionMethod, official: source.official }));
      return;
    }
    const selected = mode === "source" ? sources.filter((source) => source.slug === slug) : mode === "vietnamese" ? sources.filter((source) => vietnameseSource(source.slug)) : sources;
    if (!selected.length) { console.error("No configured news source matches this selection."); process.exitCode = 1; return; }
    const results = await syncNews(selected, store, createProvider, { limit: mode === "smoke" ? 2 : 20, logger: createLogger(env.LOG_LEVEL) });
    for (const result of results) console.log(JSON.stringify(result));
    if (results.some((result) => result.status === "failed" || result.rejected || result.conflicts)) process.exitCode = 1;
    if (mode === "source" && results.every((result) => result.status === "skipped")) process.exitCode = 1;
    if (mode === "smoke") {
      const verifiedSources = selected.filter((source) => source.requiresReusableLicense && results.some((result) => result.source === source.slug && ["synced", "cached"].includes(result.status)));
      const licensedArticles = await db.article.count({ where: { sourceId: { in: verifiedSources.map((source) => source.id) }, commercialReuseAllowed: true, licenseName: "CC BY 4.0", licenseUrl: "https://creativecommons.org/licenses/by/4.0/", publishedAt: { not: null }, attributionText: { not: null }, licenseEvidenceUrl: { not: null }, sourceRevisionUrl: { not: null } } });
      console.log(JSON.stringify({ licensedArticles, cachedVerification: results.some((result) => result.status === "cached") }));
      if (!licensedArticles && !results.some((result) => result.status === "synced" && (result.processed ?? 0) > 0)) {
        console.error("Live news ingestion NOT verified: sources are gated, empty or unavailable. No permissions are bypassed."); process.exitCode = 1;
      }
    }
  } finally { await db.$disconnect(); }
}
main().catch(() => { console.error("News command failed. Check database readiness, migrations and source configuration. No raw error is logged."); process.exitCode = 1; });
