import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SyncDatabase } from "../lib/sync-database";
import { ReliabilityService } from "../services/reliability-service";
import { AIProcessingStore } from "../services/ai-store";
import { processArticle } from "../services/ai-processing";
import { articleId, clubId, englishInput, fakeAI, translated } from "./fixtures/ai";
import { relNow, relIds } from "./fixtures/reliability";

describe("reliability persistence and current-data publication gate", () => {
  let db: PGlite; let database: SyncDatabase; let service: ReliabilityService;
  beforeAll(async () => {
    db = new PGlite();
    for (const dir of readdirSync("prisma/migrations", { withFileTypes: true }).filter((entry) => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) await db.exec(readFileSync(`prisma/migrations/${dir.name}/migration.sql`, "utf8"));
    database = { query: async <T>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows, transaction: (work) => db.transaction((tx) => work({ query: async <T>(sql: string, params: unknown[] = []) => (await tx.query<T>(sql, params)).rows })) };
    service = new ReliabilityService(database);
  }, 30000);
  beforeEach(async () => {
    await db.exec('TRUNCATE "Article","NewsSource","Club" CASCADE');
    await db.query('INSERT INTO "NewsSource" (id,name,domain,type,"reliabilityScore","sourceTier",rationale,reviewer,"reviewedAt","accessPolicy",enabled,"termsReviewed","ingestionAllowed","permissionStatus","permissionReference","updatedAt") VALUES ($1::uuid,\'Fixture newsroom\',\'news.example.test\',\'PUBLICATION\',95,\'TIER_1_HIGH\',\'Fixture editorial review\',\'Fixture editor\',\'2026-10-16T00:00:00Z\',\'test-only\',true,true,true,\'ALLOWED\',\'https://news.example.test/terms\',now())', [relIds.source]);
    await db.query('INSERT INTO "Club" (id,slug,name,aliases,"updatedAt") VALUES ($1::uuid,\'fixture-club\',\'Manchester United\',ARRAY[\'Man Utd\',\'Man United\'],now())', [clubId]);
    const input = englishInput();
    await db.query('INSERT INTO "Article" (id,slug,"sourceId","sourceUrl","canonicalUrl","titleOriginal","excerptOriginal",language,"publishedAt","licenseName","licenseUrl","attributionText","licenseEvidenceUrl","sourceRevisionUrl","licenseVerifiedAt","commercialReuseAllowed","updatedAt") VALUES ($1::uuid,\'fixture-article\',$2::uuid,$3,$3,$4,$5,\'en\',\'2026-10-17T06:00:00Z\',\'CC BY 4.0\',\'https://creativecommons.org/licenses/by/4.0/\',\'Fixture authors and licence\',\'https://news.example.test/terms\',\'https://news.example.test/revision/1\',\'2026-10-17T06:00:00Z\',true,now())', [articleId, relIds.source, input.sourceUrl, input.title, input.excerpt]);
    await processArticle(articleId, new AIProcessingStore(database), fakeAI());
    await db.exec('UPDATE "AIProcessingRun" SET "createdAt"=\'2026-10-17T06:05:00Z\'');
  });
  afterAll(async () => { await db.close(); });
  async function review() {
    await db.exec('UPDATE "ClaimEvidence" SET "claimKey"=\'fixture-transfer-interest\',"lineageKey"=\'fixture-publisher\',"reviewedBy"=\'Fixture editor\',"reviewedAt"=\'2026-10-17T07:00:00Z\'');
  }
  async function count(table: string) { return (await db.query<{ count: number }>(`SELECT count(*)::int AS count FROM "${table}"`)).rows[0].count; }
  it("AI-validated output alone cannot grant editorial reliability publication eligibility", async () => {
    const assessment = await service.assessArticle(articleId, relNow);
    expect(assessment?.result.publishability.eligible).toBe(false);
    expect(assessment?.result.publishability.blockers).toContain("REVIEWED_EVIDENCE_REQUIRED");
    await expect(service.assertPublicationReady(articleId, relNow)).rejects.toThrow("publication gate");
  });
  it("reviewed evidence allows a clearly labeled rumor candidate, never publishes it", async () => {
    await review();
    expect(await service.assertPublicationReady(articleId, relNow)).toMatchObject({ label: "RUMOR", transferStatus: "RUMOR", certainty: "SPECULATIVE" });
    const article = (await db.query('SELECT "publicationStatus","processingStatus","reliabilityClass","reliabilityScore" FROM "Article"')).rows[0];
    expect(article).toEqual({ publicationStatus: "DRAFT", processingStatus: "NEEDS_REVIEW", reliabilityClass: "RUMOR", reliabilityScore: 95 });
  });
  it("repeat assessment is idempotent and does not cause new AI processing", async () => {
    await review(); const first = await service.assessArticle(articleId, relNow); const second = await service.assessArticle(articleId, relNow);
    expect(first?.cached).toBe(false); expect(second?.cached).toBe(true); expect(second?.inputHash).toBe(first?.inputHash);
    expect(await count("ReliabilityAssessment")).toBe(1); expect(await count("AIProcessingRun")).toBe(1); expect(await count("ClaimEvidence")).toBe(2);
    expect(await processArticle(articleId, new AIProcessingStore(database), fakeAI())).toMatchObject({ status: "cached" });
  });
  it("source permission revocation invalidates current decisions without reducing quality score", async () => {
    await review(); await service.assertPublicationReady(articleId, relNow);
    await db.exec('UPDATE "NewsSource" SET "permissionStatus"=\'RESTRICTED\'');
    const current = await service.assessArticle(articleId, relNow);
    expect(current?.result).toMatchObject({ source: { score: 95 }, permission: { usageAllowed: false }, publishability: { eligible: false } });
    expect(await count("ReliabilityAssessment")).toBe(2); await expect(service.assertPublicationReady(articleId, relNow)).rejects.toThrow();
  });
  it("licence permission and source editorial tier are independent gates", async () => {
    await review(); await db.exec('UPDATE "Article" SET "commercialReuseAllowed"=false');
    expect((await service.assessArticle(articleId, relNow))?.result.publishability.blockers).toContain("USAGE_NOT_ALLOWED");
    await db.exec('UPDATE "Article" SET "commercialReuseAllowed"=true');
    await db.exec('UPDATE "NewsSource" SET "sourceTier"=\'TIER_3_UNVERIFIED\'');
    expect((await service.assessArticle(articleId, relNow))?.result.publishability.blockers).toContain("SOURCE_TIER_REQUIRES_REVIEW");
  });
  it("changed originals or generated fields cannot inherit an obsolete valid AI result", async () => {
    await review(); await db.exec('UPDATE "Article" SET "excerptOriginal"="excerptOriginal"||\' Changed source context.\'');
    expect((await service.assessArticle(articleId, relNow))?.result.publishability.blockers).toContain("VALIDATED_PROCESSING_REQUIRED");
  });
  it("malformed persisted processing output is never trusted", async () => {
    await review(); await db.exec('UPDATE "AIProcessingRun" SET output=\'{"invented":"payload"}\'::jsonb');
    expect((await service.assessArticle(articleId, relNow))?.result.publishability.eligible).toBe(false);
  });
  it("changed source tiers create explainable revisions rather than overwriting history", async () => {
    await review(); await service.assessArticle(articleId, relNow);
    await db.exec('UPDATE "NewsSource" SET "sourceTier"=\'TIER_2_ESTABLISHED\',"reliabilityScore"=80');
    expect((await service.assessArticle(articleId, relNow))?.result.source).toMatchObject({ tier: "TIER_2_ESTABLISHED", score: 80 });
    expect(await count("ReliabilityAssessment")).toBe(2);
  });
  it("only a new grounded revision plus reviewed scoped evidence can confirm a former transfer rumor", async () => {
    await review();
    await db.query('UPDATE "NewsSource" SET type=\'OFFICIAL\',official=true,"sourceTier"=\'TIER_0_OFFICIAL\',"authorityScopes"=ARRAY[$1]', [`club:${clubId}`]);
    expect((await service.assessArticle(articleId, relNow))?.result.transferStatus).toBe("RUMOR");
    await db.exec('UPDATE "Article" SET "titleOriginal"=\'Man Utd has signed the player\',"excerptOriginal"=\'Manchester United has signed the player and officially announced the completed transfer.\'');
    const provider = fakeAI((input: ReturnType<typeof englishInput>) => translated(input, { titleVi: "Man Utd đã ký hợp đồng với cầu thủ", summaryVi: "Manchester United đã ký hợp đồng với cầu thủ.", certainty: "REPORTED", transfer: null }));
    await processArticle(articleId, new AIProcessingStore(database), provider);
    await db.exec('UPDATE "AIProcessingRun" SET "createdAt"=\'2026-10-17T06:06:00Z\' WHERE "inputSnapshot"->\'input\'->>\'title\'=\'Man Utd has signed the player\'');
    await review();
    await db.query('UPDATE "ClaimEvidence" SET kind=\'OFFICIAL_STATEMENT\',"authorityScope"=$1', [`club:${clubId}`]);
    expect(await service.assertPublicationReady(articleId, relNow)).toMatchObject({ label: "OFFICIAL", certainty: "CONFIRMED", transferStatus: "CONFIRMED", evidenceStrength: "DIRECT" });
    expect(await count("AIProcessingRun")).toBe(2); expect(await count("ClaimEvidence")).toBe(4);
  });
  it("manual overrides are protected and never silently relabeled", async () => {
    await review(); await db.exec('UPDATE "Article" SET "manualOverrideAt"=now(),"reliabilityClass"=\'RELIABLE\'');
    const result = await service.assessArticle(articleId, relNow);
    expect(result?.result.publishability.blockers).toContain("EDITORIAL_LOCK");
    expect((await db.query<{ reliabilityClass: string }>('SELECT "reliabilityClass" FROM "Article"')).rows[0].reliabilityClass).toBe("RELIABLE");
  });
  it("review metadata and correction relationships are protected by SQL constraints", async () => {
    await expect(db.exec('UPDATE "ClaimEvidence" SET "reviewedAt"=now()')).rejects.toMatchObject({ code: "23514" });
    await review(); await expect(db.exec('UPDATE "ClaimEvidence" SET "supersedesId"=id')).rejects.toMatchObject({ code: "23514" });
    await expect(db.exec('UPDATE "ClaimEvidence" SET "supersedesId"=\'00000000-0000-4000-8000-000000000000\'')).rejects.toMatchObject({ code: "23503" });
  });
  it("missing and invalid article identifiers are handled without leaking data", async () => {
    expect(await service.assessArticle(relIds.otherArticle, relNow)).toBeNull();
    await expect(service.assessArticle("invalid", relNow)).rejects.toThrow("Invalid article identifier");
  });
  it("freshness transitions are reassessed while preserving source reliability", async () => {
    await review(); const fresh = await service.assessArticle(articleId, relNow);
    const later = await service.assessArticle(articleId, new Date("2026-10-21T08:00:00Z"));
    expect(later?.result.freshness.bucket).toBe("STALE"); expect(later?.result.source).toEqual(fresh?.result.source); expect(await count("ReliabilityAssessment")).toBe(2);
  });
});
