import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import type { SyncDatabase } from "../lib/sync-database";
import { fixtureSource } from "./fixtures/news";
import { transferDatabase, resetTransferDatabase, transferIds } from "./fixtures/transfer-store";
import { vietnameseSources } from "../providers/news/vietnamese-sources";
import { parseVietnameseFeed, relevantVietnameseFootball, VietnameseRssNewsProvider } from "../providers/news/vietnamese-provider";
import { publisherFeedAllowed } from "../lib/publisher-feed-permission";
import { NewsSyncStore, persistNewsArticles } from "../services/news-store";
import { AIProcessingStore, eligible } from "../services/ai-store";
import { processArticle } from "../services/ai-processing";
import { RuleBasedFallbackProvider } from "../providers/ai/fallback";
import { ReliabilityService } from "../services/reliability-service";
import { sourceClassification } from "../services/reliability-engine";
import { sourceSchema } from "../types/reliability";
import { StoryClusteringService } from "../services/story-clustering";
import { NewsQueryService } from "../services/news-ui-data";
import type { SourceDefinition } from "../providers/news/sources";
import { AdminService } from "../services/admin";
import { sourceEditSchema } from "../lib/admin-policy";
import { randomUUID } from "node:crypto";

const now = new Date("2026-10-19T01:30:00Z");
const source = () => fixtureSource({ slug: "vnexpress-sport", name: "Vietnamese test publisher", domain: "vnexpress.net", type: "PUBLICATION", official: false, language: "vi", country: "VN", requiresReusableLicense: false, commercialReuseAllowed: true, permissionScope: "RSS_SUMMARY", feedUrl: "https://vnexpress.net/rss/the-thao.rss", attributionRequirement: "Theo nguồn thử nghiệm", lastTermsReviewAt: new Date("2026-10-18T00:00:00Z"), permissionReference: "https://vnexpress.net/test-only-permission", maxExcerptChars: 280 });
const definition: SourceDefinition = { slug: "vnexpress-sport", name: "Vietnamese test publisher", domain: "vnexpress.net", language: "vi", country: "VN", endpoint: "https://vnexpress.net/rss/the-thao.rss", articlePath: /^\/story\//, termsUrl: "https://vnexpress.net/test-only-permission", restriction: "TEST ONLY", linkSelector: "", titleSelector: "", cardSelector: "" };
const catalog = [{ id: transferIds.arsenal, kind: "club" as const, name: "Arsenal", aliases: ["Arsenal FC"] }];
const title = "Arsenal có thể đàm phán chuyển nhượng";
const excerpt = "Arsenal được cho là có thể đàm phán chuyển nhượng trong thời gian tới. Thông tin chưa được xác nhận.";
const item = (headline = title, summary = excerpt, date = "Mon, 19 Oct 2026 07:30:00 +0700") => `<item><title><![CDATA[${headline}]]></title><link>https://vnexpress.net/story/football</link><pubDate>${date}</pubDate><category>Bóng đá Anh</category><description><![CDATA[${summary}]]></description><content:encoded>FULL BODY MUST NEVER BE USED</content:encoded></item>`;
const feed = (items = item()) => `<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel>${items}</channel></rss>`;
const parsed = () => parseVietnameseFeed(feed(), source(), definition, catalog, now, 20);

describe("Vietnamese RSS permission and normalization", () => {
  it("registers all requested priorities without pretending newspaper reporting is official", () => {
    expect(vietnameseSources).toHaveLength(13); expect(vietnameseSources.slice(0,4).every((s) => s.tier === "TIER_1_HIGH")).toBe(true);
    expect(vietnameseSources.filter((s) => s.termsReviewed)).toHaveLength(11);
  });
  it.each(["enabled", "termsReviewed", "ingestionAllowed", "commercialReuseAllowed"] as const)("requires reviewed %s independently", (field) => {
    expect(publisherFeedAllowed({ ...source(), [field]: false })).toBe(false);
  });
  it("RSS availability, high reliability or attribution alone grants no permission", () => {
    expect(publisherFeedAllowed({ ...source(), permissionStatus: "RESTRICTED" })).toBe(false);
    expect(publisherFeedAllowed({ ...source(), permissionScope: "NONE" })).toBe(false);
    expect(publisherFeedAllowed({ ...source(), lastTermsReviewAt: null })).toBe(false);
    expect(publisherFeedAllowed({ ...source(), feedUrl: "https://attacker.test/rss" })).toBe(false);
  });
  it("preserves Vietnamese headline, UTC publication and only permitted summary/category/references", () => {
    const result = parseVietnameseFeed(feed(item(title, `${excerpt}<a href="https://www.arsenal.com/news/test">Nguồn gốc</a><img src="https://images.test/photo.jpg">`)), source(), definition, catalog, now, 20);
    expect(result.articles[0]).toMatchObject({ titleOriginal: title, language: "vi", publishedAt: new Date("2026-10-19T00:30:00Z"), feed: { categories: ["Bóng đá Anh"], evidenceReferences: ["https://www.arsenal.com/news/test"] } });
    expect(JSON.stringify(result)).not.toContain("FULL BODY"); expect(JSON.stringify(result)).not.toContain("photo.jpg");
    expect(result.articles[0].license).toBeUndefined();
  });
  it("does not retain a summary under metadata-only permission", () => {
    expect(parseVietnameseFeed(feed(), { ...source(), permissionScope: "RSS_METADATA" }, definition, catalog, now, 20).articles[0].excerptOriginal).toBeNull();
  });
  it("excludes unrelated sports and non-scope football, stale, future and invalid dates", () => {
    const result = parseVietnameseFeed(feed(item("Quần vợt Anh có kết quả mới") + item("Đội tuyển Việt Nam thi đấu", "Đội tuyển Việt Nam có buổi tập mới.") + item(title, excerpt, "Sat, 17 Oct 2026 00:00:00 +0700") + item(title, excerpt, "Mon, 19 Oct 2026 22:00:00 +0700") + item(title, excerpt, "invalid")), source(), definition, catalog, now, 20);
    expect(result).toMatchObject({ articles: [], irrelevant: 2, stale: 1, rejected: 2 });
    expect(relevantVietnameseFootball("Tin Ngoại hạng Anh", null, [])).toBe(true);
    expect(relevantVietnameseFootball("Tin La Liga", null, [])).toBe(true);
  });
  it("rejects malformed XML and external entities", () => {
    for (const xml of ["invalid", '<!DOCTYPE rss [<!ENTITY a SYSTEM "file:///secret">]>' + feed()]) expect(() => parseVietnameseFeed(xml,source(),definition,catalog,now,20)).toThrow();
  });
  it("constructs no HTTP requests for an unapproved source", async () => {
    const request = vi.fn(); await expect(new VietnameseRssNewsProvider({ ...source(), permissionStatus: "RESTRICTED" }, async () => catalog, { fetch: request }).fetchLatestArticles({ limit: 20 })).rejects.toMatchObject({ code: "RIGHTS_REQUIRED" }); expect(request).not.toHaveBeenCalled();
  });
});

describe("Vietnamese feed through current processing/reliability/clustering", () => {
  let db: PGlite; let database: SyncDatabase;
  beforeAll(async () => { ({ db, database } = await transferDatabase()); }, 30000);
  beforeEach(async () => { await resetTransferDatabase(db); await db.exec('TRUNCATE "JobRun" CASCADE'); });
  afterAll(async () => { await db.close(); });
  async function insertPermitted() {
    const s = source();
    await database.query(`INSERT INTO "NewsSource" (id,slug,name,domain,type,"sourceTier","reliabilityScore",enabled,"termsReviewed","ingestionAllowed","permissionStatus",reviewer,"reviewedAt","permissionReference","accessPolicy",language,country,rationale,"commercialReuseAllowed","permissionScope","feedUrl","attributionRequirement","lastTermsReviewAt","ingestionMethod","updatedAt") VALUES ($1::uuid,$2,$3,$4,'PUBLICATION','TIER_1_HIGH',90,true,true,true,'ALLOWED',$5,$6::timestamptz,$7,'TEST ONLY: permitted RSS summary','vi','VN','Test publisher review',true,'RSS_SUMMARY',$8,$9,$10::timestamptz,'RSS',now())`, [s.id,s.slug,s.name,s.domain,s.reviewer,s.reviewedAt,s.permissionReference,s.feedUrl,s.attributionRequirement,s.lastTermsReviewAt]);
    await database.transaction((tx) => persistNewsArticles(tx, s, parsed().articles));
    return (await database.query<{ id: string }>('SELECT id FROM "Article"'))[0].id;
  }
  it("keeps the production registry disabled and repeat registration preserves operator choices", async () => {
    const store = new NewsSyncStore(database); await store.registerSources(); await store.registerSources();
    const sources = (await store.sources()).filter((s) => s.country === "VN");
    expect(sources).toHaveLength(13); expect(sources.every((s) => !s.enabled && !s.ingestionAllowed && !s.commercialReuseAllowed && s.permissionScope === "NONE" && !s.official)).toBe(true);
    const row = await database.query<Record<string,unknown>>('SELECT * FROM "NewsSource" WHERE slug=\'vnexpress-sport\'');
    expect(sourceClassification(sourceSchema.parse(JSON.parse(JSON.stringify(row[0]))))).toBe("RELIABLE");
    await database.query('UPDATE "NewsSource" SET "newsPriority"=19 WHERE slug=\'vnexpress-sport\''); await store.registerSources();
    expect((await store.sources()).find((s) => s.slug === "vnexpress-sport")?.newsPriority).toBe(19);
  });
  it("processes granted Vietnamese RSS extractively, preserves uncertainty and creates no open licence", async () => {
    const id = await insertPermitted(); const store = new AIProcessingStore(database);
    expect(eligible((await store.article(id))!)).toBeNull();
    expect(await processArticle(id, store, new RuleBasedFallbackProvider())).toMatchObject({ status: "NEEDS_REVIEW" });
    expect(await database.query('SELECT "titleVi","summaryVi","licenseName","publicationStatus" FROM "Article"')).toEqual([{ titleVi: title, summaryVi: excerpt, licenseName: null, publicationStatus: "DRAFT" }]);
    const assessment = await new ReliabilityService(database).assessArticle(id, now);
    expect(assessment?.result.permission.usageAllowed).toBe(true); expect(assessment?.result.certainty).not.toBe("CONFIRMED");
    expect(assessment?.result.publishability.blockers).toContain("REVIEWED_EVIDENCE_REQUIRED");
    const clusters = await new StoryClusteringService(database).cluster({ now }); expect(clusters).toHaveLength(1); expect(clusters[0].snapshot.eligible).toBe(false);
    expect((await new NewsQueryService(database).list({ league: "all", offset: 0 }, now)).stories).toEqual([]);
  });
  it("is idempotent and rejects revoked or mismatched permission snapshots", async () => {
    const id = await insertPermitted();
    expect(await database.transaction((tx) => persistNewsArticles(tx,source(),parsed().articles))).toMatchObject({ created: 0, duplicates: 1 });
    expect(await database.query('SELECT count(*)::int AS n FROM "ArticleFeedSnapshot"')).toEqual([{ n: 1 }]);
    await db.exec('UPDATE "NewsSource" SET "permissionScope"=\'RSS_METADATA\'');
    expect(eligible((await new AIProcessingStore(database).article(id))!)).toBe("REUSE_REQUIRED");
    expect((await new ReliabilityService(database).assessArticle(id,now))?.result.permission.usageAllowed).toBe(false);
    await db.exec('UPDATE "NewsSource" SET "commercialReuseAllowed"=false');
    expect(eligible((await new AIProcessingStore(database).article(id))!)).toBe("REUSE_REQUIRED");
  });
  async function adminService() {
    const id = randomUUID();
    await database.query('INSERT INTO "User" (id,"authSubject",role,"updatedAt") VALUES ($1::uuid,$1::text,\'ADMIN\',now())',[id]);
    return new AdminService(database,async()=>({id}));
  }
  it("requires exact publisher permission in authenticated source activation", async () => {
    const store = new NewsSyncStore(database); await store.registerSources(); const service = await adminService();
    const [row] = await database.query<Record<string,unknown>>('SELECT * FROM "NewsSource" WHERE slug=\'vnexpress-sport\'');
    const data = sourceEditSchema.parse({...Object.fromEntries(Object.keys(sourceEditSchema.shape).map(key=>[key,row[key]])),enabled:true,ingestionAllowed:true,permissionStatus:"ALLOWED"});
    await expect(service.mutate({action:"SOURCE_UPDATE",id:row.id,reason:"Test only: availability cannot grant rights",confirm:true,expectedUpdatedAt:new Date(row.updatedAt instanceof Date ? row.updatedAt.getTime() : String(row.updatedAt)).toISOString(),data})).rejects.toThrow("PERMISSION_BLOCKED");
  });
  it("publishes a granted feed only after existing admin evidence review, then revocation hides it", async () => {
    const id = await insertPermitted(); const service = await adminService();
    await processArticle(id,new AIProcessingStore(database),new RuleBasedFallbackProvider());
    await database.query('UPDATE "ClaimEvidence" SET "reviewedBy"=\'Fixture reviewer\',"reviewedAt"=clock_timestamp(),"claimKey"=\'test-transfer-interest\',"lineageKey"=\'test-publisher-origin\' WHERE "articleId"=$1::uuid',[id]);
    const checkedAt = new Date(Date.now()+1000);
    expect((await new ReliabilityService(database).assessArticle(id,checkedAt))?.result.publishability.eligible).toBe(true);
    await service.mutate({action:"ARTICLE_APPROVE",id,reason:"Test only: reviewed exact feed claims",confirm:true},checkedAt);
    const visible = await new NewsQueryService(database).list({league:"all",offset:0},checkedAt);
    expect(visible.stories).toHaveLength(1); expect(visible.stories[0]).toMatchObject({titleVi:title,summaryVi:excerpt,reliability:{label:"RUMOR"},sources:[{name:source().name,attribution:source().attributionRequirement,licenseName:"Điều khoản RSS đã duyệt"}]});
    expect((await new NewsQueryService(database).detail(visible.stories[0].slug,checkedAt))?.titleVi).toBe(title);
    await db.exec('UPDATE "NewsSource" SET "commercialReuseAllowed"=false');
    expect((await new NewsQueryService(database).list({league:"all",offset:0},checkedAt)).stories).toEqual([]);
  });
});
