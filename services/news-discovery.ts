import { randomUUID } from "node:crypto";
import type { SyncDatabase, SqlExecutor } from "../lib/sync-database";
import type { NewsProvider, NormalizedArticle } from "../types/news-provider";
import { AIProcessingStore } from "./ai-store";
import { classify, detectLanguage, resolveEntities, uncertainty } from "../providers/ai/rules";
import { gdeltConfig, normalizeGdelt } from "../providers/gdelt/provider";
import { NewsError, safeNewsError } from "../providers/news/errors";

export async function persistDiscoveryArticles(tx: SqlExecutor, articles: NormalizedArticle[], catalog: Awaited<ReturnType<AIProcessingStore["catalog"]>>) {
  await tx.query("SELECT 1 AS locked FROM pg_advisory_xact_lock(91531105)");
  const ids: string[] = []; let stored = 0; let duplicates = 0;
  for (const article of articles) {
    const discovery = article.discovery;
    if (!discovery || discovery.provider !== "GDELT_DOC" || discovery.metadataUsage !== "DISCOVERY_ONLY" || article.license || article.excerptOriginal !== null || article.publishedAt !== null) throw new NewsError("INVALID_ARTICLE");
    // Validate at the persistence boundary too; no arbitrary provider JSON is trusted.
    const checked = normalizeGdelt({ title: article.titleOriginal, url: article.sourceUrl, domain: discovery.domain, language: article.language, sourcecountry: discovery.country ?? undefined, seendate: discovery.seenAt.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z") }, discovery.query, article.collectedAt, 48);
    if (checked.sourceUrl !== article.sourceUrl) throw new NewsError("INVALID_ARTICLE");
    const matches = await tx.query<{ id: string }>(`SELECT id FROM "Article" WHERE "sourceUrl"=$1 OR "canonicalUrl"=$1 UNION SELECT "articleId" FROM "ArticleUrl" WHERE url=$1`, [article.sourceUrl]);
    if (matches.length > 1) throw new NewsError("INVALID_ARTICLE");
    const entities = resolveEntities(article.titleOriginal, catalog);
    let id = matches[0]?.id;
    if (!id) {
      // GDELT is provenance, never the editorial publisher. Existing operator
      // permission/reliability settings are preserved, including disabled ones.
      let source = (await tx.query<{ id: string }>('SELECT id FROM "NewsSource" WHERE domain=$1 OR domain=$2 ORDER BY domain LIMIT 1 FOR SHARE', [discovery.domain, `www.${discovery.domain}`]))[0];
      if (!source) {
        source = { id: randomUUID() };
        await tx.query(`INSERT INTO "NewsSource" (id,name,domain,type,"accessPolicy",language,country,rationale,"updatedAt") VALUES ($1::uuid,$2,$2,'PUBLICATION',$3,$4,$5,$6,now())`, [source.id, discovery.domain, "GDELT discovery metadata only. Publisher reuse permission unreviewed; direct ingestion disabled.", article.language, discovery.country, "Unknown publisher: no automatic editorial trust or official authority."]);
      }
      id = randomUUID();
      await tx.query(`INSERT INTO "Article" (id,slug,"sourceId","sourceUrl","canonicalUrl","titleOriginal",language,"collectedAt","processingStatus","storyType","rumorStatus","updatedAt") VALUES ($1::uuid,$2,$3::uuid,$4,$4,$5,$6,$7::timestamptz,'NEEDS_REVIEW',$8::"StoryType",$9::"RumorStatus",now())`, [id, `article-${id}`, source.id, article.sourceUrl, article.titleOriginal, article.language, article.collectedAt, classify(article.titleOriginal), uncertainty.test(article.titleOriginal) ? "UNCONFIRMED" : "NOT_APPLICABLE"]);
      await tx.query('INSERT INTO "ArticleUrl" (url,"articleId") VALUES ($1,$2::uuid)', [article.sourceUrl, id]);
      for (const entity of entities) {
        const column = { club: "clubId", player: "playerId", league: "leagueId", match: "matchId" }[entity.kind];
        await tx.query(`INSERT INTO "ArticleEntity" (id,"articleId","${column}","updatedAt") VALUES ($1::uuid,$2::uuid,$3::uuid,now()) ON CONFLICT ("articleId","${column}") DO NOTHING`, [randomUUID(), id, entity.id]);
      }
      stored++;
    } else duplicates++;
    await tx.query(`INSERT INTO "ArticleDiscovery" (id,"articleId",provider,url,domain,"sourceCountry","seenAt","collectedAt",metadata) VALUES ($1::uuid,$2::uuid,'GDELT_DOC',$3,$4,$5,$6::timestamptz,$7::timestamptz,$8::jsonb) ON CONFLICT(provider,url) DO NOTHING`, [randomUUID(), id, article.sourceUrl, discovery.domain, discovery.country, discovery.seenAt, article.collectedAt, JSON.stringify({ title: article.titleOriginal, language: article.language, query: discovery.query, usage: "DISCOVERY_ONLY", publisherReuseAllowed: false, publicationTimeVerified: false, attribution: gdeltConfig.attribution, policyUrl: gdeltConfig.policyUrl, analysis: { language: detectLanguage(article.titleOriginal, article.language), storyType: classify(article.titleOriginal), uncertain: uncertainty.test(article.titleOriginal), entities, warnings: ["PUBLISHER_PERMISSION_REQUIRED", "PUBLICATION_TIME_UNVERIFIED", "METADATA_ONLY", "EDITORIAL_REVIEW_REQUIRED"] } })]);
    ids.push(id);
  }
  return { stored, duplicates, articleIds: [...new Set(ids)] };
}

/** One opt-in, bounded discovery batch. Production morning schedules are unchanged. */
export class NewsDiscoveryService {
  constructor(private db: SyncDatabase, private provider: (query: string) => NewsProvider, private pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))) {}
  async run() {
    const owner = randomUUID(); const logicalKey = "gdelt-doc";
    const claimed = await this.db.query<{ id: string }>(`INSERT INTO "JobRun" (id,"jobName","logicalKey",status,"startedAt",attempts,"correlationId","leaseOwner","leaseExpiresAt","updatedAt") VALUES ($1::uuid,'news-discovery',$2,'RUNNING',now(),1,$4::uuid,$3,now()+interval '5 minutes',now()) ON CONFLICT ("jobName","logicalKey") DO UPDATE SET status='RUNNING',"startedAt"=now(),"finishedAt"=NULL,"leaseOwner"=$3,"leaseExpiresAt"=now()+interval '5 minutes',attempts="JobRun".attempts+1,"errorCode"=NULL,"errorSafe"=NULL,"updatedAt"=now() WHERE ("JobRun"."leaseExpiresAt" IS NULL OR "JobRun"."leaseExpiresAt"<=now()) AND ("JobRun"."finishedAt" IS NULL OR "JobRun"."finishedAt"<now() - (CASE WHEN "JobRun".status='SUCCEEDED' THEN interval '6 hours' ELSE interval '10 minutes' END)) RETURNING id`, [randomUUID(), logicalKey, owner, randomUUID()]);
    if (!claimed.length) return { status: "skipped", code: "CACHED_OR_RUNNING", found: 0, stored: 0, duplicates: 0, rejected: 0, articleIds: [] as string[], queries: [] };
    const jobId = claimed[0].id; const articles: NormalizedArticle[] = [];
    const queries: { league: string; status: string; found: number; rejected: number; code?: string }[] = [];
    try {
      for (const [index, query] of gdeltConfig.queries.entries()) {
        if (index) await this.pause(gdeltConfig.requestIntervalMs);
        try {
          const page = await this.provider(query.query).fetchLatestArticles({ limit: gdeltConfig.maxPerQuery });
          articles.push(...page.articles);
          queries.push({ league: query.league, status: "succeeded", found: page.articles.length + page.rejected, rejected: page.rejected });
        } catch (error) { queries.push({ league: query.league, status: "failed", found: 0, rejected: 0, code: safeNewsError(error).code }); }
      }
      const catalog = await new AIProcessingStore(this.db).catalog();
      return await this.db.transaction(async (tx) => {
        const active = await tx.query('SELECT id FROM "JobRun" WHERE id=$1::uuid AND "leaseOwner"=$2 AND status=\'RUNNING\' AND "leaseExpiresAt">now() FOR UPDATE', [jobId, owner]);
        if (!active.length) throw new NewsError("BUSY");
        const counts = await persistDiscoveryArticles(tx, articles, catalog);
        const failed = queries.filter((query) => query.status === "failed").length;
        const status = failed === queries.length ? "FAILED" : failed || queries.some((q) => q.rejected) ? "PARTIAL" : "SUCCEEDED";
        const result = { jobId, status, found: queries.reduce((sum, query) => sum + query.found, 0), rejected: queries.reduce((sum, query) => sum + query.rejected, 0), ...counts, queries };
        await tx.query('UPDATE "JobRun" SET status=$3::"JobStatus","finishedAt"=now(),"recordsProcessed"=$4,checkpoint=$5::jsonb,"errorCode"=$6,"leaseOwner"=NULL,"leaseExpiresAt"=NULL,"updatedAt"=now() WHERE id=$1::uuid AND "leaseOwner"=$2', [jobId, owner, status, result.found, JSON.stringify(result), failed ? "DISCOVERY_DEGRADED" : null]);
        return result;
      });
    } catch (error) {
      const code = safeNewsError(error).code;
      await this.db.query('UPDATE "JobRun" SET status=\'FAILED\',"finishedAt"=now(),"errorCode"=$3,"leaseOwner"=NULL,"leaseExpiresAt"=NULL,"updatedAt"=now() WHERE id=$1::uuid AND "leaseOwner"=$2', [jobId, owner, code]);
      throw error;
    }
  }
}
