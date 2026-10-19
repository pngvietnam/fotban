import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SyncDatabase } from "../lib/sync-database";
import { newsSlug } from "../lib/news-presentation";
import { AIProcessingStore } from "../services/ai-store";
import { processArticle } from "../services/ai-processing";
import { StoryClusteringService } from "../services/story-clustering";
import { NewsQueryService } from "../services/news-ui-data";
import type { AIResult } from "../providers/ai/schema";
import { clusterId } from "./fixtures/clustering";
import { relNow } from "./fixtures/reliability";

describe("public news boundary with real migrations and disposable PostgreSQL", () => {
  let db: PGlite; let database: SyncDatabase; let service: NewsQueryService;
  const clubId = clusterId(900); const playerId = clusterId(901); const leagueId = clusterId(902);
  const all = { league: "all", offset: 0 } as const;
  beforeAll(async () => {
    db = new PGlite();
    for (const entry of readdirSync("prisma/migrations", { withFileTypes: true }).filter((entry) => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) await db.exec(readFileSync(`prisma/migrations/${entry.name}/migration.sql`, "utf8"));
    database = { query: async <T>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows, transaction: (work) => db.transaction((tx) => work({ query: async <T>(sql: string, params: unknown[] = []) => (await tx.query<T>(sql, params)).rows })) };
    service = new NewsQueryService(database);
  }, 30000);
  beforeEach(async () => {
    await db.exec('TRUNCATE "Article","ArticleCluster","NewsSource","Club","Player","League" CASCADE');
    await db.query('INSERT INTO "Club" (id,slug,name,tla,"updatedAt") VALUES ($1::uuid,\'fixture-club\',\'Arsenal\',\'ARS\',now())', [clubId]);
    await db.query('INSERT INTO "Player" (id,slug,name,"updatedAt") VALUES ($1::uuid,\'fixture-player\',\'Player X\',now())', [playerId]);
    await db.query('INSERT INTO "League" (id,slug,name,country,"updatedAt") VALUES ($1::uuid,\'premier-league\',\'Premier League\',\'England\',now())', [leagueId]);
  });
  afterAll(async () => { await db.close(); });

  async function article(n: number, suffix = "") {
    const id = clusterId(n); const sourceId = clusterId(n + 100); const domain = `news-${n}.example.test`;
    await db.query('INSERT INTO "NewsSource" (id,name,domain,type,"reliabilityScore","sourceTier",rationale,reviewer,"reviewedAt","accessPolicy",enabled,"termsReviewed","ingestionAllowed","permissionStatus","permissionReference","updatedAt") VALUES ($1::uuid,$2,$3,\'PUBLICATION\',95,\'TIER_1_HIGH\',\'Fixture review\',\'Fixture editor\',\'2026-10-16T00:00:00Z\',\'test-only\',true,true,true,\'ALLOWED\',$4,now())', [sourceId, `Fixture newsroom ${n}`, domain, `https://${domain}/terms`]);
    const title = `Arsenal interested in Player X${suffix}`; const excerpt = "Arsenal are interested in a transfer involving Player X. No deal has been announced.";
    const url = `https://${domain}/story/${n}`;
    await db.query('INSERT INTO "Article" (id,slug,"sourceId","sourceUrl","canonicalUrl","titleOriginal","excerptOriginal",language,"publishedAt","collectedAt","licenseName","licenseUrl","attributionText","licenseEvidenceUrl","sourceRevisionUrl","licenseVerifiedAt","commercialReuseAllowed","updatedAt") VALUES ($1::uuid,$2,$3::uuid,$4,$4,$5,$6,\'en\',\'2026-10-17T06:00:00Z\',\'2026-10-17T06:00:00Z\',\'CC BY 4.0\',\'https://creativecommons.org/licenses/by/4.0/\',\'Fixture authors · CC BY 4.0\',$7,$8,\'2026-10-17T06:00:00Z\',true,\'2026-10-17T06:01:00Z\')', [id, `fixture-${n}`, sourceId, url, title, excerpt, `https://${domain}/terms`, `https://${domain}/revision/${n}`]);
    await processArticle(id, new AIProcessingStore(database), { name: "TEST_ONLY", model: "news-ui-fixture-v1", process: async (input): Promise<AIResult> => ({
      language: "en", titleVi: "Arsenal đang quan tâm đến Player X", summaryVi: "Arsenal được cho là đang quan tâm đến Player X.", storyType: "TRANSFER", subtype: null, certainty: "UNCERTAIN", publishable: false, warnings: ["EDITORIAL_REVIEW"],
      entities: input.entities.map((entity) => ({ id: entity.id, kind: entity.kind, mention: entity.name })), mentions: [], evidence: [{ field: "titleVi", sourceText: input.title }, { field: "summaryVi", sourceText: input.excerpt }],
      transfer: { status: "INTEREST", evidenceLevel: "SOURCE_REPORTED", sourceText: input.excerpt, player: { value: "Player X", sourceText: input.excerpt }, currentClub: null, targetClub: { value: "Arsenal", sourceText: input.excerpt } }, injury: null,
    }) });
    await db.query('UPDATE "AIProcessingRun" SET "createdAt"=\'2026-10-17T06:05:00Z\' WHERE "articleId"=$1::uuid', [id]);
    await db.query('UPDATE "ClaimEvidence" SET "claimKey"=\'fixture-interest\',"lineageKey"=$2,"reviewedBy"=\'Fixture editor\',"reviewedAt"=\'2026-10-17T07:00:00Z\' WHERE "articleId"=$1::uuid', [id, `origin-${n}`]);
    await db.query('INSERT INTO "ArticleEntity" (id,"articleId","leagueId","updatedAt") VALUES ($1::uuid,$2::uuid,$3::uuid,now())', [clusterId(20000 + n), id, leagueId]);
    return id;
  }
  async function clusterAndPublish(count = 1) {
    const ids = []; for (let n = 1; n <= count; n++) ids.push(await article(n));
    const [result] = await new StoryClusteringService(database).cluster({ now: relNow });
    expect(result.snapshot.eligible).toBe(true);
    await db.query('UPDATE "Article" SET "processingStatus"=\'READY\',"reliabilityClass"=\'RUMOR\',"publicationStatus"=\'PUBLISHED\' WHERE id=ANY($1::uuid[])', [ids]);
    return result.clusterId;
  }
  it("serves one canonical cluster with all sources, Vietnamese content, transfer roles and no bodies", async () => {
    const id = await clusterAndPublish(2); const list = await service.list(all, relNow);
    expect(list.stories).toHaveLength(1); expect(list.nextOffset).toBeNull();
    const story = await service.detail(newsSlug(id), relNow);
    expect(story).toMatchObject({ titleVi: "Arsenal đang quan tâm đến Player X", sourceCount: 2, independentSourceCount: 2, reliability: { label: "RUMOR", certainty: "POSSIBLE" }, transfer: { status: "INTEREST", player: "Player X", targetClub: "Arsenal", currentClub: null }, leagueSlugs: ["premier-league"] });
    expect(story?.sources).toHaveLength(2); expect(story?.entities).toContainEqual({ id: clubId, kind: "club", name: "Arsenal", initials: "ARS" });
    expect(JSON.stringify(story)).not.toContain("contentOriginal");
  });
  it("uses reviewed lineage rather than publisher/article counts for independence", async () => {
    const id = await clusterAndPublish(2);
    await db.exec('UPDATE "ClaimEvidence" SET "lineageKey"=\'same-origin\'');
    expect(await service.detail(newsSlug(id), relNow)).toMatchObject({ sourceCount: 2, independentSourceCount: 1, reliability: { certainty: "POSSIBLE" } });
  });
  it("never publishes an eligible DRAFT just because it has a canonical cluster", async () => {
    await article(1); const [result] = await new StoryClusteringService(database).cluster({ now: relNow });
    expect(result.snapshot.eligible).toBe(true);
    expect((await service.list(all, relNow)).stories).toEqual([]); expect(await service.detail(newsSlug(result.clusterId), relNow)).toBeNull();
  });
  it("hides restricted sources immediately, without waiting for reclustering", async () => {
    const id = await clusterAndPublish(2);
    await db.query('UPDATE "NewsSource" SET "permissionStatus"=\'RESTRICTED\',enabled=false WHERE id=$1::uuid', [clusterId(102)]);
    const story = await service.detail(newsSlug(id), relNow);
    expect(story?.sources.map((source) => source.name)).toEqual(["Fixture newsroom 1"]); expect(story?.sourceCount).toBe(1);
    await db.query('UPDATE "NewsSource" SET "permissionStatus"=\'RESTRICTED\' WHERE id=$1::uuid', [clusterId(101)]);
    expect(await service.detail(newsSlug(id), relNow)).toBeNull(); expect((await service.list(all, relNow)).stories).toEqual([]);
  });
  it("omits unpublished supporting members and cannot use a private representative", async () => {
    const id = await clusterAndPublish(2);
    await db.query('UPDATE "Article" SET "publicationStatus"=\'DRAFT\' WHERE id=$1::uuid', [clusterId(2)]);
    expect(await service.detail(newsSlug(id), relNow)).toMatchObject({ sourceCount: 1, independentSourceCount: 1 });
    await db.query('UPDATE "Article" SET "publicationStatus"=\'HIDDEN\' WHERE id=$1::uuid', [clusterId(1)]);
    expect(await service.detail(newsSlug(id), relNow)).toBeNull();
  });
  it("fails closed when the published claim relies on a private citation", async () => {
    const id = await clusterAndPublish(2);
    await db.query('UPDATE "ClaimEvidence" SET "sourceArticleId"=$2::uuid WHERE "articleId"=$1::uuid', [clusterId(1), clusterId(2)]);
    await db.query('UPDATE "Article" SET "publicationStatus"=\'DRAFT\' WHERE id=$1::uuid', [clusterId(2)]);
    expect(await service.detail(newsSlug(id), relNow)).toBeNull();
  });
  it("does not expose missing Vietnamese fields or pending processing", async () => {
    const id = await clusterAndPublish();
    await db.query('UPDATE "Article" SET "publicationStatus"=\'DRAFT\',"processingStatus"=\'NEEDS_REVIEW\',"titleVi"=NULL,"summaryVi"=NULL WHERE id=$1::uuid', [clusterId(1)]);
    expect(await service.detail(newsSlug(id), relNow)).toBeNull(); expect((await service.list(all, relNow)).stories).toEqual([]);
  });
  it("rejects missing source URLs and revoked licences on current reads", async () => {
    const id = await clusterAndPublish();
    await db.query('UPDATE "Article" SET "commercialReuseAllowed"=false WHERE id=$1::uuid', [clusterId(1)]);
    expect(await service.detail(newsSlug(id), relNow)).toBeNull();
    await expect(db.query('UPDATE "Article" SET "commercialReuseAllowed"=true,"sourceUrl"=\'\' WHERE id=$1::uuid', [clusterId(1)])).rejects.toThrow("Article_source_urls");
    expect(await service.detail(newsSlug(id), relNow)).toBeNull();
  });
  it("revalidates source originals and rejects stale or ungrounded canonical text", async () => {
    const id = await clusterAndPublish();
    await db.query('UPDATE "Article" SET "excerptOriginal"=\'The underlying source content has materially changed.\' WHERE id=$1::uuid', [clusterId(1)]);
    expect(await service.detail(newsSlug(id), relNow)).toBeNull();
  });
  it("rejects a stale canonical pair even when the Article itself passes its current gate", async () => {
    const id = await clusterAndPublish();
    await db.query('UPDATE "ArticleCluster" SET headline=\'Arsenal đã hoàn tất chuyển nhượng\' WHERE id=$1::uuid', [id]);
    expect(await service.detail(newsSlug(id), relNow)).toBeNull();
  });
  it("keeps disputed clusters private without silently choosing a source", async () => {
    const id = await clusterAndPublish(2); await db.query('UPDATE "ArticleCluster" SET "manualDisputed"=true WHERE id=$1::uuid', [id]);
    expect(await service.detail(newsSlug(id), relNow)).toBeNull(); expect((await service.list(all, relNow)).stories).toEqual([]);
  });
  it("applies EPL/La Liga filters to persisted entity associations", async () => {
    await clusterAndPublish();
    expect((await service.list({ league: "premier-league", offset: 0 }, relNow)).stories).toHaveLength(1);
    expect((await service.list({ league: "la-liga", offset: 0 }, relNow)).stories).toHaveLength(0);
    await db.exec('UPDATE "League" SET slug=\'la-liga\',name=\'La Liga\',country=\'Spain\'');
    expect((await service.list({ league: "la-liga", offset: 0 }, relNow)).stories).toHaveLength(1);
  });
  it("never writes on repeated public reads and returns null for invalid slugs", async () => {
    const id = await clusterAndPublish();
    const before = (await db.query('SELECT to_jsonb(c) AS row FROM "ArticleCluster" c')).rows;
    await service.list(all, relNow); await service.detail(newsSlug(id), relNow); await service.detail(newsSlug(id), relNow);
    expect((await db.query('SELECT to_jsonb(c) AS row FROM "ArticleCluster" c')).rows).toEqual(before);
    expect((await db.query('SELECT count(*)::int AS count FROM "ArticleClusterRevision"')).rows[0]).toEqual({ count: 1 });
    expect(await service.detail("not-a-cluster", relNow)).toBeNull();
  });
  it("paginates canonical clusters without duplicates and respects backend featured order", async () => {
    for (let n = 1; n <= 13; n++) {
      await article(n, ` report ${n}`);
      await db.query('UPDATE "Article" SET "publishedAt"=$2::timestamptz WHERE id=$1::uuid', [clusterId(n), new Date(relNow.getTime() - n * 6 * 86400000)]);
    }
    const clusters = await new StoryClusteringService(database).cluster({ now: relNow }); expect(clusters).toHaveLength(13);
    await db.exec('UPDATE "Article" SET "processingStatus"=\'READY\',"reliabilityClass"=\'RUMOR\',"publicationStatus"=\'PUBLISHED\'');
    await db.query('UPDATE "ArticleCluster" SET featured=true WHERE id=$1::uuid', [clusters[0].clusterId]);
    const first = await service.list(all, relNow); expect(first.stories).toHaveLength(12); expect(first.nextOffset).not.toBeNull();
    expect(first.stories[0].slug).toBe(newsSlug(clusters[0].clusterId));
    const second = await service.list({ ...all, offset: first.nextOffset! }, relNow);
    expect(second.stories).toHaveLength(1); expect(second.nextOffset).toBeNull(); expect(new Set([...first.stories, ...second.stories].map((story) => story.slug)).size).toBe(13);
  });
});
