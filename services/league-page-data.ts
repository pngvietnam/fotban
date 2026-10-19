import "server-only";
import { getDatabase } from "../lib/db";
import { logger } from "../lib/logger";
import { prismaSyncDatabase } from "../lib/sync-database";
import { fixtureWindow, type LeagueQuery } from "../lib/league-presentation";
import type { ClubRow, FixtureRow, LeagueInfo, LeagueSlug, StandingsData } from "../types/league-hub";
import { leagueClubs, leagueFixtures, leagueInfo, leagueStandings, leagueUpcoming } from "./league-hub";

export type LeagueData = { league: LeagueInfo; standings?: StandingsData; fixtures?: FixtureRow[]; upcoming?: FixtureRow[]; clubs?: ClubRow[] };
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
      const data: LeagueData = { league };
      if (query.tab === "tong-quan" || query.tab === "bang-xep-hang") data.standings = await leagueStandings(tx, slug, now);
      if (query.tab === "tong-quan") data.upcoming = await leagueUpcoming(tx, slug, now);
      if (query.tab === "lich-thi-dau") { const window = fixtureWindow(query.from, now); data.fixtures = await leagueFixtures(tx, slug, window.start, window.end); }
      if (query.tab === "doi-bong") data.clubs = await leagueClubs(tx, slug, now);
      return { kind: "ready", data };
    });
  } catch { logger.error({ requestId: crypto.randomUUID() }, "league.page_failed"); return { kind: "error" }; }
}
