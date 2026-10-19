import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import type { SyncDatabase } from "../lib/sync-database";
import { GdeltNewsProvider, gdeltConfig, normalizeGdelt } from "../providers/gdelt/provider";
import { NewsError } from "../providers/news/errors";
import { NewsDiscoveryService, persistDiscoveryArticles } from "../services/news-discovery";
import { AIProcessingStore } from "../services/ai-store";
import { processArticle } from "../services/ai-processing";
import { RuleBasedFallbackProvider } from "../providers/ai/fallback";
import { ReliabilityService } from "../services/reliability-service";
import { NewsQueryService } from "../services/news-ui-data";
import { persistNewsArticles } from "../services/news-store";
import { fixtureSource } from "./fixtures/news";
import { normalizedArticleSchema } from "../providers/news/normalization";
import { transferDatabase, resetTransferDatabase } from "./fixtures/transfer-store";

const now = new Date("2026-10-18T15:00:00Z");
const raw = { url: "https://publisher.example.test/news/arsenal?utm_source=feed#fragment", title: "Arsenal could consider a transfer", domain: "publisher.example.test", seendate: "20261018T140000Z", language: "English", sourcecountry: "United Kingdom", socialimage: "https://images.example.test/copyright.jpg", body: "Never persist this" };
const article = () => normalizeGdelt(raw, gdeltConfig.queries[0].query, now);

describe("GDELT discovery adapter", () => {
  it("normalizes only metadata and distinguishes seen time from publication time", () => {
    expect(article()).toMatchObject({ sourceName: raw.domain, sourceUrl: "https://publisher.example.test/news/arsenal", titleOriginal: raw.title, language: "en", publishedAt: null, excerptOriginal: null, discovery: { provider: "GDELT_DOC", metadataUsage: "DISCOVERY_ONLY", seenAt: new Date("2026-10-18T14:00:00Z") } });
    expect(article()).not.toHaveProperty("license"); expect(article()).not.toHaveProperty("body"); expect(article()).not.toHaveProperty("socialimage");
  });
  it.each([
    { url: "javascript:alert(1)" }, { url: "https://user:password@publisher.example.test/story" }, { domain: "another.example.test" },
    { title: "<script>unsafe</script>" }, { seendate: "20260230T140000Z" }, { seendate: "20261018T160000Z" }, { seendate: "20261015T140000Z" },
  ])("rejects invalid or out-of-window metadata %j", (change) => { expect(() => normalizeGdelt({ ...raw, ...change }, "query", now)).toThrow(NewsError); });
  it("queries only the GDELT endpoint, bounds results, never fetches a publisher", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ articles: [raw, { ...raw, title: null }] }));
    const result = await new GdeltNewsProvider("Premier League", { fetch: request, now: () => now }).fetchLatestArticles({ limit: 1000 });
    const url = new URL(String(request.mock.calls[0][0]));
    expect(url.origin).toBe("https://api.gdeltproject.org"); expect(url.searchParams.get("timespan")).toBe("24h"); expect(url.searchParams.get("maxrecords")).toBe("10");
    expect(request).toHaveBeenCalledTimes(1); expect(result.articles).toHaveLength(1); expect(result.rejected).toBe(1);
  });
  it.each([[429, "RATE_LIMITED"], [403, "BLOCKED"], [503, "HTTP_ERROR"]])("does not retry status %s", async (status, code) => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response("withheld", { status: Number(status) }));
    await expect(new GdeltNewsProvider("query", { fetch: request }).fetchLatestArticles({ limit: 2 })).rejects.toMatchObject({ code }); expect(request).toHaveBeenCalledTimes(1);
  });
  it.each(["not JSON", '{"articles":null}', '{}'])('rejects malformed response %s', async (body) => {
    await expect(new GdeltNewsProvider("query", { fetch: async () => new Response(body) }).fetchLatestArticles({ limit: 2 })).rejects.toMatchObject({ code: "MALFORMED" });
  });
  it("handles network and timeout without raw response/error logging", async () => {
    await expect(new GdeltNewsProvider("query", { fetch: async () => { throw new Error("sensitive"); } }).fetchLatestArticles({ limit: 2 })).rejects.toMatchObject({ code: "NETWORK" });
    await expect(new GdeltNewsProvider("query", { timeoutMs: 1, fetch: async (_url, options) => { await new Promise((resolve) => setTimeout(resolve, 5)); throw options?.signal?.reason; } }).fetchLatestArticles({ limit: 2 })).rejects.toMatchObject({ code: "TIMEOUT" });
  });
});

describe("discovery quarantine and existing pipeline", () => {
  let db: PGlite; let database: SyncDatabase;
  beforeAll(async () => { ({ db, database } = await transferDatabase()); }, 30000);
  beforeEach(async () => { await resetTransferDatabase(db); await db.exec('TRUNCATE "JobRun" CASCADE'); });
  afterAll(async () => { await db.close(); });
  const persist = async () => {
    const catalog = await new AIProcessingStore(database).catalog();
    return database.transaction((tx) => persistDiscoveryArticles(tx, [article()], catalog));
  };
  it("is idempotent, preserves original publisher identity, creates no reuse grant/body", async () => {
    expect(await persist()).toMatchObject({ stored: 1, duplicates: 0 }); expect(await persist()).toMatchObject({ stored: 0, duplicates: 1 });
    const rows = await database.query('SELECT a."contentOriginal",a."excerptOriginal",a."licenseName",a."commercialReuseAllowed",a."publishedAt",a."publicationStatus",s.name,s.enabled,s."permissionStatus",s."sourceTier",s."reliabilityScore" FROM "Article" a JOIN "NewsSource" s ON s.id=a."sourceId"');
    expect(rows).toEqual([{ contentOriginal: null, excerptOriginal: null, licenseName: null, commercialReuseAllowed: false, publishedAt: null, publicationStatus: "DRAFT", name: raw.domain, enabled: false, permissionStatus: "UNREVIEWED", sourceTier: "TIER_3_UNVERIFIED", reliabilityScore: 0 }]);
    expect(await database.query('SELECT provider FROM "ArticleDiscovery"')).toEqual([{ provider: "GDELT_DOC" }]);
    expect(JSON.stringify(await database.query('SELECT metadata FROM "ArticleDiscovery"'))).not.toMatch(/copyright.jpg|Never persist this/);
  });
  it("resolves canonical entities conservatively without granting trust to query terms", async () => {
    await persist(); const entities = await database.query('SELECT c.name FROM "ArticleEntity" e JOIN "Club" c ON c.id=e."clubId"');
    expect(entities).toEqual([{ name: "Arsenal" }]);
    expect(await database.query('SELECT "leagueId" FROM "ArticleEntity" WHERE "leagueId" IS NOT NULL')).toEqual([]);
  });
  it("keeps existing publisher settings and editorial originals on duplicate discovery", async () => {
    await persist(); await db.exec(`UPDATE "NewsSource" SET "reliabilityScore"=91,name='Reviewed Publisher'; UPDATE "Article" SET "titleVi"='Nội dung biên tập',"manualOverrideAt"=now()`);
    await persist();
    expect(await database.query('SELECT name,"reliabilityScore" FROM "NewsSource"')).toEqual([{ name: "Reviewed Publisher", reliabilityScore: 91 }]);
    expect(await database.query('SELECT "titleVi" FROM "Article"')).toEqual([{ titleVi: "Nội dung biên tập" }]);
  });
  it("does not bypass normal ingestion, AI, reliability or public news gates", async () => {
    expect(normalizedArticleSchema.safeParse(article()).success).toBe(false);
    await expect(database.transaction((tx) => persistNewsArticles(tx, fixtureSource(), [article()]))).rejects.toMatchObject({ code: "RIGHTS_REQUIRED" });
    const saved = await persist(); const id = saved.articleIds[0];
    expect(await processArticle(id, new AIProcessingStore(database), new RuleBasedFallbackProvider())).toEqual({ status: "skipped", code: "RIGHTS_REQUIRED" });
    const assessment = await new ReliabilityService(database).assessArticle(id, now);
    expect(assessment?.result.publishability.eligible).toBe(false); expect(assessment?.result.publishability.blockers).toContain("USAGE_NOT_ALLOWED");
    expect(await new NewsQueryService(database).list({ league: "all", offset: 0 }, now)).toEqual({ stories: [], nextOffset: null });
  });
  it("isolates failed queries, audits partial counts and caches repeated invocations", async () => {
    const fetch = vi.fn().mockResolvedValueOnce({ articles: [article()], rejected: 0, cursor: {}, notModified: false }).mockRejectedValueOnce(new NewsError("RATE_LIMITED"));
    const service = new NewsDiscoveryService(database, () => ({ sourceSlug: "gdelt", fetchLatestArticles: fetch }), async () => {});
    expect(await service.run()).toMatchObject({ status: "PARTIAL", found: 1, stored: 1 });
    expect(await service.run()).toMatchObject({ status: "skipped", code: "CACHED_OR_RUNNING" }); expect(fetch).toHaveBeenCalledTimes(2);
    expect(await database.query('SELECT status,"recordsProcessed" FROM "JobRun"')).toEqual([{ status: "PARTIAL", recordsProcessed: 1 }]);
  });
  it("prevents concurrent workflows using a database lease", async () => {
    let release!: () => void; const pending = new Promise<void>((resolve) => { release = resolve; }); let reached!: () => void; const entered = new Promise<void>((resolve) => { reached = resolve; });
    const service = new NewsDiscoveryService(database, () => ({ sourceSlug: "gdelt", fetchLatestArticles: async () => { reached(); await pending; return { articles: [], rejected: 0, cursor: {}, notModified: false }; } }), async () => {});
    const first = service.run(); await entered; expect(await service.run()).toMatchObject({ code: "CACHED_OR_RUNNING" }); release(); expect(await first).toMatchObject({ status: "SUCCEEDED", found: 0 });
  });
});
