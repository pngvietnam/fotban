import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SyncDatabase } from "../lib/sync-database";
import type { NormalizedArticle } from "../types/news-provider";
import { matchLeagues } from "../lib/match-leagues";
import { competitionConfig } from "../providers/football-data/config";
import { relevantVietnameseFootball } from "../providers/news/vietnamese-provider";
import { parseNewsFilters } from "../lib/news-presentation";
import { leagueLinks } from "../lib/league-presentation";
import { isLeagueSlug, leagueStandings } from "../services/league-hub";
import { clubProfile } from "../services/club-hub";
import { playerProfile } from "../services/player-hub";
import { NewsSyncStore, persistNewsArticles } from "../services/news-store";
import { grantVietnameseSources } from "../services/news-grant";
import { publishFeedCards } from "../services/feed-cards";
import { FeedCardQueryService } from "../services/feed-card-query";
import { vietnameseCatalogFrom } from "../services/vietnamese-catalog";

const now = new Date("2026-10-19T03:00:00Z");
describe("the Champions League as a supported competition", () => {
  it("is configured everywhere a competition list is used", () => {
    expect(Object.keys(matchLeagues)).toEqual(["premier-league", "la-liga", "champions-league"]);
    expect(competitionConfig["champions-league"].code).toBe("CL"); expect(isLeagueSlug("champions-league")).toBe(true); expect(isLeagueSlug("serie-a")).toBe(false);
    expect(leagueLinks.map((link) => link.slug)).toContain("champions-league");
    expect(parseNewsFilters({ league: "champions-league" })).toEqual({ league: "champions-league", offset: 0 }); expect(parseNewsFilters({ league: "serie-a" })).toBeNull();
  });
  it("recognises Champions League news by its Vietnamese names even without a known club", () => {
    for (const title of ["Champions League: lịch thi đấu vòng 3", "Bốc thăm Cúp C1 châu Âu", "C1 châu Âu: đại chiến đêm nay"]) expect(relevantVietnameseFootball(title, null, [])).toBe(true);
    expect(relevantVietnameseFootball("V-League vòng 4", null, [])).toBe(false);
  });
});

describe("Champions League data (SQL)", () => {
  let db: PGlite; let database: SyncDatabase; let store: NewsSyncStore;
  const ids = { epl: randomUUID(), cl: randomUUID(), seasonEpl: randomUUID(), seasonCl: randomUUID(), arsenal: randomUUID(), bayern: randomUUID(), pArsenal: randomUUID(), pBayern: randomUUID() };
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
    await db.exec('TRUNCATE "FeedCard","ArticleFeedSnapshot","ArticleEntity","ArticleUrl","Article","AdminAuditLog","User","NewsSource","Standing","Match","PlayerClub","Player","ClubSeason","Season","Club","League" CASCADE');
    for (const [id, slug, name, country] of [[ids.epl, "premier-league", "Premier League", "England"], [ids.cl, "champions-league", "UEFA Champions League", "Europe"]]) await database.query('INSERT INTO "League" (id,slug,name,country,"updatedAt") VALUES ($1::uuid,$2,$3,$4,now())', [id, slug, name, country]);
    for (const [id, league] of [[ids.seasonEpl, ids.epl], [ids.seasonCl, ids.cl]]) await database.query('INSERT INTO "Season" (id,"leagueId",name,"startsAt","endsAt","updatedAt") VALUES ($1::uuid,$2::uuid,\'2026/2027\',\'2026-08-01\',\'2027-06-30\',now())', [id, league]);
    for (const [id, name, alias] of [[ids.arsenal, "Arsenal FC", "Arsenal"], [ids.bayern, "FC Bayern München", "Bayern"]]) await database.query('INSERT INTO "Club" (id,slug,name,aliases,"updatedAt") VALUES ($1::uuid,$2,$3,ARRAY[$4],now())', [id, `club-${id}`, name, alias]);
    for (const [club, season, league] of [[ids.arsenal, ids.seasonEpl, ids.epl], [ids.arsenal, ids.seasonCl, ids.cl], [ids.bayern, ids.seasonCl, ids.cl]]) await database.query('INSERT INTO "ClubSeason" (id,"clubId","seasonId","leagueId","updatedAt") VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,now())', [randomUUID(), club, season, league]);
    for (const [id, name, club] of [[ids.pArsenal, "Bukayo Saka", ids.arsenal], [ids.pBayern, "Harry Kane", ids.bayern]]) {
      await database.query('INSERT INTO "Player" (id,slug,name,"updatedAt") VALUES ($1::uuid,$2,$3,now())', [id, `player-${id}`, name]);
      await database.query('INSERT INTO "PlayerClub" (id,"playerId","clubId","startsAt","sourceUrl","updatedAt") VALUES ($1::uuid,$2::uuid,$3::uuid,\'2026-08-01\',\'https://example.test\',now())', [randomUUID(), id, club]);
    }
    await store.registerSources();
    await grantVietnameseSources(database, { slugs: ["vnexpress-sport"], reviewer: "FotBan", reason: "Owner grant for competition tests" });
  });
  afterAll(async () => { await db.close(); });

  it("shows a domestic club under its domestic league and a Champions League-only club under the Champions League", async () => {
    expect(await clubProfile(database, `club-${ids.arsenal}`, now)).toMatchObject({ league: { slug: "premier-league" } });
    expect(await clubProfile(database, `club-${ids.bayern}`, now)).toMatchObject({ name: "FC Bayern München", league: { slug: "champions-league", name: "Champions League" } });
    expect(await playerProfile(database, `player-${ids.pArsenal}`, now)).toMatchObject({ club: { leagueName: "Ngoại hạng Anh" } });
    expect(await playerProfile(database, `player-${ids.pBayern}`, now)).toMatchObject({ club: { leagueName: "Champions League" } });
  });
  it("reads a Champions League table and includes its clubs and players in the news catalogue", async () => {
    await database.query('INSERT INTO "Standing" (id,provider,"leagueId","seasonId","clubId",stage,"tableType",position,"playedGames",points,"fetchedAt","updatedAt") VALUES ($1::uuid,\'FOOTBALL_DATA\',$2::uuid,$3::uuid,$4::uuid,\'LEAGUE_STAGE\',\'TOTAL\',1,3,9,$5::timestamptz,now())', [randomUUID(), ids.cl, ids.seasonCl, ids.bayern, now]);
    expect((await leagueStandings(database, "champions-league", now)).rows.map((row) => [row.position, row.name])).toEqual([[1, "FC Bayern München"]]);
    const names = (await vietnameseCatalogFrom(database)).map((entity) => entity.name);
    expect(names).toEqual(expect.arrayContaining(["UEFA Champions League", "FC Bayern München", "Harry Kane", "Arsenal FC"]));
  });
  it("registers Vietnamese competition aliases without duplicating them", async () => {
    const [league] = await database.query<{ aliases: string[] }>('SELECT aliases FROM "League" WHERE slug=\'champions-league\'');
    expect(league.aliases).toEqual(expect.arrayContaining(["Cúp C1", "Champions League"]));
    await store.registerSources();
    expect((await database.query<{ aliases: string[] }>('SELECT aliases FROM "League" WHERE slug=\'champions-league\''))[0].aliases).toHaveLength(league.aliases.length);
  });
  it("counts the Champions League for a story only when the club has no domestic league", async () => {
    const source = (await store.sources()).find((item) => item.slug === "vnexpress-sport")!;
    const ingest = async (title: string, description: string) => {
      const article: NormalizedArticle = { sourceName: source.name, sourceUrl: `https://${source.domain}/${randomUUID()}.html`, canonicalUrl: null, titleOriginal: title, excerptOriginal: description, language: "vi", publishedAt: new Date("2026-10-18T22:00:00Z"), collectedAt: now,
        feed: { url: source.feedUrl!, termsUrl: source.permissionReference!, scope: "RSS_SUMMARY", attribution: source.attributionRequirement!, reviewedAt: source.lastTermsReviewAt!, categories: [], evidenceReferences: [] } };
      await database.transaction((tx) => persistNewsArticles(tx, source, [article]));
    };
    await ingest("Arsenal thắng đậm ở trận đấu mới", "Arsenal thắng đậm trong trận tối qua tại sân nhà.");
    await ingest("Bayern thắng đậm ở Đức", "Bayern thắng đậm trong trận tối qua tại sân nhà.");
    await publishFeedCards(database, now);
    const slugs = Object.fromEntries((await new FeedCardQueryService(database).list({ league: "all", offset: 0 }, now)).groups.map((group) => [group.lead.title.split(" ")[0], group.lead.leagueSlugs]));
    expect(slugs).toEqual({ Arsenal: ["premier-league"], Bayern: ["champions-league"] });
    expect((await new FeedCardQueryService(database).list({ league: "champions-league", offset: 0 }, now)).groups.map((group) => group.lead.title.split(" ")[0])).toEqual(["Bayern"]);
  });
});
