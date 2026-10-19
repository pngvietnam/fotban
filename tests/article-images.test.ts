import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { SyncDatabase } from "../lib/sync-database";
import type { NormalizedArticle } from "../types/news-provider";
import { feedUrlAllowed } from "../lib/publisher-feed-permission";
import { cardImageUrl } from "../lib/news-image-size";
import { allowedImageUrl, parseVietnameseFeed, VietnameseRssNewsProvider } from "../providers/news/vietnamese-provider";
import { vietnameseFeedUrls } from "../providers/news/vietnamese-sources";
import type { SourceDefinition } from "../providers/news/sources";
import { NewsSyncStore, persistNewsArticles } from "../services/news-store";
import { grantVietnameseSources, revokeVietnameseSource, setSourceImages } from "../services/news-grant";
import { publishFeedCards } from "../services/feed-cards";
import { FeedCardQueryService } from "../services/feed-card-query";
import { fixtureSource } from "./fixtures/news";

const now = new Date("2026-10-19T08:00:00Z");
const catalog = [{ id: randomUUID(), kind: "club" as const, name: "Arsenal FC", aliases: ["Arsenal"] }];
const definition: SourceDefinition = { slug: "vnexpress-sport", name: "Test", domain: "vnexpress.net", language: "vi", country: "VN", endpoint: "https://vnexpress.net/rss/the-thao.rss", articlePath: /^\/(?!rss(?:\/|$)).+/, termsUrl: "https://vnexpress.net/dieu-khoan-su-dung", restriction: "TEST ONLY", linkSelector: "", titleSelector: "", cardSelector: "" };
const source = (overrides = {}) => fixtureSource({ slug: "vnexpress-sport", name: "Test", domain: "vnexpress.net", type: "PUBLICATION", official: false, language: "vi", country: "VN", commercialReuseAllowed: true, permissionScope: "RSS_SUMMARY", feedUrl: "https://vnexpress.net/rss/the-thao.rss", attributionRequirement: "Theo VnExpress", lastTermsReviewAt: new Date("2026-10-19T00:00:00Z"), permissionReference: "https://vnexpress.net/dieu-khoan-su-dung", maxExcerptChars: 280, ...overrides });
const item = (extra: string, link = "https://vnexpress.net/arsenal-thang-1.html", description = "Arsenal thắng đậm trong trận tối qua tại sân nhà.") => `<item><title><![CDATA[Arsenal thắng đậm]]></title><link>${link}</link><pubDate>Mon, 19 Oct 2026 14:30:00 +0700</pubDate><description><![CDATA[${description}]]></description>${extra}</item>`;
const feed = (items: string) => `<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/"><channel>${items}</channel></rss>`;
const first = (xml: string) => parseVietnameseFeed(xml, source(), definition, catalog, now, 20).articles[0]?.feed?.imageUrl;

describe("feed image addresses", () => {
  const hosts = ["vnecdn.net", "vnexpress.net"];
  it("accepts https images on the publisher's own hosts and decodes XML entities in signed URLs", () => {
    expect(allowedImageUrl("https://i1-thethao.vnecdn.net/a.jpg?w=1200&amp;h=0&amp;s=abc", hosts)).toBe("https://i1-thethao.vnecdn.net/a.jpg?w=1200&h=0&s=abc");
    expect(allowedImageUrl("https://vnexpress.net/x.png", hosts)).toBe("https://vnexpress.net/x.png");
  });
  it("rejects other hosts, look-alikes, http, credentials, ports, data URLs and empty values", () => {
    for (const bad of ["https://evil.example/a.jpg", "https://vnecdn.net.evil.example/a.jpg", "https://notvnecdn.net/a.jpg", "http://i1.vnecdn.net/a.jpg", "https://u:p@i1.vnecdn.net/a.jpg", "https://i1.vnecdn.net:8443/a.jpg", "data:image/png;base64,AAAA", "", "   ", null, undefined, 42]) expect(allowedImageUrl(bad, hosts)).toBeNull();
    expect(allowedImageUrl("https://i1.vnecdn.net/a.jpg", [])).toBeNull();
  });
});

describe("card image sizes", () => {
  it("asks the verified CDNs for a small version and leaves everything else untouched", () => {
    expect(cardImageUrl("https://cdn2.tuoitre.vn/thumb_w/1200/4715/2026/10/19/a.jpg")).toBe("https://cdn2.tuoitre.vn/thumb_w/480/4715/2026/10/19/a.jpg");
    expect(cardImageUrl("https://icdn.dantri.com.vn/2026/10/19/a.jpg")).toBe("https://icdn.dantri.com.vn/zoom/480_270/2026/10/19/a.jpg");
    expect(cardImageUrl("https://icdn.dantri.com.vn/zoom/900_600/2026/10/19/a.jpg")).toBe("https://icdn.dantri.com.vn/zoom/480_270/2026/10/19/a.jpg");
    const signed = "https://i1-thethao.vnecdn.net/2026/10/19/a.jpg?w=1200&h=0&q=100&s=sig";
    expect(cardImageUrl(signed)).toBe(signed);
    expect(cardImageUrl("https://cdn2.tuoitre.vn/other/path.jpg")).toBe("https://cdn2.tuoitre.vn/other/path.jpg");
    expect(cardImageUrl(null)).toBeNull(); expect(cardImageUrl("not a url")).toBeNull();
  });
});

describe("image extraction from feed items", () => {
  it("reads an enclosure, media content, media thumbnail and an <img> in the description", () => {
    expect(first(feed(item('<enclosure url="https://i1-thethao.vnecdn.net/a.jpg?w=1200&amp;s=z" type="image/jpeg" length="0"/>')))).toBe("https://i1-thethao.vnecdn.net/a.jpg?w=1200&s=z");
    expect(first(feed(item('<media:content url="https://i1.vnecdn.net/b.jpg" medium="image"/>')))).toBe("https://i1.vnecdn.net/b.jpg");
    expect(first(feed(item('<media:thumbnail url="https://i1.vnecdn.net/c.jpg"/>')))).toBe("https://i1.vnecdn.net/c.jpg");
    expect(first(feed(item("", undefined, '<a href="https://vnexpress.net/x"><img src="https://i1.vnecdn.net/d.jpg" /></a>Arsenal thắng đậm trong trận tối qua.')))).toBe("https://i1.vnecdn.net/d.jpg");
  });
  it("skips non-image enclosures and images from foreign hosts, and keeps the article without an image", () => {
    expect(first(feed(item('<enclosure url="https://i1.vnecdn.net/podcast.mp3" type="audio/mpeg" length="0"/>')))).toBeUndefined();
    expect(first(feed(item('<enclosure url="https://tracker.example/pixel.gif" type="image/gif" length="0"/>')))).toBeUndefined();
    expect(parseVietnameseFeed(feed(item("")), source(), definition, catalog, now, 20).articles).toHaveLength(1);
  });
  it("prefers the first allowed candidate when an earlier one is on a foreign host", () => {
    expect(first(feed(item('<enclosure url="https://cdn.example/x.jpg" type="image/jpeg" length="0"/><media:content url="https://i1.vnecdn.net/e.jpg" medium="image"/>')))).toBe("https://i1.vnecdn.net/e.jpg");
  });
});

describe("a publisher with several feeds", () => {
  const bongda = () => source({ slug: "bongda-com-vn", name: "Bongda.com.vn", domain: "bongda.com.vn", feedUrl: "https://bongda.com.vn/bong-da-anh.rss", attributionRequirement: "Theo Bongda.com.vn", permissionReference: "https://bongda.com.vn/main-rss.html" });
  const primary = "https://bongda.com.vn/bong-da-anh.rss";
  const extras = vietnameseFeedUrls("bongda-com-vn").slice(1);
  const post = (path: string) => item("", `https://bongda.com.vn/${path}.html`);
  const respond = (routes: Record<string, string | number>, seen: { url: string; ifNoneMatch?: string }[] = []) => vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input); const headers = (init?.headers ?? {}) as Record<string, string>;
    if (url.endsWith("/robots.txt")) return new Response("User-agent: *\nAllow: /", { headers: { "Content-Type": "text/plain" } });
    seen.push({ url, ifNoneMatch: headers["If-None-Match"] });
    const body = routes[url];
    return typeof body === "number" ? new Response(null, { status: body }) : new Response(body ?? "", { headers: { "Content-Type": "application/rss+xml" } });
  }) as unknown as typeof fetch;
  const provider = (fetcher: typeof fetch) => new VietnameseRssNewsProvider(bongda(), async () => catalog, { fetch: fetcher, sleep: async () => {} }, () => now);

  it("registers the primary feed and two extras for Bongda.com.vn", () => {
    expect(vietnameseFeedUrls("bongda-com-vn")).toEqual([primary, "https://bongda.com.vn/bong-da-tbn.rss", "https://bongda.com.vn/tin-chuyen-nhuong.rss"]);
    expect(feedUrlAllowed("bongda-com-vn", primary, extras[0])).toBe(true); expect(feedUrlAllowed("bongda-com-vn", primary, "https://evil.example/x.rss")).toBe(false); expect(feedUrlAllowed("vnexpress-sport", "https://vnexpress.net/rss/the-thao.rss", extras[0])).toBe(false);
  });
  it("merges the feeds without duplicates and records which feed each article came from", async () => {
    const seen: { url: string; ifNoneMatch?: string }[] = [];
    const page = await provider(respond({ [primary]: feed(post("a") + post("b")), [extras[0]]: feed(post("b") + post("c")), [extras[1]]: feed(post("d")) }, seen)).fetchLatestArticles({ cursor: { etag: "\"v1\"" }, limit: 60 });
    expect(page.articles.map((article) => article.sourceUrl).sort()).toEqual(["a", "b", "c", "d"].map((path) => `https://bongda.com.vn/${path}.html`));
    expect(page.articles.find((article) => article.sourceUrl.endsWith("/c.html"))!.feed!.url).toBe(extras[0]);
    expect(seen.find((request) => request.url === primary)!.ifNoneMatch).toBe("\"v1\""); expect(seen.filter((request) => request.url !== primary).every((request) => request.ifNoneMatch === undefined)).toBe(true);
    expect(page).toMatchObject({ rejected: 0, notModified: false });
  });
  it("keeps the primary articles when an extra feed fails, marking the run partial; a failing primary fails the source", async () => {
    const partial = await provider(respond({ [primary]: feed(post("a")), [extras[0]]: 500, [extras[1]]: feed(post("d")) })).fetchLatestArticles({ limit: 60 });
    expect(partial.articles).toHaveLength(2); expect(partial.rejected).toBe(1);
    await expect(provider(respond({ [primary]: 500, [extras[0]]: feed(post("c")) })).fetchLatestArticles({ limit: 60 })).rejects.toThrow();
  });
  it("applies the per-source cap across all feeds and counts what it drops", async () => {
    const many = (prefix: string) => feed(Array.from({ length: 5 }, (_, n) => post(`${prefix}${n}`)).join(""));
    const page = await provider(respond({ [primary]: many("a"), [extras[0]]: many("b"), [extras[1]]: many("c") })).fetchLatestArticles({ limit: 12 });
    expect(page.articles).toHaveLength(12); expect(page.stats).toMatchObject({ overLimit: 3 });
  });
});

describe("showing publisher images (SQL)", () => {
  let db: PGlite; let database: SyncDatabase; let store: NewsSyncStore;
  const check = new Date("2026-10-19T03:00:00Z");
  beforeAll(async () => {
    db = new PGlite();
    for (const entry of readdirSync("prisma/migrations", { withFileTypes: true }).filter((entry) => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) await db.exec(readFileSync(`prisma/migrations/${entry.name}/migration.sql`, "utf8"));
    database = {
      query: async <T>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows,
      transaction: (work) => db.transaction((tx) => work({ query: async <T>(sql: string, params: unknown[] = []) => (await tx.query<T>(sql, params)).rows })),
    };
    store = new NewsSyncStore(database);
  }, 60000);
  beforeEach(async () => {
    await db.exec('TRUNCATE "FeedCard","ArticleFeedSnapshot","ArticleEntity","ArticleUrl","Article","AdminAuditLog","User","NewsSource","Match","ClubSeason","Season","Club","League" CASCADE');
    await database.query('INSERT INTO "League" (id,slug,name,country,"updatedAt") VALUES ($1::uuid,\'premier-league\',\'Premier League\',\'England\',now())', [randomUUID()]);
    await database.query('INSERT INTO "Club" (id,slug,name,aliases,"updatedAt") VALUES ($1::uuid,\'club-a\',\'Arsenal FC\',ARRAY[\'Arsenal\'],now())', [randomUUID()]);
    await store.registerSources();
    await grantVietnameseSources(database, { slugs: ["vnexpress-sport"], reviewer: "FotBan", reason: "Owner grant for image tests" });
  });
  afterAll(async () => { await db.close(); });
  async function ingest(imageUrl: string | undefined, path: string = randomUUID()) {
    const s = (await store.sources()).find((item) => item.slug === "vnexpress-sport")!;
    const article: NormalizedArticle = { sourceName: s.name, sourceUrl: `https://${s.domain}/${path}.html`, canonicalUrl: null, titleOriginal: "Arsenal thắng đậm", excerptOriginal: "Arsenal thắng đậm trong trận tối qua tại sân nhà.", language: "vi", publishedAt: new Date("2026-10-18T22:00:00Z"), collectedAt: check,
      feed: { url: s.feedUrl!, termsUrl: s.permissionReference!, scope: "RSS_SUMMARY", attribution: s.attributionRequirement!, reviewedAt: s.lastTermsReviewAt!, categories: [], evidenceReferences: [], ...(imageUrl ? { imageUrl } : {}) } };
    await database.transaction((tx) => persistNewsArticles(tx, s, [article]));
    await publishFeedCards(database, check);
    return article;
  }
  const lead = async () => (await new FeedCardQueryService(database).list({ league: "all", offset: 0 }, check)).groups[0]?.lead;

  it("shows the image only while the owner's switch is on and the host is the publisher's", async () => {
    await ingest("https://i1-thethao.vnecdn.net/a.jpg?w=1&s=z");
    expect((await lead())?.image).toBe("https://i1-thethao.vnecdn.net/a.jpg?w=1&s=z");
    await setSourceImages(database, { slugs: ["vnexpress-sport"], reviewer: "FotBan", reason: "Báo yêu cầu gỡ ảnh (kiểm thử)", allowed: false });
    expect((await lead())?.image).toBeNull();
    await setSourceImages(database, { slugs: ["vnexpress-sport"], reviewer: "FotBan", reason: "Bật lại ảnh sau khi báo đồng ý", allowed: true });
    expect((await lead())?.image).toContain("vnecdn.net");
    expect(await database.query('SELECT 1 FROM "AdminAuditLog" WHERE action IN (\'SOURCE_IMAGES_OFF\',\'SOURCE_IMAGES_ON\')')).toHaveLength(2);
  });
  it("never serves an image stored for a foreign host and keeps cards without images working", async () => {
    await ingest("https://evil.example/a.jpg");
    expect((await lead())?.image).toBeNull(); expect((await lead())?.title).toBe("Arsenal thắng đậm");
  });
  it("fills the image of an article already stored without one when it appears again in the feed", async () => {
    const article = await ingest(undefined, "same");
    expect((await lead())?.image).toBeNull();
    await ingest("https://i1.vnecdn.net/late.jpg", "same");
    expect(article.sourceUrl).toContain("same"); expect((await lead())?.image).toBe("https://i1.vnecdn.net/late.jpg");
  });
  it("keeps existing stories visible when a grant changes only the image switch or the reviewer", async () => {
    await ingest("https://i1.vnecdn.net/a.jpg");
    const stamp = async () => (await database.query<{ at: Date }>('SELECT "lastTermsReviewAt" AS at FROM "NewsSource" WHERE slug=\'vnexpress-sport\'' ))[0].at.getTime();
    const before = await stamp();
    await setSourceImages(database, { slugs: ["vnexpress-sport"], reviewer: "FotBan", reason: "Tắt ảnh để kiểm thử", allowed: false });
    await grantVietnameseSources(database, { slugs: ["vnexpress-sport"], reviewer: "Another Operator", reason: "Cấp lại quyền, chỉ bật ảnh và đổi người duyệt" });
    expect(await stamp()).toBe(before);
    expect((await lead())?.image).toContain("vnecdn.net");
  });
  it("hides stories after a real terms change until the feed shows them again unchanged", async () => {
    await ingest(undefined, "kept");
    expect((await lead())?.title).toBe("Arsenal thắng đậm");
    await database.query('UPDATE "NewsSource" SET "lastTermsReviewAt"=now(),"updatedAt"=now() WHERE slug=\'vnexpress-sport\'');
    expect(await lead()).toBeUndefined();
    await ingest("https://i1.vnecdn.net/again.jpg", "kept");
    expect((await lead())?.image).toBe("https://i1.vnecdn.net/again.jpg");
  });
  it("refuses a non-https stored address at the database and drops cards when the grant is revoked", async () => {
    const article = await ingest("https://i1.vnecdn.net/a.jpg");
    await expect(database.query(`UPDATE "ArticleFeedSnapshot" SET "imageUrl"='http://i1.vnecdn.net/a.jpg'`)).rejects.toThrow();
    expect(article.titleOriginal).toBe("Arsenal thắng đậm");
    await revokeVietnameseSource(database, { slugs: ["vnexpress-sport"], reviewer: "FotBan", reason: "Báo rút quyền sử dụng (kiểm thử)" });
    expect(await lead()).toBeUndefined();
  });
});
