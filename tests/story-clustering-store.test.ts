import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SyncDatabase } from "../lib/sync-database";
import { AIProcessingStore } from "../services/ai-store";
import { processArticle } from "../services/ai-processing";
import { StoryClusteringService } from "../services/story-clustering";
import type { AIInput } from "../types/ai-provider";
import type { AIResult } from "../providers/ai/schema";
import { clusterId } from "./fixtures/clustering";
import { relNow } from "./fixtures/reliability";

describe("story clustering with production SQL and disposable PostgreSQL", () => {
  let db: PGlite; let database: SyncDatabase; let service: StoryClusteringService;
  const adminId = clusterId(999); const clubId = clusterId(900); const playerId = clusterId(901);
  beforeAll(async () => {
    db = new PGlite();
    for (const dir of readdirSync("prisma/migrations", { withFileTypes: true }).filter((entry) => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) await db.exec(readFileSync(`prisma/migrations/${dir.name}/migration.sql`, "utf8"));
    database = { query: async <T>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows, transaction: (work) => db.transaction((tx) => work({ query: async <T>(sql: string, params: unknown[] = []) => (await tx.query<T>(sql, params)).rows })) };
    service = new StoryClusteringService(database);
  }, 30000);
  beforeEach(async () => {
    await db.exec('TRUNCATE "Article","ArticleCluster","NewsSource","Club","Player","User" CASCADE');
    await db.query('INSERT INTO "Club" (id,slug,name,aliases,"updatedAt") VALUES ($1::uuid,\'fixture-arsenal\',\'Arsenal\',ARRAY[\'ARS\'],now())', [clubId]);
    await db.query('INSERT INTO "Player" (id,slug,name,"updatedAt") VALUES ($1::uuid,\'fixture-player\',\'Player X\',now())', [playerId]);
    await db.query('INSERT INTO "User" (id,"authProvider","authSubject",role,"updatedAt") VALUES ($1::uuid,\'test-only\',\'fixture-admin\',\'ADMIN\',now())', [adminId]);
  });
  afterAll(async () => { await db.close(); });
  async function count(table: string) { return (await db.query<{ count: number }>(`SELECT count(*)::int AS count FROM "${table}"`)).rows[0].count; }
  function output(input: AIInput): AIResult {
    const signed = input.title.includes("has signed"); const bid = /\bbid\b/i.test(input.title); const leaving = /will leave|staying/.test(input.title);
    const titleVi = signed ? "Arsenal đã ký hợp đồng với Player X" : bid ? "Arsenal gửi đề nghị cho Player X" : leaving ? input.title.includes("staying") ? "Player X được cho là sẽ ở lại Arsenal" : "Player X có thể rời Arsenal" : "Arsenal đang quan tâm đến Player X";
    return { language: "en", titleVi, summaryVi: signed ? "Arsenal đã ký hợp đồng với Player X." : bid ? "Arsenal gửi đề nghị cho Player X." : leaving ? `${titleVi}.` : "Arsenal được cho là đang quan tâm đến Player X.", storyType: "TRANSFER", subtype: null, certainty: signed || bid ? "REPORTED" : "UNCERTAIN", publishable: false, warnings: ["EDITORIAL_REVIEW"], entities: input.entities.map((entity) => ({ id: entity.id, kind: entity.kind, mention: entity.name })), mentions: [], evidence: [{ field: "titleVi", sourceText: input.title }, { field: "summaryVi", sourceText: input.excerpt }], transfer: signed || bid || leaving ? null : { status: "INTEREST", evidenceLevel: "SOURCE_REPORTED", sourceText: input.excerpt, player: { value: "Player X", sourceText: input.excerpt }, currentClub: null, targetClub: { value: "Arsenal", sourceText: input.excerpt } }, injury: null };
  }
  async function process(id: string, official = false) {
    const result = await processArticle(id, new AIProcessingStore(database), { name: "TEST_ONLY", model: "clustering-fixture-v1", process: async (input) => output(input) });
    expect(result.status).toBe("NEEDS_REVIEW");
    await db.query('UPDATE "AIProcessingRun" SET "createdAt"=\'2026-10-17T06:05:00Z\' WHERE "articleId"=$1::uuid AND output->>\'titleVi\' NOT LIKE \'%đã ký%\'', [id]);
    await db.query('UPDATE "AIProcessingRun" SET "createdAt"=\'2026-10-17T06:06:00Z\' WHERE "articleId"=$1::uuid AND output->>\'titleVi\' LIKE \'%đã ký%\'', [id]);
    await db.query('UPDATE "ClaimEvidence" SET "claimKey"=$2,"lineageKey"=$3,"reviewedBy"=\'Fixture editor\',"reviewedAt"=\'2026-10-17T07:00:00Z\',kind=$4::"EvidenceKind","authorityScope"=$5 WHERE "articleId"=$1::uuid', [id, `fixture-transfer-${id}`, `source:${id}`, official ? "OFFICIAL_STATEMENT" : "ARTICLE_SOURCE", official ? `club:${clubId}` : null]);
  }
  async function article(n: number, options: { title?: string; source?: number; publishedAt?: string; collectedAt?: string; official?: boolean; url?: string } = {}) {
    const id = clusterId(n); const sourceNumber = options.source ?? n; const sourceId = clusterId(sourceNumber + 100); const domain = `news-${sourceNumber}.example.test`;
    await db.query('INSERT INTO "NewsSource" (id,name,domain,type,"reliabilityScore","sourceTier",official,"authorityScopes",rationale,reviewer,"reviewedAt","accessPolicy",enabled,"termsReviewed","ingestionAllowed","permissionStatus","permissionReference","updatedAt") VALUES ($1::uuid,$2,$3,$4::"SourceType",95,$5::"SourceTier",$6,$7::text[],\'Fixture editorial review\',\'Fixture editor\',\'2026-10-16T00:00:00Z\',\'test-only\',true,true,true,\'ALLOWED\',$8,now()) ON CONFLICT (id) DO NOTHING', [sourceId, `Fixture newsroom ${sourceNumber}`, domain, options.official ? "OFFICIAL" : "PUBLICATION", options.official ? "TIER_0_OFFICIAL" : "TIER_1_HIGH", options.official ?? false, options.official ? [`club:${clubId}`] : [], `https://${domain}/terms`]);
    const title = options.title ?? "Arsenal interested in Player X";
    const excerpt = title.includes("has signed") ? "Arsenal has signed Player X and officially announced the completed transfer." : /\bbid\b/i.test(title) ? "Arsenal submitted a bid for Player X. The club is awaiting a response." : /will leave|staying/.test(title) ? `${title}. Player X could remain with Arsenal as the situation develops.` : "Arsenal are interested in a transfer involving Player X. No deal has been announced.";
    const url = options.url ?? `https://${domain}/story/${n}`;
    await db.query('INSERT INTO "Article" (id,slug,"sourceId","sourceUrl","canonicalUrl","titleOriginal","excerptOriginal",language,"publishedAt","collectedAt","licenseName","licenseUrl","attributionText","licenseEvidenceUrl","sourceRevisionUrl","licenseVerifiedAt","commercialReuseAllowed","updatedAt") VALUES ($1::uuid,$2,$3::uuid,$4,$4,$5,$6,\'en\',$7::timestamptz,$8::timestamptz,\'CC BY 4.0\',\'https://creativecommons.org/licenses/by/4.0/\',\'Fixture authors, licence and changes\',$9,$10,\'2026-10-17T06:00:00Z\',true,\'2026-10-17T06:01:00Z\')', [id, `fixture-${n}`, sourceId, url, title, excerpt, options.publishedAt ?? "2026-10-17T06:00:00Z", options.collectedAt ?? "2026-10-17T06:00:00Z", `https://${domain}/terms`, `https://${domain}/revision/${n}`]);
    await db.query('INSERT INTO "ArticleUrl" (url,"articleId") VALUES ($1,$2::uuid)', [url, id]);
    await process(id, options.official); return id;
  }
  it("groups persisted near-duplicates and exposes one grounded candidate with all provenance", async () => {
    const a = await article(1); await article(2, { title: "Arsenal monitoring Player X" });
    const [result] = await service.cluster({ now: relNow });
    expect(result.snapshot).toMatchObject({ articleCount: 2, sourceCount: 2, independentSourceCount: 2, eligible: true });
    expect(result.snapshot.headlineVi).toBe(output({ title: "", excerpt: "", articleId: a, language: "en", sourceUrl: "", entities: [] }).titleVi);
    expect((await service.current(result.clusterId, relNow))?.candidate?.sources).toHaveLength(2);
    expect(await count("Article")).toBe(2); expect(await count("ClaimEvidence")).toBe(4); expect(await count("ArticleUrl")).toBe(2);
  });
  it("repeated and concurrent runs retain one cluster, revision and one FK per Article", async () => {
    await article(1); await article(2);
    const first = await service.cluster({ now: relNow }); const second = await service.cluster({ now: relNow });
    expect(second[0].clusterId).toBe(first[0].clusterId); expect(second[0].changed).toBe(false);
    await Promise.all([service.cluster({ now: relNow }), service.cluster({ now: relNow })]);
    expect(await count("ArticleCluster")).toBe(1); expect(await count("ArticleClusterRevision")).toBe(1);
    expect((await db.query('SELECT DISTINCT "clusterId" FROM "Article"')).rows).toHaveLength(1);
  });
  it("normalizes legacy duplicate URLs without deleting records or URL identities", async () => {
    await article(1); await article(2, { source: 1, url: "https://news-1.example.test/story/1?utm_source=fixture" });
    const [result] = await service.cluster({ now: relNow });
    expect(result.snapshot.articleCount).toBe(2); expect(result.snapshot.sourceCount).toBe(1);
    expect(await count("ArticleUrl")).toBe(2);
  });
  it("copied/syndicated sources retain two publishers but only one independent origin", async () => {
    await article(1); await article(2);
    await db.exec('UPDATE "ClaimEvidence" SET "lineageKey"=\'shared-original-report\'');
    expect((await service.cluster({ now: relNow }))[0].snapshot).toMatchObject({ sourceCount: 2, independentSourceCount: 1, certainty: "POSSIBLE" });
  });
  it("interest and authoritative confirmed signing stay in separate clusters", async () => {
    const rumor = await article(1); await article(2, { title: "Arsenal has signed Player X", official: true });
    const results = await service.cluster({ now: relNow }); expect(results).toHaveLength(2);
    expect(results.find((result) => result.snapshot.articleIds.includes(rumor))?.snapshot.certainty).toBe("POSSIBLE");
    expect(results.find((result) => !result.snapshot.articleIds.includes(rumor))?.snapshot.certainty).toBe("CONFIRMED");
  });
  it("changed source revisions split evolving stages and retain earlier cluster snapshots", async () => {
    const a = await article(1); await article(2); const [original] = await service.cluster({ now: relNow });
    await db.query('UPDATE "NewsSource" SET type=\'OFFICIAL\',official=true,"sourceTier"=\'TIER_0_OFFICIAL\',"authorityScopes"=ARRAY[$2] WHERE id=$1::uuid', [clusterId(101), `club:${clubId}`]);
    await db.query('UPDATE "Article" SET "titleOriginal"=\'Arsenal has signed Player X\',"excerptOriginal"=\'Arsenal has signed Player X and officially announced the completed transfer.\' WHERE id=$1::uuid', [a]);
    await process(a, true);
    const current = await service.cluster({ now: relNow }); expect(current).toHaveLength(2);
    const old = (await db.query<{ snapshot: { articleCount: number } }>('SELECT snapshot FROM "ArticleClusterRevision" WHERE "clusterId"=$1::uuid ORDER BY revision', [original.clusterId])).rows;
    expect(old[0].snapshot.articleCount).toBe(2); expect(old.at(-1)?.snapshot.articleCount).toBe(1);
    expect(await count("AIProcessingRun")).toBe(3); expect(await count("ClaimEvidence")).toBe(6);
  });
  it("conflicting departure reports are retained in a disputed cluster", async () => {
    await article(1, { title: "Arsenal Player X will leave" }); await article(2, { title: "Arsenal Player X staying" });
    const [result] = await service.cluster({ now: relNow });
    expect(result.snapshot).toMatchObject({ articleCount: 2, disputed: true, certainty: "DISPUTED", headlineVi: null, eligible: false });
    expect(await count("ClaimEvidence")).toBe(4);
  });
  it("permission changes create revisions and remove unsafe canonical text on fresh reads", async () => {
    await article(1); await article(2); const [initial] = await service.cluster({ now: relNow });
    await db.query('UPDATE "NewsSource" SET "permissionStatus"=\'RESTRICTED\' WHERE id=$1::uuid', [clusterId(101)]);
    const changed = await service.current(initial.clusterId, relNow); expect(changed?.snapshot).toMatchObject({ articleCount: 2, sourceCount: 1, representativeArticleId: clusterId(2) });
    await db.exec('UPDATE "NewsSource" SET "permissionStatus"=\'RESTRICTED\'');
    const blocked = await service.current(initial.clusterId, relNow); expect(blocked?.snapshot).toMatchObject({ headlineVi: null, summaryVi: null, sourceCount: 0, eligible: false }); expect(blocked?.candidate).toBeNull();
    expect(await count("ArticleClusterRevision")).toBe(3); expect(await count("Article")).toBe(2);
  });
  it("old stories stay separate and a since-filter never truncates an existing cluster", async () => {
    await article(1, { publishedAt: "2026-10-01T00:00:00Z", collectedAt: "2026-10-01T01:00:00Z" }); await article(2);
    expect(await service.cluster({ now: relNow })).toHaveLength(2);
    await db.query('UPDATE "Article" SET "publishedAt"=\'2026-10-17T06:00:00Z\' WHERE id=$1::uuid', [clusterId(1)]);
    expect((await service.cluster({ now: relNow })).filter((result) => result.snapshot.articleCount)).toHaveLength(1);
    const recent = await service.cluster({ since: new Date("2026-10-17T05:00:00Z"), now: relNow });
    expect(recent[0].snapshot.articleCount).toBe(2);
  });
  it("audited manual merge is reversible and retains source/evidence history", async () => {
    await article(1, { publishedAt: "2026-10-10T06:00:00Z" }); await article(2);
    const initial = await service.cluster({ now: relNow }); const ids = initial.map((result) => result.clusterId); const target = ids[0];
    const merged = await service.merge(ids, target, adminId, "Reviewed evolving story relationship", relNow);
    expect((await service.current(target, relNow))?.snapshot.articleCount).toBe(2);
    await service.cluster({ now: relNow });
    await service.undoMerge(merged.auditId, adminId, "Restore original story boundaries", relNow);
    expect((await db.query('SELECT DISTINCT "clusterId" FROM "Article"')).rows).toHaveLength(2);
    expect(await count("AdminAuditLog")).toBe(2); expect(await count("Article")).toBe(2); expect(await count("ClaimEvidence")).toBe(4);
    await expect(service.undoMerge(merged.auditId, adminId, "Reject stale undo request", relNow)).rejects.toThrow("MERGE_CHANGED_SINCE_AUDIT");
  });
  it("manual split is pinned against automatic rejoining", async () => {
    await article(1); await article(2); const [initial] = await service.cluster({ now: relNow });
    await service.split(initial.clusterId, [clusterId(2)], adminId, "Reviewed separate story boundaries", relNow);
    await service.cluster({ now: relNow });
    expect((await db.query('SELECT DISTINCT "clusterId" FROM "Article"')).rows).toHaveLength(2); expect(await count("ArticleCluster")).toBe(2);
  });
  it("canonical/feature/dispute overrides are audited and remain grounded", async () => {
    await article(1); await article(2); const [initial] = await service.cluster({ now: relNow });
    await service.override(initial.clusterId, { representativeArticleId: clusterId(2), featured: true }, adminId, "Prefer the reviewed source headline", relNow);
    expect((await service.current(initial.clusterId, relNow))?.snapshot).toMatchObject({ representativeArticleId: clusterId(2), featured: true });
    await service.override(initial.clusterId, { disputed: true }, adminId, "Flag conflicting reviewed evidence", relNow);
    expect((await service.current(initial.clusterId, relNow))?.snapshot).toMatchObject({ disputed: true, eligible: false, headlineVi: null });
    await expect(service.override(initial.clusterId, { representativeArticleId: clusterId(333) }, adminId, "Unrelated source must not become canonical", relNow)).rejects.toThrow("UNGROUNDED_CANONICAL_OVERRIDE");
    expect(await count("AdminAuditLog")).toBe(2);
  });
  it("undo refuses to overwrite editorial changes made after a merge", async () => {
    await article(1); await article(2, { title: "Arsenal submits bid for Player X" });
    const initial = await service.cluster({ now: relNow }); const ids = initial.map((result) => result.clusterId);
    const merge = await service.merge(ids, ids[0], adminId, "Review stages as one evolving story", relNow);
    await service.override(ids[0], { featured: true }, adminId, "Feature for future editorial review", relNow);
    await expect(service.undoMerge(merge.auditId, adminId, "Avoid erasing later editorial edits", relNow)).rejects.toThrow("MERGE_CHANGED_SINCE_AUDIT");
  });
  it("manual operations require an existing ADMIN and a meaningful reason", async () => {
    await article(1); await article(2); const [initial] = await service.cluster({ now: relNow });
    await expect(service.split(initial.clusterId, [clusterId(2)], clusterId(998), "Non-admin operation must be rejected", relNow)).rejects.toThrow("ADMIN_REQUIRED");
    await expect(service.split(initial.clusterId, [clusterId(2)], adminId, "fix", relNow)).rejects.toThrow("EDITORIAL_REASON_REQUIRED");
    expect(await count("AdminAuditLog")).toBe(0);
  });
  it("published membership is pinned and cannot be silently changed by editorial operations", async () => {
    await article(1); await article(2); const [initial] = await service.cluster({ now: relNow });
    await db.query('UPDATE "Article" SET "processingStatus"=\'READY\',"reliabilityClass"=\'RUMOR\',"publicationStatus"=\'PUBLISHED\' WHERE id=$1::uuid', [clusterId(1)]);
    await expect(service.split(initial.clusterId, [clusterId(2)], adminId, "Published stories require a separate revision workflow", relNow)).rejects.toThrow("CLUSTER_MISSING_OR_PUBLISHED");
    await service.cluster({ now: relNow });
    expect((await service.current(initial.clusterId, relNow))?.snapshot.articleCount).toBe(2);
    expect((await db.query<{ publicationStatus: string }>('SELECT "publicationStatus" FROM "Article" WHERE id=$1::uuid', [clusterId(1)])).rows[0].publicationStatus).toBe("PUBLISHED");
  });
  it("bounded batches fail atomically instead of silently dropping members", async () => {
    await article(1); await article(2);
    await expect(new StoryClusteringService(database, { maxArticles: 1 }).cluster({ now: relNow })).rejects.toThrow("CLUSTER_BATCH_TOO_LARGE");
    expect(await count("ArticleCluster")).toBe(0); expect(await count("Article")).toBe(2);
  });
  it("empty input and invalid configuration/identifiers are handled safely", async () => {
    expect(await service.cluster({ now: relNow })).toEqual([]);
    expect(await service.current(clusterId(1), relNow)).toBeNull();
    await expect(service.current("invalid", relNow)).rejects.toThrow();
    expect(() => new StoryClusteringService(database, { defaultWindowHours: -1 })).toThrow("INVALID_CLUSTER_POLICY");
  });
});
