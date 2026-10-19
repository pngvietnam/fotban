import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SyncDatabase } from "../lib/sync-database";
import { ageOn, parsePlayerQuery, playerHref, playerPath } from "../lib/player-presentation";
import { playerIdFromSlug, playerProfile } from "../services/player-hub";

const now = new Date("2026-10-19T03:00:00Z");
describe("player query, links and age", () => {
  it("parses tabs strictly and builds links from the player id", () => {
    expect(parsePlayerQuery({})).toEqual({ tab: "tong-quan", offset: 0 });
    expect(parsePlayerQuery({ tab: "chuyen-nhuong", bao: "24" })).toEqual({ tab: "chuyen-nhuong", offset: 24 });
    for (const bad of [{ tab: "vui" }, { tab: ["a"] }, { bao: "x" }, { bao: "12345" }]) expect(parsePlayerQuery(bad)).toBeNull();
    const id = randomUUID();
    expect(playerPath(id)).toBe(`/player/player-${id}`); expect(playerIdFromSlug(`player-${id}`)).toBe(id);
    expect(playerIdFromSlug("player-x")).toBeNull(); expect(playerHref("player-a", { tab: "tin-tuc" })).toBe("/player/player-a?tab=tin-tuc");
  });
  it("computes completed years and rejects missing, future or absurd birth dates", () => {
    expect(ageOn("2000-10-19", now)).toBe(26); expect(ageOn("2000-10-20", now)).toBe(25); expect(ageOn("2008-02-29", now)).toBe(18);
    for (const bad of [null, "not-a-date", "2030-01-01", "1900-01-01"]) expect(ageOn(bad, now)).toBeNull();
  });
});

describe("player profile (SQL)", () => {
  let db: PGlite; let database: SyncDatabase;
  const ids = { league: randomUUID(), other: randomUUID(), season: randomUUID(), seasonOther: randomUUID(), a: randomUUID(), b: randomUUID(), p1: randomUUID(), p2: randomUUID(), p3: randomUUID(), p4: randomUUID() };
  beforeAll(async () => {
    db = new PGlite();
    for (const entry of readdirSync("prisma/migrations", { withFileTypes: true }).filter((entry) => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) await db.exec(readFileSync(`prisma/migrations/${entry.name}/migration.sql`, "utf8"));
    database = {
      query: async <T>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows,
      transaction: (work) => db.transaction((tx) => work({ query: async <T>(sql: string, params: unknown[] = []) => (await tx.query<T>(sql, params)).rows })),
    };
  }, 60000);
  beforeEach(async () => {
    await db.exec('TRUNCATE "PlayerClub","Player","ClubSeason","Season","Club","League" CASCADE');
    await database.query('INSERT INTO "League" (id,slug,name,country,"updatedAt") VALUES ($1::uuid,\'premier-league\',\'Premier League\',\'England\',now()),($2::uuid,\'serie-a\',\'Serie A\',\'Italy\',now())', [ids.league, ids.other]);
    for (const [season, league] of [[ids.season, ids.league], [ids.seasonOther, ids.other]]) await database.query('INSERT INTO "Season" (id,"leagueId",name,"startsAt","endsAt","updatedAt") VALUES ($1::uuid,$2::uuid,\'2026/2027\',\'2026-08-01\',\'2027-06-30\',now())', [season, league]);
    for (const [id, name, season, league] of [[ids.a, "Arsenal FC", ids.season, ids.league], [ids.b, "Juventus FC", ids.seasonOther, ids.other]]) {
      await database.query('INSERT INTO "Club" (id,slug,name,tla,"updatedAt") VALUES ($1::uuid,$2,$3,\'TLA\',now())', [id, `club-${id}`, name]);
      await database.query('INSERT INTO "ClubSeason" (id,"clubId","seasonId","leagueId","updatedAt") VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,now())', [randomUUID(), id, season, league]);
    }
    const player = (id: string, name: string, birth: string | null) => database.query('INSERT INTO "Player" (id,slug,name,position,nationality,"birthDate","updatedAt") VALUES ($1::uuid,$2,$3,\'Offence\',\'Norway\',$4::date,now())', [id, `player-${id}`, name, birth]);
    await player(ids.p1, "Current Striker", "2000-07-21"); await player(ids.p2, "Departed Winger", null); await player(ids.p3, "Serie A Forward", null); await player(ids.p4, "Free Agent", null);
    for (const [player, club, ends] of [[ids.p1, ids.a, null], [ids.p2, ids.a, "2026-09-01"], [ids.p3, ids.b, null]]) await database.query('INSERT INTO "PlayerClub" (id,"playerId","clubId","startsAt","endsAt","sourceUrl","updatedAt") VALUES ($1::uuid,$2::uuid,$3::uuid,\'2026-08-01\',$4::timestamptz,\'https://example.test\',now())', [randomUUID(), player, club, ends]);
  });
  afterAll(async () => { await db.close(); });

  it("shows a player in a current EPL/La Liga squad with club, league and birth date", async () => {
    expect(await playerProfile(database, `player-${ids.p1}`, now)).toMatchObject({ name: "Current Striker", nationality: "Norway", birthDate: "2000-07-21", club: { name: "Arsenal FC", leagueName: "Ngoại hạng Anh" } });
  });
  it("hides players who left, play in other leagues, have no club or do not exist", async () => {
    for (const id of [ids.p2, ids.p3, ids.p4]) expect(await playerProfile(database, `player-${id}`, now)).toBeNull();
    expect(await playerProfile(database, "player-unknown", now)).toBeNull();
  });
});
