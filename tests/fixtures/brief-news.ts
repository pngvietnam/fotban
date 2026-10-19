import type { PGlite } from "@electric-sql/pglite";
import type { SyncDatabase } from "../../lib/sync-database";
import type { AIResult } from "../../providers/ai/schema";
import { processArticle } from "../../services/ai-processing";
import { AIProcessingStore } from "../../services/ai-store";
import { StoryClusteringService } from "../../services/story-clustering";
import { transferIds } from "./transfer-store";
import { vidId } from "./videos";
import { briefNow } from "./briefs";

export async function seedBriefNews(db: PGlite, database: SyncDatabase, n: number, storyType: "CLUB" | "OFF_FIELD" = "OFF_FIELD", deferClustering = false) {
  const articleId = vidId(1000+n); const sourceId = vidId(2000+n); const domain = `brief-${n}.example.test`;
  const original = storyType === "OFF_FIELD" ? "Arsenal announces a charity project for supporters" : "Arsenal announces training plans for the squad";
  const titleVi = storyType === "OFF_FIELD" ? "Arsenal công bố hoạt động từ thiện" : "Arsenal công bố kế hoạch tập luyện";
  const summaryVi = storyType === "OFF_FIELD" ? "Arsenal công bố hoạt động từ thiện dành cho người hâm mộ." : "Arsenal công bố kế hoạch tập luyện cho đội bóng.";
  await db.query('INSERT INTO "NewsSource" (id,name,domain,type,"reliabilityScore","sourceTier",official,"authorityScopes",rationale,reviewer,"reviewedAt","accessPolicy",enabled,"termsReviewed","ingestionAllowed","permissionStatus","permissionReference","updatedAt") VALUES ($1,$2,$3,\'OFFICIAL\',95,\'TIER_0_OFFICIAL\',true,$4::text[],\'Test review\',\'Fixture editor\',\'2026-10-17T10:00:00Z\',\'test-only\',true,true,true,\'ALLOWED\',$5,now())', [sourceId, `Brief fixture ${n}`, domain, [`club:${transferIds.arsenal}`], `https://${domain}/terms`]);
  const url = `https://${domain}/story`;
  await db.query('INSERT INTO "Article" (id,slug,"sourceId","sourceUrl","canonicalUrl","titleOriginal","excerptOriginal",language,"publishedAt","collectedAt","licenseName","licenseUrl","attributionText","licenseEvidenceUrl","sourceRevisionUrl","licenseVerifiedAt","commercialReuseAllowed","updatedAt") VALUES ($1,$2,$3,$4,$4,$5,$6,\'en\',\'2026-10-17T12:00:00Z\',\'2026-10-17T12:00:00Z\',\'CC BY 4.0\',\'https://creativecommons.org/licenses/by/4.0/\',\'Fixture authors · CC BY 4.0\',$7,$8,\'2026-10-17T12:00:00Z\',true,now())', [articleId, `brief-news-${n}`, sourceId, url, original, `${original}.`, `https://${domain}/terms`, `https://${domain}/revision`]);
  const output = await processArticle(articleId, new AIProcessingStore(database), { name: "TEST_ONLY", model: "brief-fixture-v1", process: async (input): Promise<AIResult> => ({ language: "en", titleVi, summaryVi, storyType, subtype: null, certainty: "REPORTED", publishable: false, warnings: ["EDITORIAL_REVIEW"], entities: input.entities.map((entity) => ({ id: entity.id, kind: entity.kind, mention: entity.name })), mentions: [], evidence: [{ field: "titleVi", sourceText: input.title }, { field: "summaryVi", sourceText: input.excerpt }], transfer: null, injury: null }) });
  if (output.status !== "NEEDS_REVIEW") throw new Error("Fixture processing failed");
  await db.query('UPDATE "AIProcessingRun" SET "createdAt"=\'2026-10-17T12:05:00Z\' WHERE "articleId"=$1', [articleId]);
  await db.query('UPDATE "ClaimEvidence" SET "claimKey"=$2,"lineageKey"=$3,"reviewedBy"=\'Fixture editor\',"reviewedAt"=\'2026-10-17T13:00:00Z\',kind=\'OFFICIAL_STATEMENT\',"authorityScope"=$4 WHERE "articleId"=$1', [articleId, `brief-claim-${storyType}`, `brief-origin-${n}`, `club:${transferIds.arsenal}`]);
  await db.query('INSERT INTO "ArticleEntity" (id,"articleId","leagueId","updatedAt") VALUES ($1,$2,$3,now())', [vidId(3000+n), articleId, transferIds.league]);
  if (!deferClustering) await new StoryClusteringService(database).cluster({ now: briefNow });
  await db.query('UPDATE "Article" SET "processingStatus"=\'READY\',"publicationStatus"=$2::"PublicationStatus","reliabilityClass"=\'OFFICIAL\' WHERE id=$1', [articleId, deferClustering ? "DRAFT" : "PUBLISHED"]);
  return { articleId, sourceId };
}
