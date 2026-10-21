import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SyncDatabase } from "../lib/sync-database";
import { fixtureWindow, leagueHref, parseLeagueQuery } from "../lib/league-presentation";
import { leagueClubs, leagueFixtures, leagueInfo, leagueStandings, leagueUpcoming } from "../services/league-hub";

const now = new Date("2026-10-19T03:00:00Z");
describe("league query parsing and windows", () => {
  it("accepts known tabs and valid dates and rejects everything else", () => {
    expect(parseLeagueQuery({}, now)).toEqual({ tab: "tong-quan", offset: 0, from: "2026-10-16", round: null });
    expect(parseLeagueQuery({ tab: "lich-thi-dau", tu: "2026-10-20", bao: "24" }, now)).toEqual({ tab: "lich-thi-dau", offset: 24, from: "2026-10-20", round: null });
    expect(parseLeagueQuery({ vong: "3" }, now)?.round).toBe(3);
    for (const vong of ["0", "100", "x", "03"]) expect(parseLeagueQuery({ vong }, now)).toBeNull();
    for (const bad of [{ tab: "admin" }, { tab: ["a", "b"] }, { bao: "-1" }, { bao: "99999" }, { tu: "2026-02-31" }, { tu: "2026-13-01" }, { tu: "2030-01-01" }, { tu: "abc" }]) expect(parseLeagueQuery(bad, now)).toBeNull();
  });
  it("builds a 7-day Vietnam window with bounded neighbours and clean links", () => {
    const window = fixtureWindow("2026-10-13", now);
    expect(window.start.toISOString()).toBe("2026-10-12T17:00:00.000Z"); expect(window.end.toISOString()).toBe("2026-10-19T17:00:00.000Z");
    expect(window).toMatchObject({ last: "2026-10-19", prev: "2026-10-06", next: "2026-10-20" });
    expect(fixtureWindow("2027-02-15", now).next).toBeNull();
    expect(leagueHref("la-liga")).toBe("/league/la-liga"); expect(leagueHref("la-liga", { tab: "tin-tuc" })).toBe("/league/la-liga?tab=tin-tuc"); expect(leagueHref("la-liga", { tab: "bang-xep-hang" })).toBe("/league/la-liga?tab=bang-xep-hang");
    expect(leagueHref("premier-league", { tab: "lich-thi-dau", from: "2026-10-13" })).toBe("/league/premier-league?tab=lich-thi-dau&tu=2026-10-13");
  });
});

describe("league data (SQL)", () => {
  let db: PGlite; let database: SyncDatabase;
  const ids = { league: randomUUID(), other: randomUUID(), season: randomUUID(), a: randomUUID(), b: randomUUID(), c: randomUUID() };
  beforeAll(async () => {
    db = new PGlite();
    for (const entry of readdirSync("prisma/migrations", { withFileTypes: true }).filter((entry) => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) await db.exec(readFileSync(`prisma/migrations/${entry.name}/migration.sql`, "utf8"));
    database = {
      query: async <T>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows,
      transaction: (work) => db.transaction((tx) => work({ query: async <T>(sql: string, params: unknown[] = []) => (await tx.query<T>(sql, params)).rows })),
    };
  }, 60000);
  beforeEach(async () => {
    await db.exec('TRUNCATE "Standing","Match","ClubSeason","Season","Club","League" CASCADE');
    await database.query('INSERT INTO "League" (id,slug,name,country,"updatedAt") VALUES ($1::uuid,\'premier-league\',\'Premier League\',\'England\',now()),($2::uuid,\'la-liga\',\'La Liga\',\'Spain\',now())', [ids.league, ids.other]);
    await database.query('INSERT INTO "Season" (id,"leagueId",name,"startsAt","endsAt","updatedAt") VALUES ($1::uuid,$2::uuid,\'2026/2027\',\'2026-08-01\',\'2027-06-30\',now())', [ids.season, ids.league]);
    for (const [id, name, tla] of [[ids.a, "Arsenal FC", "ARS"], [ids.b, "Chelsea FC", "CHE"], [ids.c, "Everton FC", "EVE"]]) {
      await database.query('INSERT INTO "Club" (id,slug,name,tla,"updatedAt") VALUES ($1::uuid,$2,$3,$4,now())', [id, `club-${id}`, name, tla]);
      await database.query('INSERT INTO "ClubSeason" (id,"clubId","seasonId","leagueId","updatedAt") VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,now())', [randomUUID(), id, ids.season, ids.league]);
    }
    const standing = (club: string, position: number, points: number) => database.query('INSERT INTO "Standing" (id,provider,"leagueId","seasonId","clubId",stage,"tableType",position,"playedGames",won,drawn,lost,"goalsFor","goalsAgainst","goalDifference",points,"fetchedAt","updatedAt") VALUES ($1::uuid,\'FOOTBALL_DATA\',$2::uuid,$3::uuid,$4::uuid,\'REGULAR_SEASON\',\'TOTAL\',$5,3,2,1,0,5,2,3,$6,$7::timestamptz,now())', [randomUUID(), ids.league, ids.season, club, position, points, now]);
    await standing(ids.b, 2, 4); await standing(ids.a, 1, 7); await standing(ids.c, 3, 1);
    let n = 0;
    const match = (home: string, away: string, kickoff: string, status: string, hs: number | null, as: number | null) => database.query('INSERT INTO "Match" (id,slug,provider,"externalId","leagueId","seasonId","homeClubId","awayClubId","kickoffAt",status,"homeScore","awayScore","updatedAt") VALUES ($1::uuid,$2,\'FOOTBALL_DATA\',$2,$3::uuid,$4::uuid,$5::uuid,$6::uuid,$7::timestamptz,$8,$9,$10,now())', [randomUUID(), `m${++n}`, ids.league, ids.season, home, away, kickoff, status, hs, as]);
    await match(ids.a, ids.b, "2026-10-10T19:00:00Z", "FINISHED", 2, 0); // Arsenal W, Chelsea L
    await match(ids.c, ids.a, "2026-10-14T19:00:00Z", "FINISHED", 1, 1); // draw
    await match(ids.b, ids.c, "2026-10-18T19:00:00Z", "FINISHED", 3, 0); // Chelsea W, Everton L
    await match(ids.a, ids.c, "2026-10-20T19:00:00Z", "POSTPONED", null, null);
    await match(ids.b, ids.a, "2026-10-25T19:00:00Z", "SCHEDULED", null, null);
  });
  afterAll(async () => { await db.close(); });

  it("returns the table in order with form from finished matches, oldest first", async () => {
    const table = await leagueStandings(database, "premier-league", now);
    expect(table.rows.map((row) => [row.position, row.name, row.points])).toEqual([[1, "Arsenal FC", 7], [2, "Chelsea FC", 4], [3, "Everton FC", 1]]);
    expect(Object.fromEntries(table.rows.map((row) => [row.tla, row.form.join("")]))).toEqual({ ARS: "WD", CHE: "LW", EVE: "DL" });
    expect(table.fetchedAt).toBe(now.toISOString());
    expect((await leagueStandings(database, "la-liga", now)).rows).toEqual([]);
  });
  it("lists a window of fixtures including postponed ones, and only upcoming matches for the overview", async () => {
    const week = await leagueFixtures(database, "premier-league", new Date("2026-10-18T17:00:00Z"), new Date("2026-10-25T17:00:00Z"));
    expect(week.map((fixture) => [fixture.slug, fixture.status])).toEqual([["m3", "FINISHED"], ["m4", "POSTPONED"]]);
    const upcoming = await leagueUpcoming(database, "premier-league", now);
    expect(upcoming.map((fixture) => fixture.slug)).toEqual(["m5"]);
  });
  it("reports the current season and clubs with positions", async () => {
    expect(await leagueInfo(database, "premier-league", now)).toMatchObject({ name: "Ngoại hạng Anh", country: "Anh", seasonName: "2026/2027" });
    expect(await leagueInfo(database, "la-liga", now)).toMatchObject({ seasonName: null });
    expect((await leagueClubs(database, "premier-league", now)).map((club) => [club.name, club.position])).toEqual([["Arsenal FC", 1], ["Chelsea FC", 2], ["Everton FC", 3]]);
  });
});
