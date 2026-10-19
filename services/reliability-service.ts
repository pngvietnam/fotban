import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type { SqlExecutor, SyncDatabase } from "../lib/sync-database";
import { parseReusableLicense } from "../lib/news-licenses";
import { permittedFeedSnapshot } from "../lib/publisher-feed-permission";
import { validateAIResult } from "../providers/ai/validation";
import { reliabilityResultSchema, sourceSchema, type ReliabilityEvidence, type ReliabilityInput } from "../types/reliability";
import { ReliabilityEngine, reliabilityPolicyVersion } from "./reliability-engine";

const storedArticleSchema = z.object({
  id: z.uuid(), sourceId: z.uuid(), sourceUrl: z.string(), canonicalUrl: z.string(), titleOriginal: z.string(), excerptOriginal: z.string().nullable(), language: z.string(),
  titleVi: z.string().nullable(), summaryVi: z.string().nullable(), storyType: z.string().nullable(), publishedAt: z.string().nullable(), updatedAt: z.string(), manualOverrideAt: z.string().nullable(), publicationStatus: z.string(),
  licenseName: z.string().nullable(), licenseUrl: z.string().nullable(), licenseVerifiedAt: z.string().nullable(), licenseEvidenceUrl: z.string().nullable(), sourceRevisionUrl: z.string().nullable(), attributionText: z.string().nullable(), commercialReuseAllowed: z.boolean(),
  contentOriginal: z.string().nullable().optional(),
});
type StoredArticle = z.infer<typeof storedArticleSchema>;
const inputSchema = z.object({ articleId: z.uuid(), title: z.string(), excerpt: z.string(), language: z.string(), sourceUrl: z.string(), entities: z.array(z.object({ id: z.uuid(), kind: z.enum(["club", "player", "league", "match"]), name: z.string(), aliases: z.array(z.string()) })) });
function reusable(article: StoredArticle, source?: unknown, feed?: unknown) {
  if (permittedFeedSnapshot(article, source, feed)) return true;
  try { parseReusableLicense(article.licenseName, article.licenseUrl); }
  catch { return false; }
  return Boolean(article.commercialReuseAllowed && article.licenseVerifiedAt && article.licenseEvidenceUrl && article.sourceRevisionUrl && article.attributionText?.trim());
}
// Driver dates become ISO strings in snapshots; unknown JSON is validated before use.
const normalized = <T>(value: unknown): T => JSON.parse(JSON.stringify(value)) as T;
export async function loadReliabilityInput(tx: SqlExecutor, id: string): Promise<ReliabilityInput | null> {
  const rows = await tx.query('SELECT a.*,to_jsonb(s) AS source,(SELECT to_jsonb(f) FROM "ArticleFeedSnapshot" f WHERE f."articleId"=a.id) AS "feedSnapshot" FROM "Article" a JOIN "NewsSource" s ON s.id=a."sourceId" WHERE a.id=$1::uuid', [id]);
  if (!rows.length) return null;
  const row = normalized<Record<string, unknown>>(rows[0]);
  const article = storedArticleSchema.parse(row); const source = sourceSchema.parse(row.source);
  const scopes = await tx.query<{ scope: string }>(`SELECT CASE WHEN "clubId" IS NOT NULL THEN 'club:'||"clubId" WHEN "playerId" IS NOT NULL THEN 'player:'||"playerId" WHEN "leagueId" IS NOT NULL THEN 'league:'||"leagueId" ELSE 'match:'||"matchId" END AS scope FROM "ArticleEntity" WHERE "articleId"=$1::uuid ORDER BY scope`, [id]);
  const runs = normalized<{ id: string; createdAt: string; status: string; inputSnapshot: unknown; output: unknown; validationOutcome: unknown }[]>(await tx.query('SELECT id,"createdAt",status,"inputSnapshot",output,"validationOutcome" FROM "AIProcessingRun" WHERE "articleId"=$1::uuid ORDER BY "createdAt" DESC,id DESC LIMIT 1', [id]));
  const run = runs[0]; const processing: ReliabilityInput["processing"] = { id: run?.id ?? null, createdAt: run?.createdAt ?? null, validated: false, uncertainty: false, errors: [] };
  try {
    if (!run || !["NEEDS_REVIEW", "READY"].includes(run.status) || !z.object({ valid: z.literal(true) }).safeParse(run.validationOutcome).success) throw new Error("Processing required");
    const snapshot = z.object({ input: inputSchema }).parse(run.inputSnapshot);
    const input = snapshot.input;
    if (input.articleId !== id || input.title !== article.titleOriginal || input.excerpt !== article.excerptOriginal || input.sourceUrl !== article.sourceUrl || input.language !== article.language) throw new Error("Stale processing");
    const output = validateAIResult(run.output, input);
    if (output.titleVi !== article.titleVi || output.summaryVi !== article.summaryVi || output.storyType !== article.storyType) throw new Error("Output changed");
    processing.validated = true; processing.uncertainty = output.certainty === "UNCERTAIN";
  } catch { processing.errors.push("MISSING_INVALID_OR_STALE_PROCESSING"); }
  // An editorial lock is released for public evaluation only by its exact, current,
  // immutable approval audit. Editing/hiding/reviewing clears the FK atomically.
  let editorialApproved = false;
  if (processing.validated && typeof row.approvalAuditId === "string" && run) {
    const approvals = await tx.query('SELECT id FROM "AdminAuditLog" WHERE id=$1::uuid AND action=\'ARTICLE_APPROVE\' AND "targetType"=\'Article\' AND "targetId"=$2 AND after->>\'runId\'=$3 AND after->>\'titleVi\'=$4 AND after->>\'summaryVi\'=$5 AND after->>\'storyType\'=$6', [row.approvalAuditId, id, run.id, article.titleVi, article.summaryVi, article.storyType]);
    editorialApproved = approvals.length === 1;
  }
  const evidenceRows = normalized<(Omit<ReliabilityEvidence, "sourceArticle"> & { evidenceArticle: unknown; evidenceSource: unknown; evidenceFeed: unknown })[]>(await tx.query(`SELECT e.*,to_jsonb(a) AS "evidenceArticle",(SELECT to_jsonb(f) FROM "ArticleFeedSnapshot" f WHERE f."articleId"=a.id) AS "evidenceFeed",to_jsonb(s) AS "evidenceSource",jsonb_build_object('id',m.id,'provider',m.provider,'mapped',EXISTS(SELECT 1 FROM "ExternalIdentity" x WHERE x."matchId"=m.id AND x.provider=m.provider),'status',m.status,'homeScore',m."homeScore",'awayScore',m."awayScore") AS match FROM "ClaimEvidence" e LEFT JOIN "Article" a ON a.id=e."sourceArticleId" LEFT JOIN "NewsSource" s ON s.id=a."sourceId" LEFT JOIN "Match" m ON m.id=e."matchId" WHERE e."articleId"=$1::uuid ORDER BY e.id`, [id]));
  const evidence: ReliabilityEvidence[] = evidenceRows.map((item) => {
    const original = item.evidenceArticle ? storedArticleSchema.parse(item.evidenceArticle) : null;
    return { id: item.id, articleId: item.articleId, claim: item.claim, sourceArticleId: item.sourceArticleId, matchId: item.matchId, fieldPath: item.fieldPath, locator: item.locator, excerpt: item.excerpt, kind: item.kind, stance: item.stance, claimKey: item.claimKey, lineageKey: item.lineageKey, authorityScope: item.authorityScope, reviewedBy: item.reviewedBy, reviewedAt: item.reviewedAt, supersedesId: item.supersedesId, match: item.matchId ? item.match : null, sourceArticle: original ? { id: original.id, sourceUrl: original.sourceUrl, text: `${original.titleOriginal}\n${original.excerptOriginal ?? ""}`, usageAllowed: reusable(original, item.evidenceSource, item.evidenceFeed), source: sourceSchema.parse(item.evidenceSource) } : null };
  });
  return { article: { id, sourceUrl: article.sourceUrl, canonicalUrl: article.canonicalUrl, titleOriginal: article.titleOriginal, excerptOriginal: article.excerptOriginal, titleVi: article.titleVi, summaryVi: article.summaryVi, storyType: article.storyType, publishedAt: article.publishedAt, updatedAt: article.updatedAt, entityScopes: scopes.map((item) => item.scope), permissionAllowed: reusable(article, row.source, row.feedSnapshot), publicationStatus: article.publicationStatus, manualOverrideAt: editorialApproved ? null : article.manualOverrideAt }, source, processing, evidence };
}

/** No publishing side effect. Future publishers must run this gate on current data. */
export class ReliabilityService {
  constructor(private db: SyncDatabase, private engine = new ReliabilityEngine()) {}
  async assessArticle(id: string, now = new Date()) {
    if (!z.uuid().safeParse(id).success) throw new Error("Invalid article identifier");
    return this.db.transaction(async (tx) => {
      // Lock permission configuration before editorial rows, matching ingestion's lock order.
      await tx.query('SELECT id FROM "NewsSource" ORDER BY id FOR SHARE');
      await tx.query('SELECT id FROM "Article" WHERE id=$1::uuid FOR UPDATE', [id]);
      await tx.query('SELECT id FROM "ClaimEvidence" WHERE "articleId"=$1::uuid ORDER BY id FOR SHARE', [id]);
      const input = await loadReliabilityInput(tx, id);
      if (!input) return null;
      const result = reliabilityResultSchema.parse(this.engine.assess(input, now));
      const hashInput = { ...input, article: { ...input.article, updatedAt: undefined }, freshnessBucket: result.freshness.bucket };
      const hash = createHash("sha256").update(JSON.stringify(hashInput)).digest("hex");
      const inserted = await tx.query<{ id: string }>('INSERT INTO "ReliabilityAssessment" (id,"articleId","inputHash","policyVersion",result) VALUES ($1::uuid,$2::uuid,$3,$4,$5::jsonb) ON CONFLICT ("articleId","inputHash","policyVersion") DO NOTHING RETURNING id', [randomUUID(), id, hash, reliabilityPolicyVersion, JSON.stringify(result)]);
      // These legacy fields are explicitly a publication label and source-score snapshot.
      // Do not alter original/generated text, certainty, evidence, READY or publication state.
      await tx.query('UPDATE "Article" SET "reliabilityClass"=$2::"ReliabilityClass","reliabilityScore"=$3,"updatedAt"=now() WHERE id=$1::uuid AND "manualOverrideAt" IS NULL AND "publicationStatus"=\'DRAFT\' AND ("reliabilityClass" IS DISTINCT FROM $2::"ReliabilityClass" OR "reliabilityScore" IS DISTINCT FROM $3::int)', [id, result.label, result.source.score]);
      return { result, cached: !inserted.length, inputHash: hash };
    });
  }
  async assertPublicationReady(id: string, now = new Date()) {
    const assessment = await this.assessArticle(id, now);
    if (!assessment?.result.publishability.eligible) throw new Error("Reliability publication gate rejected this article");
    return assessment.result;
  }
}
