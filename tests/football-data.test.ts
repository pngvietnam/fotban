import { describe, expect, it, vi } from "vitest";
import { FootballDataMatchProvider } from "../providers/football-data/provider";
import { normalizeCompetition, normalizeMatch, normalizeStatus, normalizeTeam, normalizeStandings } from "../providers/football-data/normalization";
import { competitionFixture, matchFixture, seasonFixture, standingsFixture, teamFixture } from "./fixtures/football-data";

const query = { competition: "premier-league", dateFrom: "2026-10-09", dateTo: "2026-10-20" };
const response = (value: unknown) => new Response(JSON.stringify(value), { status: 200 });
const options = { beforeRequest: async () => {}, sleep: async () => {}, random: () => 0 };

describe("football-data normalization", () => {
  it("maps competition, season and team identities without turning external IDs into primary keys", () => {
    const c = normalizeCompetition({ ...competitionFixture, currentSeason: seasonFixture });
    expect(c.competition).toMatchObject({ key: "premier-league", externalId: "2021" });
    expect(c.season).toMatchObject({ externalId: "900001", name: "2026/2027" });
    expect(normalizeTeam(teamFixture())).toMatchObject({ externalId: "910001", shortName: "Fixture Alpha", tla: "FIX", country: "England", venue: "Fixture Ground", externalCrestUrl: "https://example.test/fixture.svg" });
  });
  it.each([
    ["SCHEDULED", "SCHEDULED"], ["TIMED", "SCHEDULED"], ["IN_PLAY", "LIVE"], ["PAUSED", "HALFTIME"],
    ["FINISHED", "FINISHED"], ["AWARDED", "FINISHED"], ["POSTPONED", "POSTPONED"], ["CANCELLED", "CANCELLED"], ["SUSPENDED", "SUSPENDED"],
  ])("maps %s to %s", (provider, internal) => expect(normalizeStatus(provider)).toBe(internal));
  it("rejects an unknown status instead of inventing a result", () => expect(() => normalizeStatus("UNKNOWN")).toThrow());
  it("keeps UTC instants and final regulation scores", () => {
    expect(normalizeMatch(matchFixture())).toMatchObject({ kickoffAt: "2026-10-15T20:00:00.000Z", homeScore: 2, awayScore: 1, status: "FINISHED" });
    expect(normalizeMatch({ ...matchFixture(), utcDate: "2026-10-16T03:00:00+07:00" }).kickoffAt).toBe("2026-10-15T20:00:00.000Z");
  });
  it("separates regulation, ET goals and shootout scores from aggregate fullTime", () => {
    expect(normalizeMatch({ ...matchFixture(), score: { duration: "PENALTY_SHOOTOUT", fullTime: { home: 7, away: 6 }, regularTime: { home: 1, away: 1 }, extraTime: { home: 0, away: 0 }, penalties: { home: 6, away: 5 } } })).toMatchObject({ homeScore: 1, awayScore: 1, homeExtraTimeScore: 0, awayExtraTimeScore: 0, homePenaltyScore: 6, awayPenaltyScore: 5 });
  });
  it("does not infer regulation scores from an ambiguous knockout total", () => {
    const match = normalizeMatch({ ...matchFixture(), score: { duration: "EXTRA_TIME", fullTime: { home: 3, away: 2 } } });
    expect(match.homeScore).toBeUndefined(); expect(match.homeExtraTimeScore).toBeUndefined();
  });
  it("preserves unknown scores and metadata as absent", () => {
    const match = normalizeMatch({ ...matchFixture(), score: null, lastUpdated: null, homeTeam: { id: 910001, name: "Fixture Alpha" } });
    expect(match.homeScore).toBeUndefined(); expect(match.awayScore).toBeUndefined();
    expect(match.home.venue).toBeUndefined(); expect(match.providerUpdatedAt).toBeUndefined();
  });
  it("does not turn cancelled or postponed fixtures into 0–0 games", () => {
    for (const status of ["TIMED", "POSTPONED", "CANCELLED"]) {
      expect(normalizeMatch({ ...matchFixture(), status, score: { duration: "REGULAR", fullTime: { home: 0, away: 0 } } }).homeScore).toBeUndefined();
    }
  });
  it("drops partial score pairs together", () => expect(normalizeMatch({ ...matchFixture(), score: { duration: "REGULAR", fullTime: { home: 2, away: null } } }).homeScore).toBeUndefined());
  it("normalizes standings and rejects partial malformed tables as a whole", () => {
    const s = standingsFixture();
    expect(normalizeStandings(s).items[0]).toMatchObject({ points: 19, drawn: 1, tableType: "TOTAL" });
    expect(normalizeStandings({ ...s, standings: [...s.standings, { stage: "REGULAR_SEASON", type: "HOME", table: [{ team: null }] }] })).toMatchObject({ skipped: 1 });
  });
});

describe("football-data transport", () => {
  it("fails missing configuration without issuing a request or exposing a key", async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(new FootballDataMatchProvider(undefined, { fetch: fetcher }).getMatches(query)).rejects.toMatchObject({ code: "NOT_CONFIGURED" });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([401, 403])("does not retry unauthorized HTTP %s", async (status) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("untrusted body", { status }));
    await expect(new FootballDataMatchProvider("test-only-token", { ...options, fetch: fetcher }).getMatches(query)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("respects 429 cooldown without retrying aggressively", async () => {
    const cooldown = vi.fn(async () => {});
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("do not echo token", { status: 429, headers: { "Retry-After": "90" } }));
    await expect(new FootballDataMatchProvider("test-only-token", { ...options, fetch: fetcher, onRateLimit: cooldown }).getMatches(query)).rejects.toMatchObject({ code: "RATE_LIMITED", retryAfterMs: 90000 });
    expect(fetcher).toHaveBeenCalledTimes(1); expect(cooldown).toHaveBeenCalledWith(90000);
  });
  it("retries temporary failures with a strict bound and safe errors", async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error("test-only-token inside unsafe driver text"));
    const provider = new FootballDataMatchProvider("test-only-token", { ...options, fetch: fetcher });
    await expect(provider.getMatches(query)).rejects.toMatchObject({ code: "NETWORK", message: "Provider network request failed." });
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(JSON.stringify(provider)).not.toContain("test-only-token");
  });
  it("retries a temporary 503 and then validates the successful payload", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response("upstream failure", { status: 503 })).mockResolvedValueOnce(response({ matches: [matchFixture()] }));
    expect((await new FootballDataMatchProvider("test-only-token", { ...options, fetch: fetcher }).getMatches(query)).items).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("aborts a slow request and returns a safe timeout", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    }));
    await expect(new FootballDataMatchProvider("test-only-token", { ...options, fetch: fetcher, timeoutMs: 5, retries: 0 }).getMatches(query)).rejects.toMatchObject({ code: "TIMEOUT" });
  });
  it("rejects invalid JSON without retry", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("<html>bad</html>"));
    await expect(new FootballDataMatchProvider("test-only-token", { ...options, fetch: fetcher }).getMatches(query)).rejects.toMatchObject({ code: "INVALID_JSON" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("rejects a malformed envelope", async () => {
    await expect(new FootballDataMatchProvider("test-only-token", { ...options, fetch: async () => response({ matches: null }) }).getMatches(query)).rejects.toMatchObject({ code: "MALFORMED_RESPONSE" });
  });
  it("keeps valid rows from partial responses and counts skipped rows", async () => {
    const provider = new FootballDataMatchProvider("test-only-token", { ...options, fetch: async () => response({ competition: competitionFixture, matches: [matchFixture(), { ...matchFixture(), utcDate: null }, { ...matchFixture(), homeTeam: null }] }) });
    expect(await provider.getMatches(query)).toMatchObject({ skipped: 2, items: [expect.objectContaining({ externalId: "920001" })] });
  });
  it("reports unavailable free-tier capabilities without fabricating arrays", async () => {
    const provider = new FootballDataMatchProvider();
    expect(await provider.getMatchEvents("1")).toMatchObject({ available: false });
    expect(await provider.getMatchStats("1")).toMatchObject({ available: false });
  });
  it("uses the scoped single-match endpoint and rejects untrusted external paths", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response(matchFixture()));
    const p = new FootballDataMatchProvider("test-only-token", { ...options, fetch: fetcher });
    expect((await p.getMatch("920001")).externalId).toBe("920001");
    await expect(p.getMatch("../competitions")).rejects.toMatchObject({ code: "UNSUPPORTED" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("does not retry a permanent upstream capability failure", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("not implemented", { status: 501 }));
    await expect(new FootballDataMatchProvider("test-only-token", { ...options, fetch: fetcher }).getMatches(query)).rejects.toMatchObject({ code: "UNSUPPORTED" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("keeps paid DTO fields out of normalized data and sends the key only as a header", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response({ matches: [{ ...matchFixture(), homeTeam: { ...teamFixture(), statistics: { shots: 99 } }, odds: { homeWin: 2 } }] }));
    const result = await new FootballDataMatchProvider("test-only-token", { ...options, fetch: fetcher }).getMatches(query);
    expect(JSON.stringify(result)).not.toContain("shots"); expect(JSON.stringify(result)).not.toContain("odds");
    const [url, init] = fetcher.mock.calls[0];
    expect(String(url)).not.toContain("test-only-token");
    expect(init?.headers).toMatchObject({ "X-Auth-Token": "test-only-token" });
  });
});
