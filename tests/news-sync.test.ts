import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { SyncDatabase } from "../lib/sync-database";
import { NewsSyncStore } from "../services/news-store";
import { syncNews } from "../services/news-sync";
import { NewsError } from "../providers/news/errors";
import type { NewsProvider, NewsSourceConfig } from "../types/news-provider";
import { fixtureArticle, fixtureSource, newsNow } from "./fixtures/news";
import { WikinewsNewsProvider } from "../providers/wikimedia/provider";
import { wikinewsQueryFixture, wikinewsParseFixture, wikinewsPolicyFixture } from "./fixtures/wikinews";

describe("news SQL persistence and isolated jobs", () => {
  let db: PGlite; let store: NewsSyncStore; let database: SyncDatabase;
  beforeAll(async () => {
    db = new PGlite();
    for (const dir of readdirSync("prisma/migrations", { withFileTypes: true }).filter((entry) => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) await db.exec(readFileSync(`prisma/migrations/${dir.name}/migration.sql`, "utf8"));
    database = { query: async <T>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows, transaction: (work) => db.transaction((tx) => work({ query: async <T>(sql: string, params: unknown[] = []) => (await tx.query<T>(sql, params)).rows })) };
    store = new NewsSyncStore(database, 0, 0);
  }, 30000);
  beforeEach(async () => { await db.exec('TRUNCATE "NewsSource","Article","ArticleUrl","JobRun","ProviderStatus" CASCADE'); });
  afterAll(async () => { await db.close(); });
  async function source(override: Partial<NewsSourceConfig> = {}) {
    const config = fixtureSource(override);
    await db.query('INSERT INTO "NewsSource" (id,slug,name,domain,type,"reliabilityScore","accessPolicy",enabled,language,country,official,"termsReviewed","ingestionAllowed",reviewer,"reviewedAt","permissionReference","maxExcerptChars","ingestionMethod","permissionStatus","requiresReusableLicense","updatedAt") VALUES ($1,$2,$3,$4,$5,100,\'test-only\',$6,\'en\',\'GB\',true,$7,$8,\'Fixture reviewer\',$9,$10,120,\'RSS\',$11,$12,now())', [config.id, config.slug, config.name, config.domain, config.type, config.enabled, config.termsReviewed, config.ingestionAllowed, newsNow, config.permissionReference, config.permissionStatus, config.requiresReusableLicense]);
    return config;
  }
  const provider = (config: NewsSourceConfig, articles = [fixtureArticle()]): NewsProvider => ({ sourceSlug: config.slug, fetchLatestArticles: async () => ({ articles, rejected: 0, cursor: {}, notModified: false }) });
  async function count(table: string) { return (await db.query<{ count: number }>(`SELECT count(*)::int AS count FROM "${table}"`)).rows[0].count; }
  it("runs twice through production SQL with one article/identity and two aliases", async () => {
    const config = await source(); const article = fixtureArticle({ canonicalUrl: "https://news.example.test/news/canonical" });
    await syncNews([config], store, () => provider(config, [article]));
    const id = (await db.query<{ id: string }>('SELECT id FROM "Article"')).rows[0].id;
    const result = await syncNews([config], store, () => provider(config, [article]));
    expect(result[0]).toMatchObject({ status: "synced", created: 0, duplicates: 1 });
    expect(await count("Article")).toBe(1); expect(await count("ArticleUrl")).toBe(2); expect(await count("JobRun")).toBe(1);
    expect((await db.query<{ id: string }>('SELECT id FROM "Article"')).rows[0].id).toBe(id);
    expect((await db.query<{ status: string; attempts: number }>('SELECT status,attempts FROM "JobRun"')).rows[0]).toMatchObject({ status: "SUCCEEDED", attempts: 2 });
  });
  it("prevents source/canonical crossovers and retains later discovered aliases", async () => {
    const config = await source();
    await syncNews([config], store, () => provider(config, [fixtureArticle({ canonicalUrl: "https://news.example.test/news/canonical" })]));
    await syncNews([config], store, () => provider(config, [fixtureArticle({ sourceUrl: "https://news.example.test/news/canonical", canonicalUrl: "https://news.example.test/news/new-canonical" })]));
    expect(await count("Article")).toBe(1); expect(await count("ArticleUrl")).toBe(3);
  });
  it("detects conflicting existing identities without merging or deleting them", async () => {
    const config = await source(); const second = fixtureArticle({ sourceUrl: "https://news.example.test/news/second" });
    await syncNews([config], store, () => provider(config, [fixtureArticle(), second]));
    const result = await syncNews([config], store, () => provider(config, [fixtureArticle({ canonicalUrl: second.sourceUrl })]));
    expect(result[0]).toMatchObject({ conflicts: 1, created: 0 }); expect(await count("Article")).toBe(2);
  });
  it("does not fabricate missing publication date/content, translate or publish", async () => {
    const config = await source();
    await syncNews([config], store, () => provider(config, [fixtureArticle({ publishedAt: null, excerptOriginal: null })]));
    const row = (await db.query('SELECT "publishedAt","contentOriginal","titleVi","summaryVi","processingStatus","publicationStatus","reliabilityClass" FROM "Article"')).rows[0];
    expect(row).toEqual({ publishedAt: null, contentOriginal: null, titleVi: null, summaryVi: null, processingStatus: "NEEDS_REVIEW", publicationStatus: "DRAFT", reliabilityClass: null });
  });
  it("preserves good old metadata and manual edits after incomplete reruns", async () => {
    const config = await source();
    await syncNews([config], store, () => provider(config));
    await db.exec('UPDATE "Article" SET "manualOverrideAt"=now(),"titleVi"=\'Editorial title\'');
    await syncNews([config], store, () => provider(config, [fixtureArticle({ titleOriginal: "Changed headline", publishedAt: null, excerptOriginal: null, collectedAt: new Date("2026-10-17T00:00:00Z") })]));
    const row = (await db.query<{ titleOriginal: string; excerptOriginal: string; titleVi: string; collectedAt: Date }>('SELECT "titleOriginal","excerptOriginal","titleVi","collectedAt" FROM "Article"')).rows[0];
    expect(row.titleOriginal).toBe("Fixture official update"); expect(row.titleVi).toBe("Editorial title"); expect(row.excerptOriginal).toBeTruthy(); expect(row.collectedAt).toEqual(newsNow);
  });
  it("isolates one failing source and tracks safe failure/success independently", async () => {
    const first = await source(); const second = await source({ id: "9d466d21-56c2-4d58-b708-936dfddf7310", slug: "second", domain: "second.example.test" });
    const result = await syncNews([first, second], store, (config) => config.slug === first.slug ? { sourceSlug: config.slug, fetchLatestArticles: async () => { throw new NewsError("TIMEOUT"); } } : provider(config, [fixtureArticle({ sourceUrl: "https://second.example.test/news/item" })]));
    expect(result.map((row) => row.status)).toEqual(["failed", "synced"]); expect(await count("Article")).toBe(1);
    expect((await db.query<{ health: string }>('SELECT health FROM "ProviderStatus" ORDER BY provider')).rows.map((row) => row.health).sort()).toEqual(["ERROR", "HEALTHY"]);
    expect(JSON.stringify((await db.query('SELECT "errorSafe" FROM "JobRun"')).rows)).not.toContain("stack");
  });
  it("never constructs a provider for disabled or unapproved sources", async () => {
    const config = await source({ enabled: false }); const factory = vi.fn();
    expect((await syncNews([config], store, factory))[0]).toMatchObject({ status: "skipped", code: "DISABLED" }); expect(factory).not.toHaveBeenCalled();
    const unapproved = await source({ id: "9d466d21-56c2-4d58-b708-936dfddf7310", slug: "unapproved", domain: "unapproved.example.test", ingestionAllowed: false });
    expect((await syncNews([unapproved], store, factory))[0]).toMatchObject({ code: "RIGHTS_REQUIRED" }); expect(factory).not.toHaveBeenCalled();
  });
  it("registers official metadata disabled by default and preserves operator configuration", async () => {
    await store.registerSources(); await store.registerSources(); const sources = await store.sources();
    expect(sources).toHaveLength(19); expect(sources.filter((row) => row.official)).toHaveLength(4); expect(sources.filter((row) => row.official).every((row) => row.type === "OFFICIAL" && row.reliabilityScore === 100 && !row.enabled && !row.ingestionAllowed && !row.termsReviewed && row.maxExcerptChars === 0)).toBe(true);
    expect(sources.find((row) => row.slug === "wikinews-en")).toMatchObject({ enabled: true, termsReviewed: true, permissionStatus: "ALLOWED", requiresReusableLicense: true, commercialReuseAllowed: false });
    await db.exec('UPDATE "NewsSource" SET "reliabilityScore"=91 WHERE slug=\'liverpool\''); await store.registerSources();
    expect((await store.sources()).find((row) => row.slug === "liverpool")?.reliabilityScore).toBe(91);
  });
  it("enforces permission metadata at the database level", async () => {
    await store.registerSources(); await expect(db.exec('UPDATE "NewsSource" SET "ingestionAllowed"=true')).rejects.toMatchObject({ code: "23514" });
  });
  it("rechecks permission after fetch and rolls back articles if access is revoked", async () => {
    const config = await source();
    const result = await syncNews([config], store, () => ({ sourceSlug: config.slug, fetchLatestArticles: async () => { await db.exec('UPDATE "NewsSource" SET enabled=false'); return { articles: [fixtureArticle()], rejected: 0, cursor: {}, notModified: false }; } }));
    expect(result[0].status).toBe("failed"); expect(await count("Article")).toBe(0);
  });
  it("enforces leases and uses a fresh database cache without constructing a provider", async () => {
    const config = await source(); await store.ensureStatus(config);
    const job = await store.claim(config); await expect(store.claim(config)).rejects.toMatchObject({ code: "BUSY" });
    await store.complete(job, config, [fixtureArticle()], 0, { etag: '"fixture"' }, false);
    const factory = vi.fn(); const result = await syncNews([config], new NewsSyncStore(database), factory);
    expect(result[0].status).toBe("cached"); expect(factory).not.toHaveBeenCalled();
  });
  it("persists a 429 cooldown across runs without additional provider requests", async () => {
    const config = await source();
    await syncNews([config], store, () => ({ sourceSlug: config.slug, fetchLatestArticles: async () => { throw new NewsError("RATE_LIMITED", 3600000); } }));
    const factory = vi.fn(); const result = await syncNews([config], store, factory);
    expect(result[0]).toMatchObject({ status: "failed", code: "RATE_LIMITED" }); expect(factory).not.toHaveBeenCalled();
    expect((await db.query<{ errorCode: string }>('SELECT "errorCode" FROM "JobRun"')).rows[0].errorCode).toBe("RATE_LIMITED");
  });
  it("fills missing canonical/date metadata without replacing originals or inventing a date", async () => {
    const config = await source();
    await syncNews([config], store, () => provider(config, [fixtureArticle({ publishedAt: null })]));
    await syncNews([config], store, () => provider(config, [fixtureArticle({ canonicalUrl: "https://news.example.test/news/confirmed-canonical" })]));
    const row = (await db.query<{ canonicalUrl: string; publishedAt: Date }>('SELECT "canonicalUrl","publishedAt" FROM "Article"')).rows[0];
    expect(row.canonicalUrl).toBe("https://news.example.test/news/confirmed-canonical"); expect(row.publishedAt).toEqual(newsNow);
    expect(await count("Article")).toBe(1); expect(await count("ArticleUrl")).toBe(2);
  });
  it("cannot insert any records from an invalid internal batch", async () => {
    const config = await source();
    const result = await syncNews([config], store, () => provider(config, [fixtureArticle(), fixtureArticle({ sourceUrl: "https://private:secret@news.example.test/news/bad" })]));
    expect(result[0].status).toBe("failed"); expect(await count("Article")).toBe(0);
  });
  it("ingests licensed Wikinews responses twice without duplicates and persists all reuse evidence", async () => {
    await store.registerSources();
    const config = (await store.sources()).find((entry) => entry.slug === "wikinews-en")!;
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (url) => {
      const params = new URL(String(url)).searchParams;
      const payload = params.get("action") === "query" ? wikinewsQueryFixture() : params.has("page") ? { parse: { pageid: 200, revid: 900002, text: wikinewsPolicyFixture } } : wikinewsParseFixture();
      return new Response(JSON.stringify(payload), { headers: { "Content-Type": "application/json" } });
    });
    const factory = () => new WikinewsNewsProvider(config, "FixtureBrief/0.1 (contact: test@example.test)", { fetch: fetcher, sleep: async () => {} }, () => newsNow);
    expect((await syncNews([config], store, factory))[0]).toMatchObject({ created: 1, rejected: 0 });
    expect((await syncNews([config], store, factory))[0]).toMatchObject({ created: 0, duplicates: 1, rejected: 0 });
    expect(await count("Article")).toBe(1); expect(await count("ArticleUrl")).toBe(1);
    const row = (await db.query<{ licenseName: string; commercialReuseAllowed: boolean; attributionText: string; licenseEvidenceUrl: string; publishedAtPrecision: string; contentOriginal: string | null }>('SELECT "licenseName","commercialReuseAllowed","attributionText","licenseEvidenceUrl","publishedAtPrecision","contentOriginal" FROM "Article"')).rows[0];
    expect(row).toMatchObject({ licenseName: "CC BY 4.0", commercialReuseAllowed: true, publishedAtPrecision: "DAY", contentOriginal: null }); expect(row.attributionText).toContain("Wikinews"); expect(row.licenseEvidenceUrl).toContain("oldid=900002");
    expect((await store.sources()).find((entry) => entry.slug === "wikinews-en")?.commercialReuseAllowed).toBe(true);
    expect((await store.sources()).filter((entry) => entry.official).every((entry) => !entry.enabled)).toBe(true);
  });
  it("rejects missing license before persistence for sources requiring reusable content", async () => {
    const config = await source({ requiresReusableLicense: true });
    expect((await syncNews([config], store, () => provider(config)))[0]).toMatchObject({ status: "failed", code: "MISSING_LICENSE" }); expect(await count("Article")).toBe(0);
  });
});
