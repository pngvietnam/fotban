import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { FootballDataMatchProvider } from "../providers/football-data/provider";
import { normalizeMatch } from "../providers/football-data/normalization";
import { MatchSyncStore, persistMatchPayload, type SqlExecutor, type SyncDatabase } from "../services/match-store";
import { syncMatches, type SyncRequest } from "../services/match-sync";
import { competitionFixture, matchFixture, seasonFixture, standingsFixture, teamFixture } from "./fixtures/football-data";

describe("idempotent provider synchronization", () => {
  let db: PGlite;
  let store: MatchSyncStore;
  beforeAll(async () => {
    db = new PGlite();
    for (const entry of readdirSync("prisma/migrations", { withFileTypes: true }).filter((entry) => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
      await db.exec(readFileSync(`prisma/migrations/${entry.name}/migration.sql`, "utf8"));
    }
    const database: SyncDatabase = {
      query: async <T>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows,
      transaction: (work) => db.transaction((tx) => work({ query: async <T>(sql: string, params: unknown[] = []) => (await tx.query<T>(sql, params)).rows })),
    };
    store = new MatchSyncStore(database);
  }, 30000);
  beforeEach(async () => { await db.exec('TRUNCATE "League","JobRun","ProviderStatus","Club","Match","ExternalIdentity" CASCADE'); });
  afterAll(async () => { await db.close(); });
  const request: SyncRequest = { mode: "matches", competition: "premier-league", dateFrom: "2026-10-09", dateTo: "2026-10-20" };
  const provider = (body: unknown, count?: { calls: number }) => new FootballDataMatchProvider("test-only-token", {
    beforeRequest: async () => {}, sleep: async () => {},
    fetch: async () => { if (count) count.calls++; return new Response(JSON.stringify(body)); },
  });
  async function count(table: string) {
    return (await db.query<{ count: number }>(`SELECT count(*)::int AS count FROM "${table}"`)).rows[0].count;
  }
  it("runs the exact adapter + store twice without duplicate clubs, matches, seasons or mappings", async () => {
    const p = provider({ matches: [matchFixture()] });
    await syncMatches(p, store, request);
    const first = (await db.query<{ id: string }>('SELECT id FROM "Match"')).rows[0].id;
    await syncMatches(p, store, { ...request, force: true });
    expect(await count("League")).toBe(1); expect(await count("Season")).toBe(1);
    expect(await count("Club")).toBe(2); expect(await count("Match")).toBe(1);
    expect(await count("ExternalIdentity")).toBe(5); expect(await count("ClubSeason")).toBe(2);
    expect((await db.query<{ id: string }>('SELECT id FROM "Match"')).rows[0].id).toBe(first);
    expect(first).not.toBe("920001");
  });
  it("reuses a fresh DB cache without an API request", async () => {
    const calls = { calls: 0 };
    const p = provider({ matches: [matchFixture()] }, calls);
    await syncMatches(p, store, request);
    expect(await syncMatches(p, store, { dateTo: request.dateTo, dateFrom: request.dateFrom, competition: request.competition, mode: "matches" })).toMatchObject({ cached: true });
    expect(calls.calls).toBe(1);
  });
  it("preserves populated scores and optional team fields after a partial/null update", async () => {
    await syncMatches(provider({ matches: [matchFixture()] }), store, request);
    const incomplete = { ...matchFixture(), score: null, homeTeam: { id: 910001, name: "Fixture Alpha" } };
    await syncMatches(provider({ matches: [incomplete] }), store, { ...request, force: true });
    expect((await db.query('SELECT "homeScore", "awayScore" FROM "Match"')).rows[0]).toMatchObject({ homeScore: 2, awayScore: 1 });
    expect((await db.query('SELECT venue,"externalCrestUrl","logoUrl" FROM "Club" WHERE name=\'Fixture Alpha\'')).rows[0]).toMatchObject({ venue: "Fixture Ground", externalCrestUrl: "https://example.test/fixture.svg", logoUrl: null });
  });
  it("ignores older provider snapshots instead of regressing a final result", async () => {
    await syncMatches(provider({ matches: [matchFixture()] }), store, request);
    await syncMatches(provider({ matches: [{ ...matchFixture(), status: "TIMED", lastUpdated: "2026-10-14T00:00:00Z", score: null }] }), store, { ...request, force: true });
    expect((await db.query('SELECT status,"homeScore" FROM "Match"')).rows[0]).toMatchObject({ status: "FINISHED", homeScore: 2 });
  });
  it("keeps good data intact on HTTP failure and records safe job/provider status", async () => {
    await syncMatches(provider({ matches: [matchFixture()] }), store, request);
    const failed = new FootballDataMatchProvider("test-only-token", { beforeRequest: async () => {}, fetch: async () => new Response("test-only-token", { status: 401 }) });
    await expect(syncMatches(failed, store, { ...request, force: true })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(await count("Match")).toBe(1);
    const status = (await db.query<{ lastFailureAt: Date | null; lastSuccessAt: Date | null; errorSafe: string | null }>('SELECT "lastFailureAt","lastSuccessAt","errorSafe" FROM "ProviderStatus"')).rows[0];
    expect(status.lastFailureAt).not.toBeNull(); expect(status.lastSuccessAt).not.toBeNull();
    expect(JSON.stringify(status)).not.toContain("test-only-token");
  });
  it("records unconfigured provider status without producing match records", async () => {
    await expect(syncMatches(new FootballDataMatchProvider(), store, request)).rejects.toMatchObject({ code: "NOT_CONFIGURED" });
    expect(await count("Match")).toBe(0);
    const status = (await db.query<{ health: string; enabled: boolean }>('SELECT health,enabled FROM "ProviderStatus"')).rows[0];
    expect(status).toMatchObject({ health: "UNCONFIGURED", enabled: false });
  });
  it("counts partial rows and never deletes an existing match missing from a response", async () => {
    await syncMatches(provider({ matches: [matchFixture()] }), store, request);
    expect(await syncMatches(provider({ matches: [{ id: null }] }), store, { ...request, force: true })).toMatchObject({ skipped: 1, recordsProcessed: 0 });
    expect(await count("Match")).toBe(1);
    expect((await db.query<{ health: string }>('SELECT health FROM "ProviderStatus"')).rows[0].health).toBe("WARNING");
  });
  it("synchronizes team metadata and standings idempotently through shared mappings", async () => {
    const teamPayload = { competition: competitionFixture, season: seasonFixture, teams: [teamFixture()] };
    await syncMatches(provider(teamPayload), store, { mode: "teams", competition: "premier-league" });
    const standingProvider = provider(standingsFixture());
    await syncMatches(standingProvider, store, { mode: "standings", competition: "premier-league" });
    await syncMatches(standingProvider, store, { mode: "standings", competition: "premier-league", force: true });
    expect(await count("Standing")).toBe(1); expect(await count("Club")).toBe(1);
  });
  it("synchronizes both configured competition identities without duplication", async () => {
    const p = provider({ competitions: [{ ...competitionFixture, currentSeason: seasonFixture }, { ...competitionFixture, id: 2014, code: "PD", name: "Primera Division", area: { name: "Spain" }, currentSeason: { ...seasonFixture, id: 900002 } }] });
    await syncMatches(p, store, { mode: "competitions" });
    await syncMatches(p, store, { mode: "competitions", force: true });
    expect(await count("League")).toBe(2); expect(await count("Season")).toBe(2);
  });
  it("rolls back all writes if a later relational invariant fails", async () => {
    const match = normalizeMatch(matchFixture());
    const invalid = { ...match, externalId: "920002", homeScore: -1 };
    await expect(store.db.transaction((tx: SqlExecutor) => persistMatchPayload(tx, "FOOTBALL_DATA", { mode: "matches", items: [match, invalid] }, new Date()))).rejects.toMatchObject({ code: "23514" });
    expect(await count("League")).toBe(0); expect(await count("Match")).toBe(0);
  });
  it("enforces DB-backed resource leases", async () => {
    await store.claim("lease-test", 1000, false);
    await expect(store.claim("lease-test", 1000, true)).rejects.toMatchObject({ code: "BUSY" });
  });
  it("reserves rate slots across clients and respects a persisted cooldown", async () => {
    await store.ensureProvider("FOOTBALL_DATA", "test");
    const first = await store.reserveRequest("FOOTBALL_DATA", 7000);
    const second = await store.reserveRequest("FOOTBALL_DATA", 7000);
    expect(first).toBeLessThan(100); expect(second).toBeGreaterThan(6500);
    await store.cooldown("FOOTBALL_DATA", 60000);
    await expect(store.reserveRequest("FOOTBALL_DATA", 7000)).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });
});
