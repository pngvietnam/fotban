import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SyncDatabase } from "../lib/sync-database";
import type { NormalizedArticle } from "../types/news-provider";
import { followFixtures, summarizeFollows } from "../services/following-feed";
import type { FollowedEntity } from "../services/following";
import { NewsSyncStore, persistNewsArticles } from "../services/news-store";
import { grantVietnameseSources } from "../services/news-grant";
import { publishFeedCards } from "../services/feed-cards";
import { FeedCardQueryService } from "../services/feed-card-query";

const now = new Date("2026-10-19T03:00:00Z");
describe("personal following feed (SQL)", () => {
  let db: PGlite; let database: SyncDatabase; let store: NewsSyncStore;
  const ids = { liga: randomUUID(), epl: randomUUID(), seasonLiga: randomUUID(), seasonEpl: randomUUID(), real: randomUUID(), sevilla: randomUUID(), arsenal: randomUUID(), chelsea: randomUUID() };
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
    for (const [id, slug, name, country] of [[ids.liga, "la-liga", "La Liga", "Spain"], [ids.epl, "premier-league", "Premier League", "England"]]) await database.query('INSERT INTO "League" (id,slug,name,country,"updatedAt") VALUES ($1::uuid,$2,$3,$4,now())', [id, slug, name, country]);
    for (const [id, league] of [[ids.seasonLiga, ids.liga], [ids.seasonEpl, ids.epl]]) await database.query('INSERT INTO "Season" (id,"leagueId",name,"startsAt","endsAt","updatedAt") VALUES ($1::uuid,$2::uuid,\'2026/2027\',\'2026-08-01\',\'2027-06-30\',now())', [id, league]);
    for (const [id, name, alias, league, season] of [[ids.real, "Real Madrid CF", "Real Madrid", ids.liga, ids.seasonLiga], [ids.sevilla, "Sevilla FC", "Sevilla", ids.liga, ids.seasonLiga], [ids.arsenal, "Arsenal FC", "Arsenal", ids.epl, ids.seasonEpl], [ids.chelsea, "Chelsea FC", "Chelsea", ids.epl, ids.seasonEpl]]) {
      await database.query('INSERT INTO "Club" (id,slug,name,aliases,"updatedAt") VALUES ($1::uuid,$2,$3,ARRAY[$4],now())', [id, `club-${id}`, name, alias]);
      await database.query('INSERT INTO "ClubSeason" (id,"clubId","seasonId","leagueId","updatedAt") VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,now())', [randomUUID(), id, season, league]);
    }
    let n = 0;
    const match = (home: string, away: string, league: string, season: string, kickoff: string, status: string, hs: number | null, as: number | null) => database.query('INSERT INTO "Match" (id,slug,provider,"externalId","leagueId","seasonId","homeClubId","awayClubId","kickoffAt",status,"homeScore","awayScore","updatedAt") VALUES ($1::uuid,$2,\'FOOTBALL_DATA\',$2,$3::uuid,$4::uuid,$5::uuid,$6::uuid,$7::timestamptz,$8,$9,$10,now())', [randomUUID(), `m${++n}`, league, season, home, away, kickoff, status, hs, as]);
    await match(ids.real, ids.sevilla, ids.liga, ids.seasonLiga, "2026-10-18T19:00:00Z", "FINISHED", 4, 1);
    await match(ids.arsenal, ids.chelsea, ids.epl, ids.seasonEpl, "2026-10-17T19:00:00Z", "FINISHED", 2, 0);
    await match(ids.real, ids.sevilla, ids.liga, ids.seasonLiga, "2026-10-25T19:00:00Z", "SCHEDULED", null, null);
    await match(ids.arsenal, ids.chelsea, ids.epl, ids.seasonEpl, "2026-10-26T19:00:00Z", "SCHEDULED", null, null);
    await store.registerSources();
    await grantVietnameseSources(database, { slugs: ["vnexpress-sport", "tuoitre-sport"], reviewer: "FotBan", reason: "Owner grant for following tests" });
    const ingest = async (slug: string, title: string, description: string, hour: number) => {
      const s = (await store.sources()).find((item) => item.slug === slug)!;
      const article: NormalizedArticle = { sourceName: s.name, sourceUrl: `https://${s.domain}/${randomUUID()}.htm`, canonicalUrl: null, titleOriginal: title, excerptOriginal: description, language: "vi", publishedAt: new Date(Date.UTC(2026, 9, 18, hour)), collectedAt: now,
        feed: { url: s.feedUrl!, termsUrl: s.permissionReference!, scope: "RSS_SUMMARY", attribution: s.attributionRequirement!, reviewedAt: s.lastTermsReviewAt!, categories: [], evidenceReferences: [] } };
      await database.transaction((tx) => persistNewsArticles(tx, s, [article]));
    };
    await ingest("vnexpress-sport", "Real Madrid thắng đậm Sevilla", "Real Madrid thắng Sevilla 4-1 trên sân nhà.", 22);
    await ingest("vnexpress-sport", "Arsenal chốt hỏi mua tiền vệ", "Arsenal hỏi mua một tiền vệ trong kỳ chuyển nhượng.", 21);
    await ingest("tuoitre-sport", "Chelsea sa thải trợ lý", "Chelsea thay đổi ban huấn luyện.", 20);
    await publishFeedCards(database, now);
  });
  afterAll(async () => { await db.close(); });
  const follow = (type: FollowedEntity["type"], entityId: string, name: string): FollowedEntity => ({ type, entityId, name, following: true });
  const titles = async (filters: Parameters<FeedCardQueryService["list"]>[0]) => (await new FeedCardQueryService(database).list(filters, now)).groups.map((group) => group.lead.title).sort();

  it("splits follows by kind and resolves followed competitions to supported slugs only", async () => {
    const other = randomUUID();
    await database.query('INSERT INTO "League" (id,slug,name,country,"updatedAt") VALUES ($1::uuid,\'serie-a\',\'Serie A\',\'Italy\',now())', [other]);
    const summary = await summarizeFollows(database, [follow("CLUB", ids.real, "Real Madrid"), follow("PLAYER", randomUUID(), "A Player"), follow("COMPETITION", ids.epl, "Premier League"), follow("COMPETITION", other, "Serie A")]);
    expect(summary.clubs).toHaveLength(1); expect(summary.players).toHaveLength(1);
    expect(summary.leagues.map((league) => league.slug)).toEqual(["premier-league"]); expect(summary.leagueSlugs).toEqual(["premier-league"]); expect(summary.entityIds).toHaveLength(2);
  });
  it("lists only the followed clubs' matches, soonest first and newest results first", async () => {
    const fixtures = await followFixtures(database, [ids.real], now);
    expect(fixtures.upcoming.map((fixture) => fixture.slug)).toEqual(["m3"]); expect(fixtures.recent.map((fixture) => fixture.slug)).toEqual(["m1"]);
    expect(await followFixtures(database, [], now)).toEqual({ upcoming: [], recent: [] });
    expect((await followFixtures(database, [ids.real, ids.arsenal], now)).upcoming.map((fixture) => fixture.slug)).toEqual(["m3", "m4"]);
  });
  it("filters the news to followed clubs or leagues and combines them with a story type", async () => {
    expect(await titles({ league: "all", offset: 0, follow: { entityIds: [ids.real], leagueSlugs: [] } })).toEqual(["Real Madrid thắng đậm Sevilla"]);
    expect(await titles({ league: "all", offset: 0, follow: { entityIds: [], leagueSlugs: ["premier-league"] } })).toEqual(["Arsenal chốt hỏi mua tiền vệ", "Chelsea sa thải trợ lý"]);
    expect(await titles({ league: "all", offset: 0, follow: { entityIds: [], leagueSlugs: ["premier-league"] }, storyType: "TRANSFER" })).toEqual(["Arsenal chốt hỏi mua tiền vệ"]);
    expect(await titles({ league: "all", offset: 0, follow: { entityIds: [], leagueSlugs: [] } })).toEqual([]);
    expect(await titles({ league: "all", offset: 0 })).toHaveLength(3);
  });
});
