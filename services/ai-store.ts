import { createHash, randomUUID } from "node:crypto";
import type { SyncDatabase, SqlExecutor } from "../lib/sync-database";
import type { AIInput, EntityCandidate } from "../types/ai-provider";
import type { AIResult } from "../providers/ai/schema";
import { versions } from "../providers/ai/schema";
import { parseReusableLicense } from "../lib/news-licenses";
import { permittedFeedSnapshot } from "../lib/publisher-feed-permission";

export type ProcessingArticle = {
  id: string; titleOriginal: string; excerptOriginal: string | null; contentOriginal: string | null; language: string; sourceUrl: string;
  publishedAt: Date | null; manualOverrideAt: Date | null; publicationStatus: string;
  licenseName: string | null; licenseUrl: string | null; attributionText: string | null; licenseEvidenceUrl: string | null; sourceRevisionUrl: string | null; licenseVerifiedAt: Date | null; commercialReuseAllowed: boolean;
  sourceId: string; sourceEnabled: boolean; termsReviewed: boolean; ingestionAllowed: boolean; permissionStatus: string; reviewer: string | null; reviewedAt: Date | null; permissionReference: string | null;
  feedSource?: unknown; feedSnapshot?: unknown;
};
const articleSql = `SELECT a.*,s.enabled AS "sourceEnabled",s."termsReviewed",s."ingestionAllowed",s."permissionStatus",s.reviewer,s."reviewedAt",s."permissionReference",to_jsonb(s) AS "feedSource",(SELECT to_jsonb(f) FROM "ArticleFeedSnapshot" f WHERE f."articleId"=a.id) AS "feedSnapshot" FROM "Article" a JOIN "NewsSource" s ON s.id=a."sourceId" WHERE a.id=$1::uuid`;
export function eligible(article: ProcessingArticle): string | null {
  if (article.manualOverrideAt || article.publicationStatus !== "DRAFT") return "EDITORIAL_LOCK";
  if (!article.sourceEnabled || !article.termsReviewed || !article.ingestionAllowed || article.permissionStatus !== "ALLOWED" || !article.reviewer || !article.reviewedAt || !article.permissionReference) return "RIGHTS_REQUIRED";
  // Processing is stricter than ingestion: link/metadata permission alone is insufficient.
  if (!permittedFeedSnapshot(article, article.feedSource, article.feedSnapshot)) {
    try { parseReusableLicense(article.licenseName, article.licenseUrl); } catch { return "REUSE_REQUIRED"; }
    if (!article.commercialReuseAllowed || !article.attributionText || !article.licenseEvidenceUrl || !article.sourceRevisionUrl || !article.licenseVerifiedAt) return "REUSE_REQUIRED";
  }
  try { const url = new URL(article.sourceUrl); if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return "MISSING_SOURCE_URL"; } catch { return "MISSING_SOURCE_URL"; }
  if (!article.titleOriginal.trim() || !article.excerptOriginal || article.excerptOriginal.trim().length < 40 || !article.publishedAt) return "THIN_CONTENT";
  if ((article.titleOriginal + article.excerptOriginal).length > 10000 || /[<>\u0000-\u0008]/u.test(article.titleOriginal + article.excerptOriginal)) return "MALFORMED_CONTENT";
  return null;
}
export function inputHash(article: ProcessingArticle, input: AIInput, providerIdentity: string) {
  // Includes source/rights/content revision; excludes generated fields, timestamps of processing and secrets.
  const { titleOriginal, excerptOriginal, contentOriginal, language, sourceUrl, publishedAt, sourceId, sourceEnabled, termsReviewed, ingestionAllowed, permissionStatus, reviewer, reviewedAt, permissionReference, licenseName, licenseUrl, attributionText, licenseEvidenceUrl, sourceRevisionUrl, licenseVerifiedAt, commercialReuseAllowed } = article;
  return createHash("sha256").update(JSON.stringify({ original: { titleOriginal, excerptOriginal, contentOriginal, language, sourceUrl, publishedAt, sourceId, sourceEnabled, termsReviewed, ingestionAllowed, permissionStatus, reviewer, reviewedAt, permissionReference, licenseName, licenseUrl, attributionText, licenseEvidenceUrl, sourceRevisionUrl, licenseVerifiedAt, commercialReuseAllowed, ...(article.feedSnapshot ? { feedPermission: { source: article.feedSource, snapshot: article.feedSnapshot } } : {}) }, input, providerIdentity, versions })).digest("hex");
}
export function makeInput(article: ProcessingArticle, entities: EntityCandidate[]): AIInput {
  return { articleId: article.id, title: article.titleOriginal, excerpt: article.excerptOriginal ?? "", language: article.language, sourceUrl: article.sourceUrl, entities };
}
/** Canonical entity catalog (clubs, players, leagues, matches) for alias matching. */
export async function entityCatalog(db: SqlExecutor): Promise<EntityCandidate[]> {
  const basic = await db.query<EntityCandidate>(`SELECT id,'club' AS kind,name,aliases || ARRAY[COALESCE("shortName",''),COALESCE(tla,'')] AS aliases FROM "Club" UNION ALL SELECT id,'player' AS kind,name,aliases FROM "Player" UNION ALL SELECT id,'league' AS kind,name,aliases FROM "League"`);
  // Match association requires an explicit internal slug in source text; no guessed pairing.
  const matches = await db.query<EntityCandidate>(`SELECT id,'match' AS kind,slug AS name,ARRAY[]::text[] AS aliases FROM "Match"`);
  return [...basic, ...matches].sort((a, b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id));
}
export class AIProcessingStore {
  constructor(readonly db: SyncDatabase) {}
  async article(id: string, tx: SqlExecutor = this.db) { return (await tx.query<ProcessingArticle>(articleSql, [id]))[0]; }
  async candidates(limit: number, window: { since?: Date; before?: Date } = {}) { return this.db.query<{ id: string }>('SELECT id FROM "Article" WHERE "publicationStatus"=\'DRAFT\' AND "manualOverrideAt" IS NULL AND ($2::timestamptz IS NULL OR "collectedAt">=$2::timestamptz) AND ($3::timestamptz IS NULL OR "collectedAt"<=$3::timestamptz) ORDER BY "collectedAt",id LIMIT $1', [limit, window.since ?? null, window.before ?? null]); }
  async catalog(): Promise<EntityCandidate[]> { return entityCatalog(this.db); }
  async claim(articleId: string, hash: string, provider: string, model: string, retry: boolean, snapshot: Record<string, unknown>) {
    return this.db.transaction(async (tx) => {
      await tx.query('SELECT id FROM "Article" WHERE id=$1::uuid FOR UPDATE', [articleId]);
      await tx.query('UPDATE "AIProcessingRun" SET status=\'FAILED\',"errorSafe"=\'LEASE_EXPIRED\',"updatedAt"=now() WHERE "articleId"=$1::uuid AND status=\'PROCESSING\' AND "updatedAt"<now()-interval \'2 minutes\'', [articleId]);
      const busy = await tx.query('SELECT id FROM "AIProcessingRun" WHERE "articleId"=$1::uuid AND status=\'PROCESSING\'', [articleId]);
      if (busy.length) return null;
      const existing = await tx.query<{ id: string; status: string; validationOutcome: { attempts?: number } | null }>('SELECT id,status,"validationOutcome" FROM "AIProcessingRun" WHERE "articleId"=$1::uuid AND "inputHash"=$2 AND "promptVersion"=$3 AND "schemaVersion"=$4 AND "outputVersion"=$5', [articleId, hash, versions.prompt, versions.schema, versions.output]);
      if (existing.length) {
        const run = existing[0]; const attempts = run.validationOutcome?.attempts ?? 1;
        if (!retry || attempts >= 3 || run.status !== "FAILED") return null;
        await tx.query('UPDATE "AIProcessingRun" SET status=\'PROCESSING\',"validationOutcome"=$2::jsonb,"updatedAt"=now() WHERE id=$1::uuid', [run.id, JSON.stringify({ attempts: attempts + 1 })]);
        return { id: run.id, attempts: attempts + 1 };
      }
      // Serialize per article and avoid overlapping calls across revisions/processes.
      const id = randomUUID();
      await tx.query('INSERT INTO "AIProcessingRun" (id,"articleId",provider,model,"promptVersion","schemaVersion","outputVersion","inputHash","inputSnapshot",status,"validationOutcome","updatedAt") VALUES ($1::uuid,$2::uuid,$3,$4,$5,$6,$7,$8,$9::jsonb,\'PROCESSING\',$10::jsonb,now())', [id, articleId, provider, model, versions.prompt, versions.schema, versions.output, hash, JSON.stringify({ articleId, inputHash: hash, ...snapshot }), JSON.stringify({ attempts: 1 })]);
      return { id, attempts: 1 };
    });
  }
  async finish(run: { id: string; attempts: number }, article: ProcessingArticle, hash: string, input: AIInput, identity: string, provider: string, model: string, output: AIResult | null, error: string | null) {
    return this.db.transaction(async (tx) => {
      await tx.query('SELECT id FROM "NewsSource" WHERE id=$1::uuid FOR SHARE', [article.sourceId]);
      await tx.query('SELECT id FROM "Article" WHERE id=$1::uuid FOR UPDATE', [article.id]);
      const current = await this.article(article.id, tx);
      const active = await tx.query<{ status: string; validationOutcome: { attempts: number } }>('SELECT status,"validationOutcome" FROM "AIProcessingRun" WHERE id=$1::uuid FOR UPDATE', [run.id]);
      if (active[0]?.status !== "PROCESSING" || active[0]?.validationOutcome.attempts !== run.attempts) return { status: "STALE", publishable: false as const };
      const changed = !current || eligible(current) || inputHash(current, makeInput(current, input.entities), identity) !== hash;
      const accepted = !changed && output !== null;
      const status = accepted ? "NEEDS_REVIEW" : "FAILED";
      const processedAt = new Date().toISOString();
      await tx.query('UPDATE "AIProcessingRun" SET provider=$2,model=$3,status=$4::"ProcessingStatus",output=$5::jsonb,"errorSafe"=$6,"validationOutcome"=$7::jsonb,"updatedAt"=now() WHERE id=$1::uuid', [run.id, provider, model, status, accepted ? JSON.stringify(output) : null, changed ? "INPUT_OR_PERMISSION_CHANGED" : error, JSON.stringify({ valid: accepted, attempts: run.attempts, processedAt, inputHash: hash, outputVersion: versions.output, publishable: false, candidatePublishable: accepted ? output.publishable : false, reviewRequired: true, fallbackReason: error })]);
      if (!changed) {
        if (accepted) {
          await tx.query('UPDATE "Article" SET "titleVi"=$2,"summaryVi"=$3,"storyType"=$4::"StoryType","rumorStatus"=$5::"RumorStatus","processingStatus"=\'NEEDS_REVIEW\',"updatedAt"=now() WHERE id=$1::uuid', [article.id, output.titleVi, output.summaryVi, output.storyType, output.certainty === "UNCERTAIN" ? "UNCONFIRMED" : "NOT_APPLICABLE"]);
          for (const evidence of output.evidence) await tx.query('INSERT INTO "ClaimEvidence" (id,"articleId",claim,"sourceArticleId",locator,excerpt,"updatedAt") VALUES ($1::uuid,$2::uuid,$3,$2::uuid,$4,$5,now())', [randomUUID(), article.id, output[evidence.field], `AIProcessingRun:${run.id}:${evidence.field}`, evidence.sourceText]);
          for (const entity of output.entities) {
            const column = { club: "clubId", player: "playerId", league: "leagueId", match: "matchId" }[entity.kind];
            await tx.query(`INSERT INTO "ArticleEntity" (id,"articleId","${column}","updatedAt") VALUES ($1::uuid,$2::uuid,$3::uuid,now()) ON CONFLICT ("articleId","${column}") DO NOTHING`, [randomUUID(), article.id, entity.id]);
          }
          // Original quotes are stored as source-provided, never translated/generated.
          const quotes = [...`${article.titleOriginal}\n${article.excerptOriginal}`.matchAll(/[“"«‘]([^“”"«»‘’\n]{5,500})[”"»’]/gu)];
          for (const quote of quotes) {
            await tx.query('INSERT INTO "Quote" (id,"articleId",original,locator,"updatedAt") SELECT $1::uuid,$2::uuid,$3,$4,now() WHERE NOT EXISTS (SELECT 1 FROM "Quote" WHERE "articleId"=$2::uuid AND original=$3)', [randomUUID(), article.id, quote[1], `source-provided:${run.id}:${quote.index}`]);
          }
        } else await tx.query('UPDATE "Article" SET "processingStatus"=\'FAILED\',"updatedAt"=now() WHERE id=$1::uuid', [article.id]);
      }
      return { status, publishable: false as const };
    });
  }
}
