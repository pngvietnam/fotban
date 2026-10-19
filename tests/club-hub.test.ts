import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SyncDatabase } from "../lib/sync-database";
import { clubHref, clubPath, parseClubQuery } from "../lib/club-presentation";
import { feedStoryType, isFunStory } from "../lib/feed-card-policy";
import { clubFixtures, clubIdFromSlug, clubProfile, clubSquad, clubStanding, positionGroup } from "../services/club-hub";

const now = new Date("2026-10-19T03:00:00Z");
describe("club query, links and fun classification", () => {
  it("parses tabs strictly and builds links from the club id", () => {
    expect(parseClubQuery({})).toEqual({ tab: "tong-quan", offset: 0 });
    expect(parseClubQuery({ tab: "vui", bao: "24" })).toEqual({ tab: "vui", offset: 24 });
    for (const bad of [{ tab: "admin" }, { tab: ["a"] }, { bao: "-1" }, { bao: "123456" }]) expect(parseClubQuery(bad)).toBeNull();
    const id = randomUUID();
    expect(clubPath(id)).toBe(`/club/club-${id}`); expect(clubIdFromSlug(`club-${id}`)).toBe(id);
    expect(clubIdFromSlug("club-xyz")).toBeNull(); expect(clubHref("club-a", { tab: "cau-thu" })).toBe("/club/club-a?tab=cau-thu");
  });
  it("classifies publisher-written lighthearted headlines as fun and leaves news alone", () => {
    for (const title of ["Fan MU chế ảnh cà khịa Carrick sau trận hòa", "Khoảnh khắc hài hước của thủ môn Arsenal", "Màn troll bá đạo của Chelsea trên mạng xã hội"]) expect(isFunStory(title)).toBe(true);
    for (const title of ["Arsenal thắng Forest 1-0", "Real thoát thẻ đỏ vì không đủ góc quay", "MU hỏi mua tiền vệ Brighton"]) expect(isFunStory(title)).toBe(false);
    expect(feedStoryType("Fan MU chế ảnh cà khịa Carrick", null)).toBe("FUN");
    expect(feedStoryType("MU hỏi mua tiền vệ Brighton", null)).toBe("TRANSFER");
  });
  it("groups provider positions into Vietnamese lines", () => {
    expect([positionGroup("Goalkeeper"), positionGroup("Centre-Back"), positionGroup("Defence"), positionGroup("Central Midfield"), positionGroup("Offence"), positionGroup("Left Winger"), positionGroup(null)])
      .toEqual(["Thủ môn", "Hậu vệ", "Hậu vệ", "Tiền vệ", "Tiền đạo", "Tiền đạo", "Khác"]);
  });
});

describe("club data (SQL)", () => {
  let db: PGlite; let database: SyncDatabase;
  const ids = { league: randomUUID(), season: randomUUID(), a: randomUUID(), b: randomUUID(), old: randomUUID(), p1: randomUUID(), p2: randomUUID(), p3: randomUUID() };
  beforeAll(async () => {
    db = new PGlite();
    for (const entry of readdirSync("prisma/migrations", { withFileTypes: true }).filter((entry) => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) await db.exec(readFileSync(`prisma/migrations/${entry.name}/migration.sql`, "utf8"));
    database = {
      query: async <T>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows,
      transaction: (work) => db.transaction((tx) => work({ query: async <T>(sql: string, params: unknown[] = []) => (await tx.query<T>(sql, params)).rows })),
    };
  }, 60000);
  beforeEach(async () => {
    await db.exec('TRUNCATE "Standing","Match","PlayerClub","Player","ClubSeason","Season","Club","League" CASCADE');
    await database.query('INSERT INTO "League" (id,slug,name,country,"updatedAt") VALUES ($1::uuid,\'premier-league\',\'Premier League\',\'England\',now())', [ids.league]);
    await database.query('INSERT INTO "Season" (id,"leagueId",name,"startsAt","endsAt","updatedAt") VALUES ($1::uuid,$2::uuid,\'2026/2027\',\'2026-08-01\',\'2027-06-30\',now())', [ids.season, ids.league]);
    for (const [id, name, tla] of [[ids.a, "Arsenal FC", "ARS"], [ids.b, "Chelsea FC", "CHE"], [ids.old, "Relegated FC", "REL"]]) await database.query('INSERT INTO "Club" (id,slug,name,tla,"updatedAt") VALUES ($1::uuid,$2,$3,$4,now())', [id, `club-${id}`, name, tla]);
    for (const id of [ids.a, ids.b]) await database.query('INSERT INTO "ClubSeason" (id,"clubId","seasonId","leagueId","updatedAt") VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,now())', [randomUUID(), id, ids.season, ids.league]);
    await database.query('INSERT INTO "Standing" (id,provider,"leagueId","seasonId","clubId",stage,"tableType",position,"playedGames",points,"fetchedAt","updatedAt") VALUES ($1::uuid,\'FOOTBALL_DATA\',$2::uuid,$3::uuid,$4::uuid,\'REGULAR_SEASON\',\'TOTAL\',2,9,18,$5::timestamptz,now())', [randomUUID(), ids.league, ids.season, ids.a, now]);
    let n = 0;
    const match = (home: string, away: string, kickoff: string, status: string, hs: number | null, as: number | null) => database.query('INSERT INTO "Match" (id,slug,provider,"externalId","leagueId","seasonId","homeClubId","awayClubId","kickoffAt",status,"homeScore","awayScore","updatedAt") VALUES ($1::uuid,$2,\'FOOTBALL_DATA\',$2,$3::uuid,$4::uuid,$5::uuid,$6::uuid,$7::timestamptz,$8,$9,$10,now())', [randomUUID(), `m${++n}`, ids.league, ids.season, home, away, kickoff, status, hs, as]);
    await match(ids.a, ids.b, "2026-10-01T19:00:00Z", "FINISHED", 1, 0);
    await match(ids.b, ids.a, "2026-10-18T19:00:00Z", "FINISHED", 0, 2);
    await match(ids.a, ids.b, "2026-10-21T19:00:00Z", "POSTPONED", null, null);
    await match(ids.b, ids.a, "2026-10-25T19:00:00Z", "SCHEDULED", null, null);
    await match(ids.a, ids.b, "2026-11-01T19:00:00Z", "CANCELLED", null, null);
    const player = (id: string, name: string, position: string) => database.query('INSERT INTO "Player" (id,slug,name,position,"updatedAt") VALUES ($1::uuid,$2,$3,$4,now())', [id, `player-${id}`, name, position]);
    await player(ids.p1, "Zed Keeper", "Goalkeeper"); await player(ids.p2, "Ann Striker", "Offence"); await player(ids.p3, "Left Club", "Midfield");
    for (const [player, ends] of [[ids.p1, null], [ids.p2, null], [ids.p3, "2026-09-01"]]) await database.query('INSERT INTO "PlayerClub" (id,"playerId","clubId","startsAt","endsAt","sourceUrl","updatedAt") VALUES ($1::uuid,$2::uuid,$3::uuid,\'2026-08-01\',$4::timestamptz,\'https://example.test\',now())', [randomUUID(), player, ids.a, ends]);
  });
  afterAll(async () => { await db.close(); });

  it("finds only clubs in a current EPL/La Liga season", async () => {
    expect(await clubProfile(database, `club-${ids.a}`, now)).toMatchObject({ name: "Arsenal FC", league: { slug: "premier-league", name: "Ngoại hạng Anh", seasonName: "2026/2027" } });
    expect(await clubProfile(database, `club-${ids.old}`, now)).toBeNull();
    expect(await clubProfile(database, "club-unknown", now)).toBeNull();
  });
  it("returns the club's table row and keeps the match lists honest", async () => {
    const profile = (await clubProfile(database, `club-${ids.a}`, now))!;
    expect((await clubStanding(database, profile, now))?.row).toMatchObject({ position: 2, points: 18, form: ["W", "W"] });
    const fixtures = await clubFixtures(database, ids.a, now);
    expect(fixtures.recent.map((fixture) => fixture.slug)).toEqual(["m2", "m1"]);
    expect(fixtures.upcoming.map((fixture) => [fixture.slug, fixture.status])).toEqual([["m3", "POSTPONED"], ["m4", "SCHEDULED"]]);
  });
  it("lists only current squad members", async () => {
    expect((await clubSquad(database, ids.a)).map((player) => player.name)).toEqual(["Ann Striker", "Zed Keeper"]);
  });
});
