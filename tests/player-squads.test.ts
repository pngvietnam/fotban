import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { normalizeTeam } from "../providers/football-data/normalization";
import { persistMatchPayload, playerAliases, type SyncDatabase } from "../services/match-store";
import type { CompetitionRef, SeasonRef, TeamRef } from "../types/match-provider";
import { teamFixture } from "./fixtures/football-data";

const competition: CompetitionRef = { key: "premier-league", externalId: "2021", name: "Premier League", country: "England" };
const season: SeasonRef = { externalId: "900001", name: "2026/2027", startsAt: "2026-08-01T00:00:00.000Z", endsAt: "2027-05-31T00:00:00.000Z" };
const player = (id: number, name: string) => ({ id, name, position: "Offence", nationality: "Norway", dateOfBirth: "2000-07-21" });

describe("squad normalization", () => {
  it("keeps valid squad players, drops malformed entries and treats a missing squad as not supplied", () => {
    const team = normalizeTeam({ ...teamFixture(), squad: [player(44, "Erling Haaland"), { id: "bad" }, { id: 45 }] });
    expect(team.squad).toEqual([{ externalId: "44", name: "Erling Haaland", position: "Offence", nationality: "Norway", birthDate: "2000-07-21" }]);
    expect(normalizeTeam(teamFixture()).squad).toBeUndefined();
    expect(normalizeTeam({ ...teamFixture(), squad: [] }).squad).toBeUndefined();
  });
  it("derives surname aliases but not mononyms, short names or Vietnamese words", () => {
    expect(playerAliases("Erling Haaland")).toEqual(["Haaland"]);
    expect(playerAliases("Rodri")).toEqual([]);
    expect(playerAliases("Heung-min Son")).toEqual([]);
    expect(playerAliases("Nguyen Van Trong")).toEqual([]);
  });
});

describe("squad persistence", () => {
  let db: PGlite; let database: SyncDatabase;
  beforeAll(async () => {
    db = new PGlite();
    for (const entry of readdirSync("prisma/migrations", { withFileTypes: true }).filter((entry) => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) await db.exec(readFileSync(`prisma/migrations/${entry.name}/migration.sql`, "utf8"));
    database = {
      query: async <T>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows,
      transaction: (work) => db.transaction((tx) => work({ query: async <T>(sql: string, params: unknown[] = []) => (await tx.query<T>(sql, params)).rows })),
    };
  }, 60000);
  beforeEach(async () => { await db.exec('TRUNCATE "League","Club","Player","ExternalIdentity" CASCADE'); });
  afterAll(async () => { await db.close(); });
  const sync = (teams: TeamRef[], at: string) => database.transaction((tx) => persistMatchPayload(tx, "FOOTBALL_DATA", { mode: "teams", competition, season, teams }, new Date(at)));
  const team = (id: number, name: string, squad?: ReturnType<typeof player>[]) => normalizeTeam({ ...teamFixture(id, name), ...(squad ? { squad } : {}) });
  const memberships = () => database.query<{ name: string; club: string; endsAt: Date | null }>('SELECT p.name,c.name AS club,pc."endsAt" FROM "PlayerClub" pc JOIN "Player" p ON p.id=pc."playerId" JOIN "Club" c ON c.id=pc."clubId" ORDER BY p.name,pc."startsAt"');

  it("creates players, provider identities, aliases and observed memberships idempotently", async () => {
    await sync([team(65, "Alpha", [player(44, "Erling Haaland"), player(45, "Rodri")])], "2026-10-19T00:00:00Z");
    await sync([team(65, "Alpha", [player(44, "Erling Haaland"), player(45, "Rodri")])], "2026-10-20T00:00:00Z");
    expect(await database.query('SELECT id FROM "Player"')).toHaveLength(2);
    expect(await database.query('SELECT id FROM "ExternalIdentity" WHERE "entityType"=\'PLAYER\'')).toHaveLength(2);
    expect((await memberships()).map((row) => [row.name, row.endsAt])).toEqual([["Erling Haaland", null], ["Rodri", null]]);
    const [haaland] = await database.query<{ aliases: string[] }>('SELECT aliases FROM "Player" WHERE name=\'Erling Haaland\'');
    expect(haaland.aliases).toEqual(["Haaland"]);
  });
  it("closes memberships when a player leaves or moves, but never on a missing squad", async () => {
    await sync([team(65, "Alpha", [player(44, "Erling Haaland"), player(45, "Rodri")]), team(66, "Beta", [player(46, "Bruno Fernandes")])], "2026-10-19T00:00:00Z");
    await sync([team(65, "Alpha"), team(66, "Beta")], "2026-10-20T00:00:00Z");
    expect((await memberships()).every((row) => row.endsAt === null)).toBe(true);
    await sync([team(65, "Alpha", [player(44, "Erling Haaland")]), team(66, "Beta", [player(46, "Bruno Fernandes"), player(45, "Rodri")])], "2026-10-21T00:00:00Z");
    const rows = await memberships();
    expect(rows.filter((row) => row.endsAt === null).map((row) => `${row.name}@${row.club}`).sort()).toEqual(["Bruno Fernandes@Beta", "Erling Haaland@Alpha", "Rodri@Beta"]);
    expect(rows.find((row) => row.name === "Rodri" && row.club === "Alpha")?.endsAt?.toISOString()).toBe("2026-10-21T00:00:00.000Z");
  });
});
