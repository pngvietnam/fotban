import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SyncDatabase } from "../lib/sync-database";
import { matchSquadPlayer, pairMatches, sameName, teamNameScore } from "../lib/match-detail-matching";
import { cleanName, metricKey, normalizeBoxScore, normalizeDetail, normalizeLineups, normalizeMatches, parseEventTime } from "../providers/highlightly/normalization";
import { HighlightlyProvider, type MatchDetailApi } from "../providers/highlightly/provider";
import { ProviderError } from "../providers/errors";
import { orientSubstitutions, reserveQuota, syncMatchDetails } from "../services/match-details";

const detailBody = (overrides: Record<string, unknown> = {}) => ({
  id: 9001, homeTeam: { id: 10, name: "Arsenal" }, awayTeam: { id: 20, name: "Chelsea" }, referee: { name: "Michael Oliver" },
  events: [
    { team: { id: 10, name: "Arsenal" }, time: "23", type: "Goal", player: "B. Saka", assist: "M. Ødegaard" },
    { team: { id: 20, name: "Chelsea" }, time: "45+2", type: "Yellow Card", player: "C. Palmer" },
    { team: { id: 20, name: "Chelsea" }, time: "61", type: "Substitution", player: "N. Jackson", substituted: "C. Palmer" },
    { team: { id: 10, name: "Arsenal" }, time: "70", type: "VAR Goal Cancelled - Offside", player: "B. Saka" },
  ],
  statistics: [
    { team: { id: 10, name: "Arsenal" }, statistics: [{ displayName: "Ball possession", value: 0.58 }, { displayName: "Total shots", value: 14 }] },
    { team: { id: 20, name: "Chelsea" }, statistics: [{ displayName: "Ball possession", value: 0.42 }, { displayName: "Total shots", value: 7 }] },
  ],
  ...overrides,
});
const boxBody = () => [
  { team: { id: 10, name: "Arsenal" }, players: [{ id: 7, name: "Bukayo Saka", fullName: "Bukayo Ayoyinka Temidayo Saka", shirtNumber: 7, matchRating: 8.4, minutesPlayed: 90, isCaptain: false, statistics: { goalsScored: 1, assists: 0, shotsAccuracy: "50.00 %", expectedGoals: 0.62 } }] },
  { team: { id: 20, name: "Chelsea" }, players: [{ id: 10, name: "Cole Palmer", fullName: "Cole Jermaine Palmer", shirtNumber: 10, matchRating: "6.1", minutesPlayed: 61, statistics: {} }] },
];
const lineupBody = () => ({
  homeTeam: { id: 10, name: "Arsenal", formation: "4-3-3", initialLineup: [[{ name: "David Raya", number: 22, position: "Goalkeeper" }], [{ name: "Bukayo Saka", number: 7, position: "Forward" }]], substitutes: [{ id: 5, name: "Kai Havertz", number: 29, position: "Forward" }] },
  awayTeam: { id: 20, name: "Chelsea", formation: "4-2-3-1", initialLineup: [[{ name: "Robert Sánchez", number: 1, position: "Goalkeeper" }], [{ name: "Cole Palmer", number: 10, position: "Midfielder" }]], substitutes: [{ name: "Nicolas Jackson", number: 15, position: "Forward" }] },
});

describe("Highlightly normalization", () => {
  it("parses event minutes, types, details and statistics keys", () => {
    expect(parseEventTime("45+2")).toEqual({ minute: 45, addedMinute: 2 });
    expect(parseEventTime(67)).toEqual({ minute: 67, addedMinute: null });
    expect(parseEventTime("abc")).toEqual({ minute: null, addedMinute: null });
    expect(metricKey("Ball possession")).toBe("ball_possession");
    expect(metricKey("Passes %")).toBe("passes_percent");
    const detail = normalizeDetail(detailBody());
    expect(detail.referee).toBe("Michael Oliver");
    expect(detail.events.map((event) => [event.type, event.minute, event.addedMinute, event.player, event.related, event.detail])).toEqual([
      ["GOAL", 23, null, "B. Saka", "M. Ødegaard", null], ["YELLOW_CARD", 45, 2, "C. Palmer", null, null],
      ["SUBSTITUTION", 61, null, "N. Jackson", "C. Palmer", null], ["OTHER", 70, null, "B. Saka", null, "VAR: hủy bàn thắng vì việt vị"],
    ]);
    expect(detail.stats).toContainEqual({ teamId: "10", metric: "ball_possession", value: 0.58 });
  });
  it("repairs HTML-escaped and mis-decoded names", () => {
    expect(cleanName("D. O&apos;Shea")).toBe("D. O'Shea");
    expect(cleanName("N. O&#39;Reilly")).toBe("N. O'Reilly");
    expect(cleanName("Dani MartÃ­nez")).toBe("Dani Martínez");
    expect(cleanName("Martin Ødegaard")).toBe("Martin Ødegaard");
    expect(normalizeLineups({ homeTeam: { id: 1, name: "A", initialLineup: [[{ name: "D. O&apos;Shea", number: 5, position: "Defender" }]], substitutes: [] }, awayTeam: { id: 2, name: "B", initialLineup: [], substitutes: [] } }).home.players[0].name).toBe("D. O'Shea");
  });
  it("accepts the one-element array form of the detail endpoint and rejects malformed bodies", () => {
    expect(normalizeDetail([detailBody()]).id).toBe("9001");
    expect(() => normalizeDetail({ id: "x" })).toThrow();
  });
  it("flattens lineups into starters with row/slot and a bench", () => {
    const lineups = normalizeLineups(lineupBody());
    expect(lineups.home.formation).toBe("4-3-3");
    expect(lineups.home.players).toEqual([
      { name: "David Raya", number: 22, position: "Goalkeeper", starter: true, row: 0, slot: 0 },
      { name: "Bukayo Saka", number: 7, position: "Forward", starter: true, row: 1, slot: 0 },
      { name: "Kai Havertz", number: 29, position: "Forward", starter: false, row: null, slot: null, externalId: "5" },
    ]);
  });
  it("keeps only matches with a valid kickoff", () => {
    expect(normalizeMatches({ data: [{ id: 1, date: "2026-10-18T15:30:00.000Z", homeTeam: { id: 1, name: "A" }, awayTeam: { id: 2, name: "B" } }, { id: 2, date: "nope", homeTeam: { id: 1, name: "A" }, awayTeam: { id: 2, name: "B" } }] }).map((match) => match.id)).toEqual(["1"]);
  });
});

describe("matching provider names to FotBan clubs and players", () => {
  it("scores club names on shared words, ignoring FC/CF and accents", () => {
    expect(teamNameScore(["Club Atlético de Madrid", "Atleti"], "Atletico Madrid")).toBe(1);
    expect(teamNameScore(["Wolverhampton Wanderers FC", "Wolves"], "Wolves")).toBe(1);
    expect(teamNameScore(["Arsenal FC"], "Chelsea")).toBe(0);
  });
  it("pairs matches by kickoff and both team names, leaving ties unmatched", () => {
    const at = new Date("2026-10-18T15:30:00Z");
    const local = [{ id: "a", kickoffAt: at, home: ["Nottingham Forest FC", "Nottingham"], away: ["Arsenal FC", "Arsenal"] }];
    expect(pairMatches(local, [{ id: "x", kickoffAt: at, home: { name: "Nottingham Forest" }, away: { name: "Arsenal" } }, { id: "y", kickoffAt: at, home: { name: "Everton" }, away: { name: "Chelsea" } }])).toEqual(new Map([["a", "x"]]));
    expect(pairMatches(local, [{ id: "x", kickoffAt: new Date(at.getTime() + 3600_000), home: { name: "Nottingham Forest" }, away: { name: "Arsenal" } }]).size).toBe(0);
  });
  it("links longer or shorter forms of a name only when unique", () => {
    const squad = [{ id: "1", name: "Lamine Yamal" }, { id: "2", name: "Antonio Sivera" }];
    expect(matchSquadPlayer(squad, "Lamine Yamal Nasraoui Ebana")).toBe("1");
    expect(matchSquadPlayer(squad, "Sivera")).toBe("2");
    expect(matchSquadPlayer(squad, "Lamine")).toBeNull();
  });
  it("finds a squad player from a full or initial-and-surname name only when unique", () => {
    const squad = [{ id: "1", name: "Bukayo Saka" }, { id: "2", name: "Martin Ødegaard" }, { id: "3", name: "Gabriel Magalhães" }, { id: "4", name: "Gabriel Martinelli" }];
    expect(matchSquadPlayer(squad, "Bukayo Saka")).toBe("1");
    expect(matchSquadPlayer(squad, "B. Saka")).toBe("1");
    expect(matchSquadPlayer(squad, "M. Odegaard")).toBe("2");
    expect(matchSquadPlayer(squad, "Gabriel")).toBeNull();
    expect(matchSquadPlayer(squad, "X. Saka")).toBeNull();
  });
  it("recognises the same person across short, full and longer spellings", () => {
    expect(sameName("A. Maitland-Niles", "Ainsley Maitland-Niles")).toBe(true);
    expect(sameName("Pedro Neto", "Pedro Lomba Neto")).toBe(true);
    expect(sameName("M. Caicedo", "Moises Caicedo")).toBe(true);
    expect(sameName("J. Garner", "Harrison Armstrong")).toBe(false);
    expect(sameName("Gabriel", "Gabriel Martinelli")).toBe(false);
  });
  it("orients substitutions by who is on the pitch, whichever way the provider wrote them", () => {
    const lineup = [
      { name: "A. Maitland-Niles", starter: true }, { name: "J. Pedro", fullName: "João Pedro Junqueira de Jesus", starter: true },
      { name: "T. George", fullName: "Tyrique George", starter: false }, { name: "D. Welbeck", starter: false }, { name: "M. Penders", starter: false },
    ];
    const sub = (minute: number, player: string, related: string) => ({ type: "SUBSTITUTION", minute, player, related });
    const oriented = orientSubstitutions([sub(55, "Ainsley Maitland-Niles", "Tyrique George"), sub(80, "Danny Welbeck", "João Pedro"), sub(88, "Tyrique George", "Mike Penders")], () => "club", new Map([["club", lineup]]));
    expect(oriented.map((event) => [event.player, event.related])).toEqual([
      ["Tyrique George", "Ainsley Maitland-Niles"], // the starter was named first: he went off
      ["Danny Welbeck", "João Pedro"], // already the right way round
      ["Mike Penders", "Tyrique George"], // George came on at 55, so here he is the one leaving
    ]);
    expect(orientSubstitutions([sub(10, "Unknown A", "Unknown B")], () => "club", new Map([["club", lineup]]))[0]).toMatchObject({ player: "Unknown A" });
  });
});

describe("HighlightlyProvider HTTP behaviour", () => {
  const respond = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })) as unknown as typeof fetch;
  it("sends the key header, never retries, and maps 429 to RATE_LIMITED after notifying", async () => {
    let seen: Headers | null = null; let limited = false;
    const ok = new HighlightlyProvider("secret", { fetch: (async (_url: string, init: RequestInit) => { seen = new Headers(init.headers); return new Response(JSON.stringify(detailBody()), { status: 200 }); }) as unknown as typeof fetch });
    await ok.match("9001");
    expect(seen!.get("x-rapidapi-key")).toBe("secret");
    await expect(new HighlightlyProvider("k", { fetch: respond(429, {}), onRateLimit: async () => { limited = true; } }).match("1")).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(limited).toBe(true);
    await expect(new HighlightlyProvider(undefined).match("1")).rejects.toMatchObject({ code: "NOT_CONFIGURED" });
    await expect(new HighlightlyProvider("k", { fetch: respond(200, { nope: true }) }).match("1")).rejects.toMatchObject({ code: "MALFORMED_RESPONSE" });
  });
  it("reports unpublished lineups as null", async () => {
    expect(await new HighlightlyProvider("k", { fetch: respond(404, {}) }).lineups("1")).toBeNull();
    expect(await new HighlightlyProvider("k", { fetch: respond(200, { homeTeam: { id: 1, name: "A", initialLineup: [], substitutes: [] }, awayTeam: { id: 2, name: "B", initialLineup: [], substitutes: [] } }) }).lineups("1")).toBeNull();
  });
});

describe("syncMatchDetails (SQL)", () => {
  let db: PGlite; let database: SyncDatabase;
  const ids = { league: randomUUID(), season: randomUUID(), arsenal: randomUUID(), chelsea: randomUUID(), match: randomUUID(), later: randomUUID(), saka: randomUUID(), palmer: randomUUID(), jackson: randomUUID() };
  const now = new Date("2026-10-18T20:00:00Z");
  beforeAll(async () => {
    db = new PGlite();
    for (const entry of readdirSync("prisma/migrations", { withFileTypes: true }).filter((entry) => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) await db.exec(readFileSync(`prisma/migrations/${entry.name}/migration.sql`, "utf8"));
    database = {
      query: async <T>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows,
      transaction: (work) => db.transaction((tx) => work({ query: async <T>(sql: string, params: unknown[] = []) => (await tx.query<T>(sql, params)).rows })),
    };
  }, 60000);
  beforeEach(async () => {
    await db.exec('TRUNCATE "ProviderQuota","MatchDetailSync","MatchLineup","MatchEvent","MatchStat","ExternalIdentity","Match","PlayerClub","Player","ClubSeason","Season","Club","League" CASCADE');
    await database.query(`INSERT INTO "League" (id,slug,name,country,"updatedAt") VALUES ($1::uuid,'premier-league','Premier League','England',now())`, [ids.league]);
    await database.query(`INSERT INTO "Season" (id,"leagueId",name,"startsAt","endsAt","updatedAt") VALUES ($1::uuid,$2::uuid,'2026/2027','2026-08-01','2027-06-30',now())`, [ids.season, ids.league]);
    for (const [id, name, short] of [[ids.arsenal, "Arsenal FC", "Arsenal"], [ids.chelsea, "Chelsea FC", "Chelsea"]]) await database.query(`INSERT INTO "Club" (id,slug,name,"shortName","updatedAt") VALUES ($1::uuid,$2,$3,$4,now())`, [id, `club-${id}`, name, short]);
    for (const [id, name, club] of [[ids.saka, "Bukayo Saka", ids.arsenal], [ids.palmer, "Cole Palmer", ids.chelsea], [ids.jackson, "Nicolas Jackson", ids.chelsea]]) {
      await database.query(`INSERT INTO "Player" (id,slug,name,"updatedAt") VALUES ($1::uuid,$2,$3,now())`, [id, `player-${id}`, name]);
      await database.query(`INSERT INTO "PlayerClub" (id,"playerId","clubId","startsAt","sourceUrl","updatedAt") VALUES (gen_random_uuid(),$1::uuid,$2::uuid,'2026-08-01','https://example.test',now())`, [id, club]);
    }
    const insertMatch = (id: string, kickoff: string, status: string, home: number | null, away: number | null) => database.query(`INSERT INTO "Match" (id,slug,provider,"externalId","leagueId","seasonId","homeClubId","awayClubId","kickoffAt",status,"homeScore","awayScore","updatedAt")
      VALUES ($1::uuid,$2,'FOOTBALL_DATA',$3,$4::uuid,$5::uuid,$6::uuid,$7::uuid,$8::timestamptz,$9::"MatchStatus",$10,$11,now())`, [id, `match-${id}`, id.slice(0, 8), ids.league, ids.season, ids.arsenal, ids.chelsea, kickoff, status, home, away]);
    await insertMatch(ids.match, "2026-10-18T15:30:00Z", "FINISHED", 1, 0);
    await insertMatch(ids.later, "2026-10-25T15:30:00Z", "SCHEDULED", null, null);
  });
  afterAll(async () => { await db.close(); });

  const fakeApi = (overrides: Partial<MatchDetailApi> = {}) => {
    const calls: string[] = [];
    const api: MatchDetailApi = {
      leagues: async (name) => { calls.push(`leagues:${name}`); return [{ id: "33", name: "Premier League", country: "England" }, { id: "99", name: "Premier League", country: "Egypt" }]; },
      matches: async (query) => { calls.push(`matches:${query.leagueId}:${query.date}`); return [{ id: "9001", kickoffAt: new Date("2026-10-18T15:30:00Z"), home: { id: "10", name: "Arsenal" }, away: { id: "20", name: "Chelsea" } }]; },
      match: async (id) => { calls.push(`match:${id}`); return normalizeDetail(detailBody()); },
      lineups: async (id) => { calls.push(`lineups:${id}`); return normalizeLineups(lineupBody()); },
      boxScore: async (id) => { calls.push(`box:${id}`); return normalizeBoxScore(boxBody()); },
      ...overrides,
    };
    return { api, calls };
  };

  it("maps the finished match, stores lineups then events and statistics, and is idle afterwards", async () => {
    const { api, calls } = fakeApi();
    expect(await syncMatchDetails(database, api, now)).toEqual({ mapped: 1, lineups: 1, details: 1, boxScores: 1, requests: 5, stopped: "DONE" });
    expect(calls).toEqual(["leagues:Premier League", "matches:33:2026-10-18", "lineups:9001", "match:9001", "box:9001"]);
    const events = await database.query<{ type: string; clubId: string; playerId: string | null; playerName: string; relatedPlayerId: string | null; minute: number; addedMinute: number | null }>(`SELECT type,"clubId","playerId","playerName","relatedPlayerId",minute,"addedMinute" FROM "MatchEvent" WHERE "matchId"=$1::uuid ORDER BY "externalId"::int`, [ids.match]);
    expect(events.map((event) => [event.type, event.clubId, event.playerId, event.minute, event.addedMinute])).toEqual([
      ["GOAL", ids.arsenal, ids.saka, 23, null], ["YELLOW_CARD", ids.chelsea, ids.palmer, 45, 2], ["SUBSTITUTION", ids.chelsea, ids.jackson, 61, null], ["OTHER", ids.arsenal, ids.saka, 70, null],
    ]);
    expect(events[2].relatedPlayerId).toBe(ids.palmer);
    const stats = await database.query<{ clubId: string; metric: string; value: string }>(`SELECT "clubId",metric,value::text FROM "MatchStat" WHERE "matchId"=$1::uuid ORDER BY metric,"clubId"`, [ids.match]);
    expect(stats.filter((stat) => stat.metric === "total_shots" && stat.clubId === ids.arsenal).map((stat) => Number(stat.value))).toEqual([14]);
    const [lineup] = await database.query<{ formation: string; players: { name: string; playerId: string | null; starter: boolean }[] }>(`SELECT formation,players FROM "MatchLineup" WHERE "clubId"=$1::uuid`, [ids.arsenal]);
    expect(lineup.formation).toBe("4-3-3");
    expect(lineup.players.find((player) => player.name === "Bukayo Saka")?.playerId).toBe(ids.saka);
    expect(lineup.players.find((player) => player.name === "Bukayo Saka")).toMatchObject({ rating: 8.4, minutes: 90, fullName: "Bukayo Ayoyinka Temidayo Saka", stats: { goalsScored: 1, expectedGoals: 0.62 } });
    const [chelsea] = await database.query<{ players: { name: string; rating: number | null }[] }>(`SELECT players FROM "MatchLineup" WHERE "clubId"=$1::uuid`, [ids.chelsea]);
    expect(chelsea.players.find((player) => player.name === "Cole Palmer")?.rating).toBe(6.1);
    const [sync] = await database.query<{ referee: string; detailFetchedAt: Date | null; lineupsFetchedAt: Date | null }>(`SELECT referee,"detailFetchedAt","lineupsFetchedAt" FROM "MatchDetailSync" WHERE "matchId"=$1::uuid`, [ids.match]);
    expect(sync.referee).toBe("Michael Oliver"); expect(sync.detailFetchedAt).not.toBeNull(); expect(sync.lineupsFetchedAt).not.toBeNull();
    const again = fakeApi();
    expect(await syncMatchDetails(database, again.api, new Date(now.getTime() + 3600_000))).toEqual({ mapped: 0, lineups: 0, details: 0, boxScores: 0, requests: 0, stopped: "DONE" });
    expect(again.calls).toEqual([]);
  });
  it("keeps a match due when goals are missing upstream, and stops at the daily allowance", async () => {
    const { api } = fakeApi({ match: async () => normalizeDetail(detailBody({ events: [] })) });
    const first = await syncMatchDetails(database, api, now);
    expect(first.details).toBe(1);
    const [sync] = await database.query<{ detailFetchedAt: Date | null; detailAttempts: number; lastError: string }>(`SELECT "detailFetchedAt","detailAttempts","lastError" FROM "MatchDetailSync" WHERE "matchId"=$1::uuid`, [ids.match]);
    expect(sync).toMatchObject({ detailFetchedAt: null, detailAttempts: 1, lastError: "INCOMPLETE" });
    // Within the retry window nothing is spent.
    expect((await syncMatchDetails(database, api, new Date(now.getTime() + 10 * 60_000))).requests).toBe(0);
    await database.query(`UPDATE "ProviderQuota" SET used=90`);
    expect(await syncMatchDetails(database, api, new Date(now.getTime() + 2 * 3600_000))).toMatchObject({ requests: 0, stopped: "QUOTA" });
  });
  it("records a failed read as an attempt and stops on RATE_LIMITED", async () => {
    const { api } = fakeApi({ match: async () => { throw new ProviderError("RATE_LIMITED"); } });
    expect(await syncMatchDetails(database, api, now)).toMatchObject({ stopped: "QUOTA", details: 0, lineups: 1 });
    const broken = fakeApi({ match: async () => { throw new ProviderError("MALFORMED_RESPONSE"); } });
    await database.query(`DELETE FROM "MatchDetailSync"`);
    expect(await syncMatchDetails(database, broken.api, now)).toMatchObject({ stopped: "DONE", details: 0 });
    expect((await database.query<{ lastError: string }>(`SELECT "lastError" FROM "MatchDetailSync"`))[0].lastError).toBe("MALFORMED_RESPONSE");
  });
  it("does not pick an ambiguous league and spends the allowance atomically", async () => {
    const { api } = fakeApi({ leagues: async () => [{ id: "1", name: "Premier League", country: "England" }, { id: "2", name: "Premier League 2", country: "England" }, { id: "3", name: "Premier League", country: "England" }] });
    expect(await syncMatchDetails(database, api, now)).toMatchObject({ stopped: "ERROR", error: "UNSUPPORTED" });
    await database.query(`DELETE FROM "ProviderQuota"`);
    const results = await Promise.all(Array.from({ length: 5 }, () => reserveQuota(database, now, 3)));
    expect(results.filter(Boolean)).toHaveLength(3);
  });
});
