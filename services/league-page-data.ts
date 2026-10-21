import "server-only";
import { getDatabase } from "../lib/db";
import { logger } from "../lib/logger";
import { prismaSyncDatabase } from "../lib/sync-database";
import type { LeagueQuery } from "../lib/league-presentation";
import type { ClubRow, FixtureRow, LeagueInfo, LeagueSlug, StandingsData } from "../types/league-hub";
import { leagueClubs, leagueInfo, leagueRoundFixtures, leagueRounds, leagueStandings, type LeagueRounds } from "./league-hub";
import { readLeagueLeaders, type LeagueLeaders } from "./league-leaders";

/** `round`: the round shown (the chosen one, else the current one) with its matches. */
export type LeagueData = { league: LeagueInfo; leaders: LeagueLeaders | null; rounds: LeagueRounds; round?: { number: number; fixtures: FixtureRow[] } | null; standings?: StandingsData; clubs?: ClubRow[] };
export type LeagueResult = { kind: "ready"; data: LeagueData } | { kind: "not-found" } | { kind: "error" };

/** Reads only what the selected tab needs, in one read-only snapshot. */
export async function readLeague(slug: LeagueSlug, query: LeagueQuery, now = new Date()): Promise<LeagueResult> {
  try {
    const db = getDatabase();
    if (!db) return { kind: "error" };
    return await prismaSyncDatabase(db).transaction(async (tx): Promise<LeagueResult> => {
      await tx.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const league = await leagueInfo(tx, slug, now);
      if (!league) return { kind: "not-found" };
      // The header shows the emblem and current round on every tab.
      const [leaders, rounds] = await Promise.all([readLeagueLeaders(tx, slug), leagueRounds(tx, slug, now)]);
      const data: LeagueData = { league, leaders, rounds };
      if (query.tab === "tong-quan" || query.tab === "bang-xep-hang") data.standings = await leagueStandings(tx, slug, now);
      if (query.tab === "tong-quan" || query.tab === "lich-thi-dau") {
        const number = query.round && rounds.rounds.includes(query.round) ? query.round : rounds.current;
        data.round = number ? { number, fixtures: await leagueRoundFixtures(tx, slug, number, now) } : null;
      }
      if (query.tab === "doi-bong") data.clubs = await leagueClubs(tx, slug, now);
      return { kind: "ready", data };
    });
  } catch { logger.error({ requestId: crypto.randomUUID() }, "league.page_failed"); return { kind: "error" }; }
}
