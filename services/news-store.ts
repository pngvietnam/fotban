import { randomUUID } from "node:crypto";
import type { SqlExecutor, SyncDatabase } from "../lib/sync-database";
import type { NewsSourceConfig, NormalizedArticle, NewsCursor } from "../types/news-provider";
import { officialNewsSources } from "../providers/news/sources";
import { NewsError } from "../providers/news/errors";
import { wikinewsConfig } from "../providers/wikimedia/config";
import { parseReusableLicense } from "../lib/news-licenses";
import { vietnameseSources } from "../providers/news/vietnamese-sources";
import { publisherFeedAllowed, permittedFeedSnapshot } from "../lib/publisher-feed-permission";

export type NewsCounts = { created: number; duplicates: number; conflicts: number };
export type NewsJob = { id: string; owner: string; cached: boolean; cooldown: boolean; cursor?: NewsCursor };
export async function persistNewsArticles(tx: SqlExecutor, source: NewsSourceConfig, articles: NormalizedArticle[]): Promise<NewsCounts> {
  // Return a supported scalar: Prisma cannot deserialize PostgreSQL's void result type.
  await tx.query("SELECT 1 AS locked FROM pg_advisory_xact_lock(91531105)");
  const counts = { created: 0, duplicates: 0, conflicts: 0 };
  for (const article of articles) {
    // Discovery records must use the publisher-aware quarantine store, never a
    // permitted aggregator's editorial identity or license.
    if (article.discovery) throw new NewsError("RIGHTS_REQUIRED");
    if (article.feed && (!publisherFeedAllowed(source) || article.feed.url !== source.feedUrl || article.feed.termsUrl !== source.permissionReference || article.feed.scope !== source.permissionScope || article.feed.attribution !== source.attributionRequirement || article.feed.reviewedAt.getTime() !== source.lastTermsReviewAt?.getTime() || article.license || !article.publishedAt || source.permissionScope === "RSS_METADATA" && article.excerptOriginal)) throw new NewsError("RIGHTS_REQUIRED");
    if (vietnameseSources.some((item) => item.slug === source.slug) && !article.feed) throw new NewsError("RIGHTS_REQUIRED");
    if (source.requiresReusableLicense && !article.license) throw new NewsError("MISSING_LICENSE");
    if (article.license) parseReusableLicense(article.license.name, article.license.url);
    const urls = [...new Set([article.sourceUrl, article.canonicalUrl ?? article.sourceUrl])];
    const found = await tx.query<{ id: string }>('SELECT DISTINCT "articleId" AS id FROM "ArticleUrl" WHERE url=ANY($1::text[])', [urls]);
    if (found.length > 1) { counts.conflicts++; continue; } // Never merge/delete conflicting editorial records.
    const id = found[0]?.id ?? randomUUID();
    if (!found.length) {
      await tx.query('INSERT INTO "Article" (id,slug,"sourceId","sourceUrl","canonicalUrl","titleOriginal","excerptOriginal",language,"publishedAt","collectedAt","processingStatus","licenseName","licenseUrl","attributionText","licenseEvidenceUrl","sourceRevisionUrl","licenseVerifiedAt","commercialReuseAllowed","publishedAtPrecision","updatedAt") VALUES ($1::uuid,$2,$3::uuid,$4,$5,$6,$7,$8,$9::timestamptz,$10::timestamptz,$11::"ProcessingStatus",$12,$13,$14,$15,$16,$17::timestamptz,$18,$19,now())',
        [id, `article-${id}`, source.id, article.sourceUrl, article.canonicalUrl ?? article.sourceUrl, article.titleOriginal, article.excerptOriginal, article.language, article.publishedAt, article.collectedAt, article.publishedAt && article.excerptOriginal ? "PENDING" : "NEEDS_REVIEW", article.license?.name ?? null, article.license?.url ?? null, article.license?.attribution ?? null, article.license?.evidenceUrl ?? null, article.license?.revisionUrl ?? null, article.license?.verifiedAt ?? null, article.license?.commercialReuseAllowed ?? false, article.publishedAtPrecision ?? null]);
      counts.created++;
    } else {
      // Preserve originals, prior collection time, processed/editorial content and publication state.
      // Missing metadata can be filled for unprocessed drafts only; never clear a good value.
      await tx.query('UPDATE "Article" SET "publishedAt"=COALESCE("publishedAt",$2::timestamptz),"excerptOriginal"=COALESCE("excerptOriginal",$3),"canonicalUrl"=CASE WHEN "canonicalUrl"="sourceUrl" AND $5::text IS NOT NULL THEN $5 ELSE "canonicalUrl" END,"updatedAt"=now() WHERE id=$1::uuid AND "sourceId"=$4::uuid AND "publicationStatus"=\'DRAFT\' AND "processingStatus" IN (\'PENDING\',\'NEEDS_REVIEW\') AND "manualOverrideAt" IS NULL AND (("publishedAt" IS NULL AND $2::timestamptz IS NOT NULL) OR ("excerptOriginal" IS NULL AND $3::text IS NOT NULL) OR ("canonicalUrl"="sourceUrl" AND $5::text IS NOT NULL AND $5<>"canonicalUrl"))', [id, article.publishedAt, article.excerptOriginal, source.id, article.canonicalUrl]);
      counts.duplicates++;
    }
    for (const url of urls) await tx.query('INSERT INTO "ArticleUrl" (url,"articleId") VALUES ($1,$2::uuid) ON CONFLICT (url) DO NOTHING', [url, id]);
    if (article.feed) {
      const original = (await tx.query<{ id: string; sourceId: string; sourceUrl: string; titleOriginal: string; excerptOriginal: string | null; publishedAt: Date }>('SELECT id,"sourceId","sourceUrl","titleOriginal","excerptOriginal","publishedAt" FROM "Article" WHERE id=$1::uuid', [id]))[0];
      const snapshot = { articleId: id, sourceId: source.id, feedUrl: article.feed.url, termsUrl: article.feed.termsUrl, permissionScope: article.feed.scope, attributionText: article.feed.attribution, reviewedAt: article.feed.reviewedAt.toISOString(), title: article.titleOriginal, excerpt: article.excerptOriginal, publishedAt: article.publishedAt!.toISOString() };
      if (permittedFeedSnapshot(original, source, snapshot)) await tx.query('INSERT INTO "ArticleFeedSnapshot" ("articleId","sourceId","feedUrl","termsUrl","permissionScope","attributionText","reviewedAt",title,excerpt,"publishedAt",categories,"evidenceReferences","collectedAt") VALUES ($1::uuid,$2::uuid,$3,$4,$5,$6,$7::timestamptz,$8,$9,$10::timestamptz,$11::text[],$12::text[],$13::timestamptz) ON CONFLICT ("articleId") DO NOTHING', [id, source.id, article.feed.url, article.feed.termsUrl, article.feed.scope, article.feed.attribution, article.feed.reviewedAt, article.titleOriginal, article.excerptOriginal, article.publishedAt, article.feed.categories, article.feed.evidenceReferences, article.collectedAt]);
    }
  }
  return counts;
}

export class NewsSyncStore {
  constructor(private readonly db: SyncDatabase, private readonly cacheMs = 6 * 3600000, private readonly failureCooldownMs = 5 * 60000) {}
  async registerSources() {
    for (const source of vietnameseSources) {
      await this.db.query(`INSERT INTO "NewsSource" (id,slug,name,domain,type,"sourceTier","reliabilityScore",rationale,reviewer,"reviewedAt","accessPolicy",language,country,"termsReviewed","permissionStatus","permissionReference","feedUrl","attributionRequirement","lastTermsReviewAt","newsPriority","ingestionNotes","ingestionMethod","updatedAt") SELECT $1::uuid,$2,$3,$4,$5::"SourceType",$6::"SourceTier",$7,$8,CASE WHEN $9 THEN 'published-policy-review' ELSE NULL END,CASE WHEN $9 THEN now() ELSE NULL END,$8,'vi','VN',$9,$10::"NewsPermissionStatus",$11,$12,$13,CASE WHEN $9 THEN now() ELSE NULL END,$14,$8,'RSS',now() WHERE NOT EXISTS(SELECT 1 FROM "NewsSource" WHERE slug=$2 OR domain=$4)`, [randomUUID(), source.slug, source.name, source.domain, source.tier === "COMMUNITY" ? "SOCIAL" : "PUBLICATION", source.tier, source.score, source.notes, source.termsReviewed, source.termsReviewed ? "RESTRICTED" : "UNREVIEWED", source.termsUrl, source.feedUrl, source.attribution, source.priority]);
    }
    for (const definition of officialNewsSources) {
      // Explicit operator metadata is never overwritten by repeated registry initialization.
      await this.db.query('INSERT INTO "NewsSource" (id,slug,name,domain,type,"reliabilityScore",rationale,"accessPolicy",enabled,language,country,official,"ingestionMethod","updatedAt") SELECT $1::uuid,$2,$3,$4,\'OFFICIAL\'::"SourceType",100,$5,$6,false,$7,$8,true,\'HTML_INDEX\'::"NewsIngestionMethod",now() WHERE NOT EXISTS(SELECT 1 FROM "NewsSource" WHERE slug=$2) ON CONFLICT (domain) DO UPDATE SET slug=COALESCE("NewsSource".slug,EXCLUDED.slug)', [randomUUID(), definition.slug, definition.name, definition.domain, "Official league/club publisher baseline; not automatic claim verification.", `${definition.restriction} Terms: ${definition.termsUrl}`, definition.language, definition.country]);
    }
    await this.db.query('INSERT INTO "NewsSource" (id,slug,name,domain,type,"reliabilityScore",rationale,"accessPolicy",enabled,language,official,"termsReviewed","ingestionAllowed","permissionStatus","requiresReusableLicense",reviewer,"reviewedAt","permissionReference","maxExcerptChars","ingestionMethod","updatedAt") SELECT $1::uuid,$2,$3,$4,\'PUBLICATION\'::"SourceType",80,$5,$6,true,\'en\',false,true,true,\'ALLOWED\'::"NewsPermissionStatus",true,\'published-license-review\',now(),$7,280,\'API\'::"NewsIngestionMethod",now() WHERE NOT EXISTS(SELECT 1 FROM "NewsSource" WHERE slug=$2) ON CONFLICT (domain) DO NOTHING', [randomUUID(), wikinewsConfig.slug, wikinewsConfig.name, wikinewsConfig.domain, "Community reporting, not an official league/club source; baseline is configurable.", "Only verified CC BY 4.0 text published after 2024-12-16; retain attribution, policy evidence and revision. No quotes/media/third-party embeds. Archived publication days remain explicit.", wikinewsConfig.policyUrl]);
  }
  async sources() { return this.db.query<NewsSourceConfig>('SELECT id,slug,name,domain,type,"reliabilityScore",enabled,language,country,official,"termsReviewed","ingestionAllowed","permissionStatus","commercialReuseAllowed","requiresReusableLicense",reviewer,"reviewedAt","permissionReference","maxExcerptChars","ingestionMethod","permissionScope","feedUrl","attributionRequirement","lastTermsReviewAt","newsPriority","ingestionNotes" FROM "NewsSource" WHERE slug IS NOT NULL ORDER BY "newsPriority",slug'); }
  async reserveWikimediaRequest(slug: string) {
    const rows = await this.db.query<{ waitMs: number }>('UPDATE "ProviderStatus" SET "nextRequestAt"=GREATEST(COALESCE("nextRequestAt",clock_timestamp()),clock_timestamp())+interval \'2 seconds\' WHERE provider=$1 AND ("cooldownUntil" IS NULL OR "cooldownUntil"<=clock_timestamp()) RETURNING GREATEST(0,EXTRACT(EPOCH FROM ("nextRequestAt"-interval \'2 seconds\'-clock_timestamp()))*1000)::int AS "waitMs"', [`NEWS:${slug}`]);
    if (!rows[0] || rows[0].waitMs > 10000) throw new NewsError("RATE_LIMITED", 60000);
    if (rows[0].waitMs > 0) await new Promise((resolve) => setTimeout(resolve, rows[0].waitMs));
  }
  async ensureStatus(source: NewsSourceConfig, code?: "DISABLED" | "RIGHTS_REQUIRED") {
    const key = `NEWS:${source.slug}`;
    await this.db.query('INSERT INTO "ProviderStatus" (id,provider,capability,enabled,health,"errorCode","lastCheckedAt","updatedAt") VALUES ($1::uuid,$2,\'news-metadata\',$3,$4::"ProviderHealth",$5,now(),now()) ON CONFLICT (provider) DO UPDATE SET enabled=EXCLUDED.enabled,health=CASE WHEN $5::text IS NULL THEN "ProviderStatus".health ELSE EXCLUDED.health END,"errorCode"=CASE WHEN $5::text IS NULL THEN "ProviderStatus"."errorCode" ELSE $5 END,"lastCheckedAt"=now(),"updatedAt"=now()', [randomUUID(), key, source.enabled && !code, code === "DISABLED" ? "DISABLED" : "UNCONFIGURED", code ?? null]);
  }
  async claim(source: NewsSourceConfig): Promise<NewsJob> {
    const owner = randomUUID();
    const cooldown = await this.db.query('SELECT id FROM "ProviderStatus" WHERE provider=$1 AND "cooldownUntil">now()', [`NEWS:${source.slug}`]);
    if (cooldown.length) throw new NewsError("RATE_LIMITED");
    const rows = await this.db.query<{ id: string }>(`INSERT INTO "JobRun" (id,"jobName","logicalKey",status,"startedAt",attempts,"correlationId","leaseOwner","leaseExpiresAt","updatedAt") VALUES ($1::uuid,'news-sync',$2,'RUNNING',now(),1,$3::uuid,$4,now()+interval '5 minutes',now())
      ON CONFLICT ("jobName","logicalKey") DO UPDATE SET status='RUNNING',"startedAt"=now(),"finishedAt"=NULL,"recordsProcessed"=0,attempts="JobRun".attempts+1,"correlationId"=EXCLUDED."correlationId","leaseOwner"=$4,"leaseExpiresAt"=now()+interval '5 minutes',"errorCode"=NULL,"errorSafe"=NULL,"updatedAt"=now()
      WHERE ("JobRun"."leaseExpiresAt" IS NULL OR "JobRun"."leaseExpiresAt"<=now()) AND ("JobRun"."finishedAt" IS NULL OR "JobRun"."finishedAt"<=now()-(CASE WHEN "JobRun".status='SUCCEEDED' AND "JobRun"."errorCode" IS NULL THEN $5::int ELSE $6::int END)*interval '1 millisecond') RETURNING id`, [randomUUID(), source.slug, randomUUID(), owner, this.cacheMs, this.failureCooldownMs]);
    const previous = await this.db.query<{ checkpoint: { cursor?: NewsCursor } | null; status: string; errorCode: string | null; leaseOwner: string | null; id: string }>('SELECT id,checkpoint,status,"errorCode","leaseOwner" FROM "JobRun" WHERE "jobName"=\'news-sync\' AND "logicalKey"=$1', [source.slug]);
    if (!rows.length && previous[0]?.leaseOwner) throw new NewsError("BUSY");
    const cached = !rows.length && previous[0]?.status === "SUCCEEDED" && !previous[0]?.errorCode;
    return { id: rows[0]?.id ?? previous[0].id, owner, cached, cooldown: !rows.length && !cached, cursor: previous[0]?.checkpoint?.cursor };
  }
  async complete(job: NewsJob, source: NewsSourceConfig, articles: NormalizedArticle[], rejected: number, cursor: NewsCursor, notModified: boolean) {
    return this.db.transaction(async (tx) => {
      const owned = await tx.query('SELECT id FROM "JobRun" WHERE id=$1::uuid AND "leaseOwner"=$2 AND status=\'RUNNING\' AND "leaseExpiresAt">now() FOR UPDATE', [job.id, job.owner]);
      if (!owned.length) throw new NewsError("BUSY");
      const permitted = await tx.query('SELECT id FROM "NewsSource" WHERE id=$1::uuid AND enabled AND "termsReviewed" AND "ingestionAllowed" AND "permissionStatus"=\'ALLOWED\' AND "requiresReusableLicense"=$5 AND "maxExcerptChars">=$2 AND "permissionReference"=$3 AND "ingestionMethod"=$4::"NewsIngestionMethod" FOR UPDATE', [source.id, Math.max(0, ...articles.map((article) => article.excerptOriginal?.length ?? 0)), source.permissionReference, source.ingestionMethod, source.requiresReusableLicense]);
      if (!permitted.length) throw new NewsError("RIGHTS_REQUIRED");
      if (articles.some((article) => article.feed)) {
        const current = (await tx.query<NewsSourceConfig>('SELECT * FROM "NewsSource" WHERE id=$1::uuid', [source.id]))[0];
        if (!publisherFeedAllowed(current) || current.feedUrl !== source.feedUrl || current.permissionScope !== source.permissionScope || current.attributionRequirement !== source.attributionRequirement || current.lastTermsReviewAt?.getTime() !== source.lastTermsReviewAt?.getTime()) throw new NewsError("RIGHTS_REQUIRED");
      }
      const counts = await persistNewsArticles(tx, source, articles);
      if (source.requiresReusableLicense && articles.length && articles.every((article) => article.license?.commercialReuseAllowed)) await tx.query('UPDATE "NewsSource" SET "commercialReuseAllowed"=true,"updatedAt"=now() WHERE id=$1::uuid', [source.id]);
      const partial = rejected > 0 || counts.conflicts > 0;
      const processed = articles.length - counts.conflicts;
      const checkpoint = JSON.stringify({ ...counts, rejected, notModified, cursor: partial ? {} : cursor });
      await tx.query('UPDATE "JobRun" SET status=\'SUCCEEDED\',"finishedAt"=now(),"recordsProcessed"=$3,"checkpoint"=$4::jsonb,"errorCode"=$5,"leaseOwner"=NULL,"leaseExpiresAt"=NULL,"updatedAt"=now() WHERE id=$1::uuid AND "leaseOwner"=$2', [job.id, job.owner, processed, checkpoint, partial ? "PARTIAL" : null]);
      await tx.query('UPDATE "ProviderStatus" SET health=$2::"ProviderHealth",enabled=true,"lastSuccessAt"=now(),"lastCheckedAt"=now(),"recordsProcessed"=$3,"errorCode"=$4,"errorSafe"=NULL,checkpoint=$5::jsonb,"updatedAt"=now() WHERE provider=$1', [`NEWS:${source.slug}`, partial ? "WARNING" : "HEALTHY", processed, partial ? "PARTIAL" : null, checkpoint]);
      return { ...counts, processed, rejected, notModified };
    });
  }
  async fail(job: NewsJob, source: NewsSourceConfig, error: NewsError) {
    await this.db.transaction(async (tx) => {
      const rows = await tx.query('UPDATE "JobRun" SET status=\'FAILED\',"finishedAt"=now(),"errorCode"=$3,"errorSafe"=$4,"leaseOwner"=NULL,"leaseExpiresAt"=NULL,"updatedAt"=now() WHERE id=$1::uuid AND "leaseOwner"=$2 RETURNING id', [job.id, job.owner, error.code, error.message]);
      if (!rows.length) return;
      await tx.query('UPDATE "ProviderStatus" SET health=\'ERROR\',"lastFailureAt"=now(),"lastCheckedAt"=now(),"errorCode"=$2,"errorSafe"=$3,"cooldownUntil"=CASE WHEN $4::double precision>0 THEN now()+$4::double precision*interval \'1 millisecond\' ELSE "cooldownUntil" END,"updatedAt"=now() WHERE provider=$1', [`NEWS:${source.slug}`, error.code, error.message, error.retryAfterMs > 1 ? error.retryAfterMs : 0]);
    });
  }
}
