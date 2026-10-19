import { createDatabaseClient } from "../lib/database-client";
import { vietnameseCatalog } from "../lib/news-runtime";
import { resolveEntities } from "../providers/ai/rules";
import { VietnameseRssNewsProvider } from "../providers/news/vietnamese-provider";
import { vietnameseSources } from "../providers/news/vietnamese-sources";
import type { NewsSourceConfig } from "../types/news-provider";

/**
 * Read-only preview: fetches each verified registry feed once (robots-aware, same HTTP client)
 * and prints what the relevance filter would keep. Nothing is written to the database and
 * no permission is changed; this exists to tune filters before a real grant/sync.
 */
async function main() {
  const only = process.argv[2];
  if (!process.env.DATABASE_URL) { console.error("DATABASE_URL is required."); process.exitCode = 1; return; }
  const db = createDatabaseClient(process.env.DATABASE_URL);
  try {
    const catalog = await vietnameseCatalog(db);
    const names = new Map(catalog.map((entity) => [entity.id, entity.name]));
    for (const definition of vietnameseSources.filter((source) => source.feedUrl && (!only || source.slug === only))) {
      const preview: NewsSourceConfig = { id: "00000000-0000-4000-8000-000000000000", slug: definition.slug, name: definition.name, domain: definition.domain, type: "PUBLICATION", reliabilityScore: definition.score, enabled: true, language: "vi", country: "VN", official: false, termsReviewed: true, ingestionAllowed: true, reviewer: "preview", reviewedAt: new Date(), permissionReference: definition.termsUrl, maxExcerptChars: 280, ingestionMethod: "RSS", permissionStatus: "ALLOWED", commercialReuseAllowed: true, requiresReusableLicense: false, permissionScope: "RSS_SUMMARY", feedUrl: definition.feedUrl, attributionRequirement: definition.attribution, lastTermsReviewAt: new Date() };
      try {
        const page = await new VietnameseRssNewsProvider(preview, async () => catalog).fetchLatestArticles({ limit: 20 });
        console.log(`\n=== ${definition.slug} ${JSON.stringify({ ...page.stats, rejected: page.rejected })}`);
        for (const article of page.articles) {
          const entities = resolveEntities(`${article.titleOriginal}\n${article.excerptOriginal ?? ""}`, catalog).map((entity) => names.get(entity.id));
          console.log(` - ${article.publishedAt?.toISOString().slice(5, 16)} ${article.titleOriginal}  [${entities.join(", ") || "league only"}]`);
        }
      } catch (error) { console.log(`\n=== ${definition.slug} FAILED ${(error as { code?: string }).code ?? "ERROR"}`); }
    }
  } finally { await db.$disconnect(); }
}
main().catch(() => { console.error("Preview failed. No raw error is logged."); process.exitCode = 1; });
