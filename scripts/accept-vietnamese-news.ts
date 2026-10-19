import { writeFile } from "node:fs/promises";
import { createDatabaseClient } from "../lib/database-client";
import { parseEnvironment } from "../lib/config";
import { createNewsRuntime } from "../lib/news-runtime";
import { createAIRuntime } from "../lib/ai-runtime";
import { prismaSyncDatabase } from "../lib/sync-database";
import { publisherFeedAllowed } from "../lib/publisher-feed-permission";
import { vietnameseSource } from "../providers/news/vietnamese-sources";
import { syncNews } from "../services/news-sync";
import { processArticle } from "../services/ai-processing";
import { ReliabilityService } from "../services/reliability-service";
import { StoryClusteringService } from "../services/story-clustering";
import { NewsQueryService } from "../services/news-ui-data";

async function main() {
  const env = parseEnvironment(process.env); if (!env.DATABASE_URL) throw new Error("DATABASE_URL required");
  const client = createDatabaseClient(env.DATABASE_URL);
  try {
    const now = new Date(); const db = prismaSyncDatabase(client); const runtime = createNewsRuntime(client, { wikimediaUserAgent: env.WIKIMEDIA_USER_AGENT });
    await runtime.store.registerSources();
    const sources = (await runtime.store.sources()).filter((source) => vietnameseSource(source.slug));
    const sync = await syncNews(sources, runtime.store, runtime.createProvider, { limit: 20 });
    const rows = await db.query<{ id: string; sourceId: string; storyType: string | null }>('SELECT id,"sourceId","storyType" FROM "Article" WHERE "sourceId"=ANY($1::uuid[]) AND "collectedAt">=$2::timestamptz ORDER BY "collectedAt",id LIMIT 200', [sources.map((s) => s.id), new Date(now.getTime() - 24*3600000)]);
    const ai = createAIRuntime(client, env); const processing = []; const reliability = [];
    for (const article of rows) {
      processing.push({ articleId: article.id, ...await processArticle(article.id, ai.store, ai.provider, { identity: ai.identity }) });
      const assessment = await new ReliabilityService(db).assessArticle(article.id, now);
      reliability.push({ articleId: article.id, label: assessment?.result.label, certainty: assessment?.result.certainty, publishable: assessment?.result.publishability.eligible ?? false, blockers: assessment?.result.publishability.blockers ?? [] });
    }
    const clusters = rows.length ? await new StoryClusteringService(db).cluster({ since: new Date(now.getTime()-24*3600000), now }) : [];
    const query = new NewsQueryService(db); const visible = [];
    let offset: number | null = 0;
    for (let page=0; page<20 && offset !== null; page++) { const result = await query.list({league:"all",offset},now); visible.push(...result.stories); offset=result.nextOffset; }
    const sourceIds = new Set(sources.map((s) => s.id));
    const stories = visible.filter((story) => story.sources.some((s) => typeof s.sourceId === "string" && sourceIds.has(s.sourceId)));
    const report = { checkedAt: new Date().toISOString(), sourcePolicy: "VIETNAMESE_PRIMARY_GDELT_OPTIONAL", sourcesReviewed: sources.filter((s) => s.termsReviewed).length, sourcesEnabled: sources.filter(publisherFeedAllowed).length, sourcesBlocked: sources.filter((s) => !publisherFeedAllowed(s)).length, sources: sources.map((s) => ({name:s.name,slug:s.slug,enabled:s.enabled,termsReviewed:s.termsReviewed,permissionStatus:s.permissionStatus,permissionScope:s.permissionScope,commercialReuseAllowed:s.commercialReuseAllowed,feedUrl:s.feedUrl,lastTermsReviewAt:s.lastTermsReviewAt,attribution:s.attributionRequirement,notes:s.ingestionNotes,sync:sync.find((r)=>r.source===s.slug)})), counts: {found:sync.reduce((sum,r)=>sum+(r.processed??0)+(r.rejected??0),0),stored:sync.reduce((sum,r)=>sum+(r.created??0),0),duplicates:sync.reduce((sum,r)=>sum+(r.duplicates??0),0),rejected:sync.reduce((sum,r)=>sum+(r.rejected??0),0),recentVietnameseArticles:rows.length,processed:processing.filter((p)=>p.status==="NEEDS_REVIEW").length,reviewRequired:processing.filter((p)=>p.status==="NEEDS_REVIEW"||p.status==="skipped").length,clustersAssessed:clusters.length,clustersCreatedOrRevised:clusters.filter((c)=>c.changed).length,publishable:reliability.filter((r)=>r.publishable).length,visible:stories.length,epl:stories.filter((s)=>s.leagueSlugs.includes("premier-league")).length,laLiga:stories.filter((s)=>s.leagueSlugs.includes("la-liga")).length,transfer:rows.filter((r)=>r.storyType==="TRANSFER").length,offField:rows.filter((r)=>r.storyType==="OFF_FIELD").length},processing,reliability,stories:stories.map((s)=>({title:s.titleVi,slug:s.slug,sources:s.sources.map((source)=>({name:source.name,url:source.url})),reliability:s.reliability})) };
    const text = JSON.stringify(report,null,2); console.log(text); await writeFile("docs/samples/vietnamese-news-acceptance.json",text+"\n","utf8");
  } finally { await client.$disconnect(); }
}
main().catch(() => { console.error("Vietnamese news acceptance could not complete. Check database, migrations and source policy. Sensitive details withheld."); process.exitCode=1; });
