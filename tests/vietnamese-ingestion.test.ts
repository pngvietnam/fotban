import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SyncDatabase } from "../lib/sync-database";
import { boundedExcerpt, normalizeNewsArticle } from "../providers/news/normalization";
import { parseVietnameseFeed, relevantVietnameseFootball } from "../providers/news/vietnamese-provider";
import { vietnameseSources } from "../providers/news/vietnamese-sources";
import { vietnameseClubAliases } from "../providers/news/vietnamese-aliases";
import { hasMention, resolveEntities } from "../providers/ai/rules";
import { publisherFeedAllowed } from "../lib/publisher-feed-permission";
import { grantVietnameseSources, NewsGrantError, revokeVietnameseSource } from "../services/news-grant";
import { NewsSyncStore } from "../services/news-store";
import type { SourceDefinition } from "../providers/news/sources";
import { fixtureSource } from "./fixtures/news";

const definition: SourceDefinition = { slug: "tuoitre-sport", name: "Test", domain: "tuoitre.vn", language: "vi", country: "VN", endpoint: "https://tuoitre.vn/rss/the-thao.rss", articlePath: /^\/(?!rss(?:\/|$)).+/, termsUrl: "https://tuoitre.vn/rss.htm", restriction: "TEST ONLY", linkSelector: "", titleSelector: "", cardSelector: "" };
const source = (overrides = {}) => fixtureSource({ slug: "tuoitre-sport", name: "Test", domain: "tuoitre.vn", type: "PUBLICATION", official: false, language: "vi", country: "VN", commercialReuseAllowed: true, permissionScope: "RSS_SUMMARY", feedUrl: "https://tuoitre.vn/rss/the-thao.rss", attributionRequirement: "Theo nguồn thử nghiệm", lastTermsReviewAt: new Date("2026-10-19T00:00:00Z"), permissionReference: "https://tuoitre.vn/rss.htm", maxExcerptChars: 280, ...overrides });
const date = (published: string, naiveOffset?: string) => normalizeNewsArticle({ title: "Tin thử", url: "https://tuoitre.vn/tin-thu.htm", published }, source(), definition, new Date(), { naiveOffset }).publishedAt?.toISOString() ?? null;

describe("Vietnamese feed dates and excerpts", () => {
  it("reads publisher-local dates only with an explicit offset, including U+202F before AM/PM", () => {
    expect(date("10/19/2026 7:17:00 AM", "+07:00")).toBe("2026-10-19T00:17:00.000Z");
    expect(date("10/19/2026 7:17:00 PM", "+07:00")).toBe("2026-10-19T12:17:00.000Z");
    expect(date("10/19/2026 12:05:00 AM", "+07:00")).toBe("2026-10-18T17:05:00.000Z");
    expect(date("2026/10/19 08:06:03", "+07:00")).toBe("2026-10-19T01:06:03.000Z");
    expect(date("10/19/2026 7:17:00 AM")).toBeNull();
  });
  it("accepts short +07 offsets and rejects impossible calendar dates", () => {
    expect(date("Mon, 19 Oct 2026 07:53:00 +07")).toBe("2026-10-19T00:53:00.000Z");
    expect(date("2/31/2026 7:00:00 AM", "+07:00")).toBeNull();
    expect(date("10/19/2026 13:00:00 PM", "+07:00")).toBeNull();
  });
  it("cuts permitted excerpts at a sentence or word boundary within the cap", () => {
    expect(boundedExcerpt("Câu thứ nhất khá dài một chút. Câu hai dài hơn nhiều so với giới hạn.", 40)).toBe("Câu thứ nhất khá dài một chút.");
    // A sentence end in the first half would discard too much; the cut falls back to a word boundary.
    expect(boundedExcerpt("Câu một ngắn. Câu hai dài hơn nhiều so với giới hạn.", 30)).toBe("Câu một ngắn. Câu hai dài…");
    const cut = boundedExcerpt("Arsenal thắng nhọc nhằn để bám đuổi Man City trong cuộc đua", 30);
    expect(cut.endsWith("…")).toBe(true); expect(cut.length).toBeLessThanOrEqual(30); expect(cut).not.toMatch(/\s…$/);
    expect(boundedExcerpt("ngắn", 30)).toBe("ngắn");
  });
});

const catalog = [
  { id: randomUUID(), kind: "club" as const, name: "Chelsea FC", aliases: ["Chelsea", "CHE"] },
  { id: randomUUID(), kind: "club" as const, name: "Real Racing Club de Santander", aliases: ["Santander", "SAN"] },
  { id: randomUUID(), kind: "club" as const, name: "Manchester United FC", aliases: ["MU", "Man Utd", "MUN"] },
  { id: randomUUID(), kind: "club" as const, name: "FC Barcelona", aliases: ["Barça"] },
  { id: randomUUID(), kind: "club" as const, name: "Real Madrid CF", aliases: ["Real", "Real Madrid"] },
  { id: randomUUID(), kind: "club" as const, name: "Real Betis Balompié", aliases: ["Real Betis", "Betis"] },
  { id: randomUUID(), kind: "player" as const, name: "Kylian Mbappé", aliases: ["Mbappé"] },
];
const names = (text: string) => resolveEntities(text, catalog).map((entity) => catalog.find((item) => item.id === entity.id)?.name);

describe("Vietnamese entity matching", () => {
  it("matches upper-case codes case-sensitively so Vietnamese words are not clubs", () => {
    expect(names("Barça san bằng tỷ số và che chắn bóng tốt")).toEqual(["FC Barcelona"]);
    expect(names("MU thua trận thứ 5")).toEqual(["Manchester United FC"]);
    expect(hasMention("mu", "MU")).toBe(false);
  });
  it("matches Latin-accented names written without accents", () => {
    expect(names("Barca thắng, Mbappe lập cú đúp")).toEqual(["FC Barcelona", "Kylian Mbappé"]);
  });
  it("does not count a short alias found only inside another club's longer name", () => {
    expect(names("Real Betis thắng ngược")).toEqual(["Real Betis Balompié"]);
    expect(names("Real thắng Real Betis")).toEqual(["Real Madrid CF", "Real Betis Balompié"]);
  });
  it("does not give a squad player's surname to a different person with that surname", () => {
    const people = [{ id: randomUUID(), kind: "player" as const, name: "Michael Keane", aliases: ["Keane"] }, { id: randomUUID(), kind: "player" as const, name: "Bernardo Silva", aliases: ["Silva"] }];
    const found = (text: string) => resolveEntities(text, people).map((entity) => people.find((item) => item.id === entity.id)?.name);
    expect(found("Roy Keane chỉ trích MU")).toEqual([]);
    expect(found("Thiago Silva giải nghệ")).toEqual([]);
    expect(found("Hậu vệ Keane ghi bàn, Bernardo Silva kiến tạo")).toEqual(["Michael Keane", "Bernardo Silva"]);
    expect(found("Keane nói về Roy Keane")).toEqual(["Michael Keane"]);
    const david = [{ id: randomUUID(), kind: "player" as const, name: "Jonathan David", aliases: ["David"] }];
    expect(resolveEntities("UEFA chọn David Beckham", david)).toEqual([]);
    expect(resolveEntities("Tiền đạo David lập cú đúp", david)).toHaveLength(1);
  });
  it("excludes livestream links and betting tips even when a club is named", () => {
    for (const title of ["Link xem trực tiếp bóng đá Chelsea vs MU", "Soi kèo Chelsea vs MU", "Nhận định bóng đá Chelsea vs MU hôm nay"]) expect(relevantVietnameseFootball(title, null, catalog)).toBe(false);
    expect(relevantVietnameseFootball("Chelsea thắng MU", null, catalog)).toBe(true);
  });
});

describe("Vietnamese feed parsing", () => {
  const item = (link: string, title = "Chelsea thắng đậm", date = "Mon, 19 Oct 2026 07:30:00 +0700") => `<item><title><![CDATA[${title}]]></title>${link}<pubDate>${date}</pubDate><description><![CDATA[Chelsea thắng đậm trong trận đấu tối qua tại Stamford Bridge.]]></description></item>`;
  const feed = (items: string) => `<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel>${items}</channel></rss>`;
  const now = new Date("2026-10-19T01:30:00Z");
  it("uses the article <link> when an atom self-link repeats the element", () => {
    const result = parseVietnameseFeed(feed(item('<link>https://tuoitre.vn/chelsea-thang.htm</link><atom:link href="https://tuoitre.vn/rss/the-thao.rss" rel="self" type="application/rss+xml"/>')), source(), definition, catalog, now, 20);
    expect(result.articles.map((article) => article.sourceUrl)).toEqual(["https://tuoitre.vn/chelsea-thang.htm"]);
  });
  it("counts relevant items dropped by the per-source limit", () => {
    const items = [1, 2, 3].map((n) => item(`<link>https://tuoitre.vn/chelsea-${n}.htm</link>`)).join("");
    const result = parseVietnameseFeed(feed(items), source(), definition, catalog, now, 2);
    expect(result.articles).toHaveLength(2); expect(result.stats).toMatchObject({ examined: 3, relevant: 3, overLimit: 1 });
  });
});

describe("publisher summary permission", () => {
  it("refuses a summary grant with a zero excerpt cap and allows headline-only with zero", () => {
    expect(publisherFeedAllowed(source())).toBe(true);
    expect(publisherFeedAllowed(source({ maxExcerptChars: 0 }))).toBe(false);
    expect(publisherFeedAllowed(source({ maxExcerptChars: 0, permissionScope: "RSS_METADATA" }))).toBe(true);
  });
});

describe("owner grant and club aliases (SQL)", () => {
  let db: PGlite; let database: SyncDatabase;
  beforeAll(async () => {
    db = new PGlite();
    for (const entry of readdirSync("prisma/migrations", { withFileTypes: true }).filter((entry) => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) await db.exec(readFileSync(`prisma/migrations/${entry.name}/migration.sql`, "utf8"));
    database = {
      query: async <T>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows,
      transaction: (work) => db.transaction((tx) => work({ query: async <T>(sql: string, params: unknown[] = []) => (await tx.query<T>(sql, params)).rows })),
    };
  }, 60000);
  beforeEach(async () => { await db.exec('TRUNCATE "AdminAuditLog","User","NewsSource","Club","ExternalIdentity" CASCADE'); await new NewsSyncStore(database).registerSources(); });
  afterAll(async () => { await db.close(); });
  const input = { reviewer: "FotBan", reason: "Owner grant after legal review (test)" };
  const rows = async () => database.query<Record<string, unknown>>('SELECT * FROM "NewsSource" WHERE slug=ANY($1::text[]) ORDER BY slug', [vietnameseSources.map((source) => source.slug)]);

  it("grants only sources with a verified feed, records audits and a non-login operator", async () => {
    const results = await grantVietnameseSources(database, { slugs: "all", ...input });
    const withFeed: string[] = vietnameseSources.filter((source) => source.feedUrl).map((source) => source.slug);
    expect(results.filter((result) => result.status === "granted").map((result) => result.slug).sort()).toEqual([...withFeed].sort());
    expect(results.filter((result) => result.code === "NO_FEED")).toHaveLength(vietnameseSources.length - withFeed.length);
    for (const row of await rows()) expect(publisherFeedAllowed(row as never)).toBe(withFeed.includes(String(row.slug)));
    const [operator] = await database.query<{ id: string; role: string }>('SELECT id,role FROM "User" WHERE "authProvider"=\'operator\'');
    expect(operator.role).toBe("USER");
    expect(await database.query('SELECT id FROM "AuthAccount" WHERE "userId"=$1::uuid', [operator.id])).toHaveLength(0);
    expect(await database.query('SELECT id FROM "AdminAuditLog" WHERE action=\'SOURCE_GRANT\' AND "actorId"=$1::uuid', [operator.id])).toHaveLength(withFeed.length);
    expect((await grantVietnameseSources(database, { slugs: "all", ...input })).filter((result) => result.status === "granted")).toHaveLength(0);
  });
  it("revokes a grant so the source no longer passes the feed gate", async () => {
    await grantVietnameseSources(database, { slugs: ["vnexpress-sport"], ...input });
    expect(await revokeVietnameseSource(database, { slugs: ["vnexpress-sport"], ...input })).toEqual([{ slug: "vnexpress-sport", status: "revoked" }]);
    const [row] = await database.query<Record<string, unknown>>('SELECT * FROM "NewsSource" WHERE slug=\'vnexpress-sport\'');
    expect(publisherFeedAllowed(row as never)).toBe(false);
    expect(await database.query('SELECT id FROM "AdminAuditLog" WHERE action=\'SOURCE_REVOKE\'')).toHaveLength(1);
  });
  it("refuses an invalid reviewer or a too-short reason", async () => {
    await expect(grantVietnameseSources(database, { slugs: "all", reviewer: "", reason: "ok" })).rejects.toBeInstanceOf(NewsGrantError);
  });
  it("appends Vietnamese club aliases by provider ID and keeps operator aliases", async () => {
    const clubId = randomUUID();
    await database.query('INSERT INTO "Club" (id,slug,name,aliases,"updatedAt") VALUES ($1::uuid,\'club-mu\',\'Manchester United FC\',ARRAY[\'Operator alias\'],now())', [clubId]);
    await database.query('INSERT INTO "ExternalIdentity" (id,provider,"entityType","externalId","clubId","updatedAt") VALUES ($1::uuid,\'FOOTBALL_DATA\',\'CLUB\',\'66\',$2::uuid,now())', [randomUUID(), clubId]);
    const store = new NewsSyncStore(database);
    expect(await store.registerClubAliases()).toBe(1);
    expect(await store.registerClubAliases()).toBe(0);
    const [club] = await database.query<{ aliases: string[] }>('SELECT aliases FROM "Club" WHERE id=$1::uuid', [clubId]);
    expect(club.aliases).toEqual(expect.arrayContaining(["Operator alias", ...vietnameseClubAliases["66"]]));
  });
});
