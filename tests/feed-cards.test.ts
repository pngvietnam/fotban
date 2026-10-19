import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SyncDatabase } from "../lib/sync-database";
import type { NewsSourceConfig, NormalizedArticle } from "../types/news-provider";
import { feedCertainty, feedStoryType, feedTransferStage, headlineClaimsOfficial, holdReasons, isMatchReport, originHint } from "../lib/feed-card-policy";
import { groupFeedCards, sameFeedStory, type GroupableCard } from "../lib/feed-card-grouping";
import { NewsSyncStore, persistNewsArticles } from "../services/news-store";
import { grantVietnameseSources, revokeVietnameseSource } from "../services/news-grant";
import { decideFeedCard, publishFeedCards } from "../services/feed-cards";
import { FeedCardQueryService } from "../services/feed-card-query";

describe("feed card policy", () => {
  it("holds sensitive stories without catching ordinary football words", () => {
    expect(holdReasons("Cựu tiền đạo qua đời ở tuổi 60")).toEqual(["DEATH"]);
    expect(holdReasons("Cầu thủ bị cáo buộc phân biệt chủng tộc")).toEqual(["ACCUSATION", "DISCRIMINATION"]);
    for (const text of ["Sự kiện ra mắt áo đấu mới", "Điều kiện để Ronaldo trở lại", "MU bị bắt bài hoàn toàn"]) expect(holdReasons(text)).toEqual([]);
  });
  it("keeps hedged, interest and question headlines unconfirmed", () => {
    expect(feedCertainty("Arsenal được cho là quan tâm tiền đạo", null)).toBe("UNCONFIRMED");
    expect(feedCertainty("Liverpool có thể mất Salah?", null)).toBe("UNCONFIRMED");
    expect(feedCertainty("Arsenal thắng Forest 1-0", "Madueke ghi bàn duy nhất.")).toBe("REPORTED");
  });
  it("derives a transfer stage from wording but never a confirmed one", () => {
    const stage = (title: string) => feedTransferStage(feedStoryType(title, null), title, null);
    expect(stage("MU hỏi mua tiền vệ của Brighton")).toBe("NEGOTIATION");
    expect(stage("Chelsea để mắt tới thủ thành trẻ, chuyển nhượng mùa đông")).toBe("INTEREST");
    expect(stage("CHÍNH THỨC: MU hoàn tất chiêu mộ tân binh")).toBe("RUMOR");
    expect(headlineClaimsOfficial("CHÍNH THỨC: MU hoàn tất chiêu mộ tân binh")).toBe(true);
    expect(stage("Arsenal thắng Forest 1-0")).toBeNull();
  });
  it("classifies Vietnamese headlines by type", () => {
    const type = (title: string) => feedStoryType(title, null);
    expect(type("Barcelona nhận cú đúp tin dữ trước đại chiến PSG")).toBe("INJURY");
    expect(type("Real thoát thẻ đỏ vì không đủ góc quay ở La Liga")).toBe("DISCIPLINE");
    expect(type("Carrick: 'Man Utd như được khởi đầu lại'")).toBe("INTERVIEW");
    expect(type("Neville cảnh báo HLV Carrick nguy cơ mất ghế")).toBe("MANAGER");
    expect(type("Mbappe giúp Real thắng đậm Sevilla")).toBe("MATCH");
    expect(type("Quả bóng Vàng 2026 lên tiếng về Yamal")).toBe("OFF_FIELD");
  });
  it("names the international origin a Vietnamese report cites", () => {
    expect(originHint("MU nhắm tiền đạo", "Theo The Athletic, MU đã liên hệ.")).toBe("The Athletic");
    expect(originHint("Here we go: Fabrizio Romano xác nhận", null)).toBe("Fabrizio Romano");
    expect(originHint("Arsenal thắng Forest", null)).toBeNull();
  });
  it("recognizes plain result reports but not interviews, controversy or roundups", () => {
    for (const title of ["Mbappe giúp Real thắng đậm Sevilla", "Arsenal thắng Nottingham Forest 1-0: Madueke ghi bàn may mắn", "Leeds United hòa Man Utd 1-1: 'Quỷ đỏ' 5 trận liên tiếp không thắng"]) expect(isMatchReport(title)).toBe(true);
    for (const title of ["Thua Real Madrid, HLV Sevilla gây bão với nghi vấn", "Mikel Arteta: 'Arsenal đã thua liền 2 mùa trước'", "Kết quả Ngoại hạng Anh hôm nay 18/10: MU bị Leeds cầm hòa", "Real thoát thẻ đỏ vì không đủ góc quay"]) expect(isMatchReport(title)).toBe(false);
  });
});

describe("feed card grouping", () => {
  const real = randomUUID(); const sevilla = randomUUID(); const match = randomUUID();
  const card = (title: string, sourceId: string, hour: number, extra: Partial<GroupableCard> = {}): GroupableCard => ({ articleId: randomUUID(), sourceId, publishedAt: new Date(Date.UTC(2026, 9, 18, hour)), title, entityIds: [real, sevilla], matchId: match, transferStage: null, ...extra });
  it("merges plain reports of one match across publishers and keeps other angles apart", () => {
    const reports = [card("Mbappe giúp Real thắng đậm Sevilla", "vnexpress", 22), card("Mbappe lập cú đúp, Real Madrid đại thắng trước thềm El Clasico", "thethao247", 22), card("Real Madrid thắng đậm với cú đúp của Mbappe, dù vắng Vinicius", "tuoitre", 23)];
    const angles = [card("Thua Real Madrid, HLV Sevilla gây bão với nghi vấn", "thethao247", 23), card("Real thoát thẻ đỏ vì không đủ góc quay ở La Liga", "vnexpress", 23)];
    const keys = groupFeedCards([...reports, ...angles]);
    expect(new Set(reports.map((item) => keys.get(item.articleId))).size).toBe(1);
    expect(new Set([...reports, ...angles].map((item) => keys.get(item.articleId))).size).toBe(3);
  });
  it("never merges a publisher with itself, different transfer stages or distant times", () => {
    expect(sameFeedStory(card("Real thắng Sevilla", "vnexpress", 22), card("Real thắng Sevilla", "vnexpress", 23))).toBe(false);
    expect(sameFeedStory(card("Real thắng Sevilla", "a", 1), card("Real thắng Sevilla", "b", 1, { publishedAt: new Date(Date.UTC(2026, 9, 21)) }))).toBe(false);
    expect(sameFeedStory(card("MU hỏi mua tiền vệ", "a", 1, { transferStage: "NEGOTIATION" }), card("MU hỏi mua tiền vệ", "b", 2, { transferStage: "INTEREST" }))).toBe(false);
  });
  it("is complete-linkage: A~B and B~C do not merge A with C", () => {
    const a = card("Haaland lập hat-trick, Man City thắng", "a", 1, { matchId: null, entityIds: [real] });
    const b = card("Haaland lập hat-trick, Man City thắng lớn", "b", 2, { matchId: null, entityIds: [real] });
    const c = card("Man City thắng lớn, Guardiola hài lòng", "c", 3, { matchId: null, entityIds: [real] });
    const keys = groupFeedCards([a, b, c]);
    expect(keys.get(a.articleId)).toBe(keys.get(b.articleId)); expect(keys.get(c.articleId)).not.toBe(keys.get(a.articleId));
  });
});

describe("feed card publication and public reads (SQL)", () => {
  let db: PGlite; let database: SyncDatabase; let store: NewsSyncStore;
  const now = new Date("2026-10-19T03:00:00Z");
  const ids = { league: randomUUID(), season: randomUUID(), real: randomUUID(), sevilla: randomUUID(), match: randomUUID() };
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
    await database.query('INSERT INTO "League" (id,slug,name,country,"updatedAt") VALUES ($1::uuid,\'la-liga\',\'La Liga\',\'Spain\',now())', [ids.league]);
    await database.query('INSERT INTO "Season" (id,"leagueId",name,"startsAt","endsAt","updatedAt") VALUES ($1::uuid,$2::uuid,\'2026/2027\',\'2026-08-01\',\'2027-06-30\',now())', [ids.season, ids.league]);
    for (const [id, name, alias] of [[ids.real, "Real Madrid CF", "Real Madrid"], [ids.sevilla, "Sevilla FC", "Sevilla"]]) {
      await database.query('INSERT INTO "Club" (id,slug,name,aliases,"updatedAt") VALUES ($1::uuid,$2,$3,ARRAY[$4],now())', [id, `club-${id}`, name, alias]);
      await database.query('INSERT INTO "ClubSeason" (id,"clubId","seasonId","leagueId","updatedAt") VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,now())', [randomUUID(), id, ids.season, ids.league]);
    }
    await database.query('INSERT INTO "Match" (id,slug,provider,"externalId","leagueId","seasonId","homeClubId","awayClubId","kickoffAt",status,"homeScore","awayScore","updatedAt") VALUES ($1::uuid,\'match-test\',\'FOOTBALL_DATA\',\'1\',$2::uuid,$3::uuid,$4::uuid,$5::uuid,\'2026-10-18T19:00:00Z\',\'FINISHED\',4,1,now())', [ids.match, ids.league, ids.season, ids.real, ids.sevilla]);
    await store.registerSources();
    await grantVietnameseSources(database, { slugs: ["vnexpress-sport", "tuoitre-sport"], reviewer: "FotBan", reason: "Owner grant for feed card tests" });
  });
  afterAll(async () => { await db.close(); });
  const source = async (slug: string) => (await store.sources()).find((item) => item.slug === slug)!;
  async function ingest(slug: string, title: string, description: string, hour = 22, path = randomUUID()) {
    const s: NewsSourceConfig = await source(slug);
    const article: NormalizedArticle = { sourceName: s.name, sourceUrl: `https://${s.domain}/${path}.htm`, canonicalUrl: null, titleOriginal: title, excerptOriginal: description, language: "vi", publishedAt: new Date(Date.UTC(2026, 9, 18, hour)), collectedAt: now,
      feed: { url: s.feedUrl!, termsUrl: s.permissionReference!, scope: "RSS_SUMMARY", attribution: s.attributionRequirement!, reviewedAt: s.lastTermsReviewAt!, categories: [], evidenceReferences: [] } };
    await database.transaction((tx) => persistNewsArticles(tx, s, [article]));
    return (await database.query<{ id: string }>('SELECT id FROM "Article" WHERE "sourceUrl"=$1', [article.sourceUrl]))[0].id;
  }
  const feed = () => new FeedCardQueryService(database);

  it("publishes attributed cards, links entities/match and groups duplicate reports", async () => {
    const vne = await ingest("vnexpress-sport", "Mbappe giúp Real thắng đậm Sevilla", "Real Madrid thắng Sevilla 4-1 trên sân nhà.");
    const tt = await ingest("tuoitre-sport", "Real Madrid thắng đậm Sevilla với cú đúp của Mbappe", "Real Madrid thắng Sevilla 4-1.", 23);
    expect(await publishFeedCards(database, now)).toMatchObject({ examined: 2, published: 2, held: 0, groups: 1 });
    const list = await feed().list({ league: "all", offset: 0 }, now);
    expect(list.groups).toHaveLength(1);
    expect(list.groups[0].lead).toMatchObject({ articleId: vne, publisher: "VnExpress Sport", attribution: "Theo VnExpress", label: "MEDIA", certainty: "REPORTED", leagueSlugs: ["la-liga"], match: { slug: "match-test" } });
    expect(list.groups[0].others.map((card) => card.articleId)).toEqual([tt]);
    expect((await feed().list({ league: "premier-league", offset: 0 }, now)).groups).toHaveLength(0);
    expect((await feed().detail(tt, now))?.others.map((card) => card.articleId)).toEqual([vne]);
    expect(await publishFeedCards(database, now)).toMatchObject({ published: 2, groups: 1 });
  });
  it("holds sensitive cards until an audited operator approval, which later runs keep", async () => {
    const id = await ingest("vnexpress-sport", "Cựu cầu thủ Real qua đời", "Cựu cầu thủ của Real Madrid qua đời ở tuổi 70.");
    expect(await publishFeedCards(database, now)).toMatchObject({ held: 1 });
    expect(await feed().detail(id, now)).toBeNull();
    await decideFeedCard(database, { articleId: id, decision: "PUBLISHED", reviewer: "FotBan", reason: "Đã kiểm tra, đưa tin trung lập" });
    expect(await publishFeedCards(database, now)).toMatchObject({ kept: 1, held: 0 });
    expect((await feed().detail(id, now))?.card.title).toBe("Cựu cầu thủ Real qua đời");
    expect(await database.query('SELECT id FROM "AdminAuditLog" WHERE action=\'FEED_CARD_APPROVE\'')).toHaveLength(1);
  });
  it("withdraws cards immediately on hide, article hiding or grant revocation", async () => {
    const id = await ingest("vnexpress-sport", "Mbappe giúp Real thắng đậm Sevilla", "Real Madrid thắng Sevilla 4-1.");
    await publishFeedCards(database, now);
    await decideFeedCard(database, { articleId: id, decision: "HIDDEN", reviewer: "FotBan", reason: "Yêu cầu gỡ từ phía báo" });
    expect(await feed().detail(id, now)).toBeNull();
    await decideFeedCard(database, { articleId: id, decision: "PUBLISHED", reviewer: "FotBan", reason: "Khôi phục sau khi kiểm tra" });
    await database.query('UPDATE "Article" SET "publicationStatus"=\'HIDDEN\' WHERE id=$1::uuid', [id]);
    expect(await feed().detail(id, now)).toBeNull();
    await database.query('UPDATE "Article" SET "publicationStatus"=\'DRAFT\' WHERE id=$1::uuid', [id]);
    expect(await feed().detail(id, now)).not.toBeNull();
    await revokeVietnameseSource(database, { slugs: ["vnexpress-sport"], reviewer: "FotBan", reason: "Báo rút quyền sử dụng" });
    expect(await feed().detail(id, now)).toBeNull();
    expect((await feed().list({ league: "all", offset: 0 }, now)).groups).toHaveLength(0);
  });
  it("refuses impossible card values at the database", async () => {
    const id = await ingest("vnexpress-sport", "Real thắng Sevilla", "Real Madrid thắng Sevilla 4-1.");
    await expect(database.query('INSERT INTO "FeedCard" ("articleId",status,"storyType",label,certainty,"transferStage","updatedAt") VALUES ($1::uuid,\'PUBLISHED\',\'TRANSFER\',\'MEDIA\',\'REPORTED\',\'CONFIRMED\',now())', [id])).rejects.toThrow();
    await expect(database.query('INSERT INTO "FeedCard" ("articleId",status,"storyType",label,certainty,"updatedAt") VALUES ($1::uuid,\'PUBLISHED\',\'MATCH\',\'OFFICIAL\',\'REPORTED\',now())', [id])).rejects.toThrow();
  });
});
