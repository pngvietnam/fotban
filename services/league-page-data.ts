import "server-only";
import { getDatabase } from "../lib/db";
import { logger } from "../lib/logger";
import { prismaSyncDatabase } from "../lib/sync-database";
import type { LeagueQuery } from "../lib/league-presentation";
import type { ClubRow, FixtureRow, LeagueInfo, LeagueSlug, StandingsData } from "../types/league-hub";
import { leagueClubSeason, leagueClubs, leagueFixtures, leagueInfo, leagueMatchDays, leagueRoundFixtures, leagueRounds, leagueStandings, type LeagueRounds } from "./league-hub";
import { readLeagueLeaders, type LeagueLeaders } from "./league-leaders";
import { clubKey } from "../lib/league-memories";
import { playerBoards, teamOfTheWeek, type PlayerBoards } from "./league-player-stats";

/**
 * `round`: the round shown (the chosen one, else the current one) with its matches. On the fixtures tab, `days`
 * (with the chosen `day`) or `club` (one club's season, chosen from `clubs`) replace it when that view is picked.
 */
export type LeagueData = {
  league: LeagueInfo; leaders: LeagueLeaders | null; rounds: LeagueRounds; round?: { number: number; fixtures: FixtureRow[] } | null;
  days?: { days: string[]; day: string | null; fixtures: FixtureRow[] }; club?: { clubId: string | null; fixtures: FixtureRow[] };
  standings?: StandingsData; clubs?: ClubRow[];
  team?: Awaited<ReturnType<typeof teamOfTheWeek>>; boards?: PlayerBoards;
  /** Crests of the clubs Fotban stores, by loose club key (for the honours of other eras). */
  crests?: Record<string, string>;
};
export type LeagueResult = { kind: "ready"; data: LeagueData } | { kind: "not-found" } | { kind: "error" };

const dayMs = 86400_000;

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
      const leaders = await readLeagueLeaders(tx, slug);
      const rounds = await leagueRounds(tx, slug, now);
      const data: LeagueData = { league, leaders, rounds };
      if (["tong-quan", "bang-xep-hang", "loai-truc-tiep"].includes(query.tab)) data.standings = await leagueStandings(tx, slug, now);
      const fixturesBy = query.tab === "lich-thi-dau" ? query.view : query.tab === "tong-quan" ? "vong" : null;
      if (fixturesBy === "vong") {
        const number = query.round && rounds.rounds.includes(query.round) ? query.round : rounds.current;
        data.round = number ? { number, fixtures: await leagueRoundFixtures(tx, slug, number, now) } : null;
      }
      if (query.tab === "tong-quan" && data.round?.fixtures.length) {
        const times = data.round.fixtures.map((fixture) => Date.parse(fixture.kickoffAt));
        data.team = await teamOfTheWeek(tx, slug, new Date(Math.min(...times) - 3600_000), new Date(Math.max(...times) + 6 * 3600_000));
      }
      if (query.tab === "mua-giai") {
        const clubs = await tx.query<{ name: string; shortName: string | null; crest: string }>(`SELECT name,"shortName","externalCrestUrl" AS crest FROM "Club" WHERE "externalCrestUrl" IS NOT NULL`);
        data.crests = Object.fromEntries(clubs.flatMap((club) => [[clubKey(club.name), club.crest], ...(club.shortName ? [[clubKey(club.shortName), club.crest]] : [])]));
      }
      if (query.tab === "thong-ke") data.boards = await playerBoards(tx, slug);
      if (fixturesBy === "ngay") {
        const { days, current } = await leagueMatchDays(tx, slug, now);
        const day = query.day && days.includes(query.day) ? query.day : current;
        const start = day ? new Date(`${day}T00:00:00+07:00`) : null;
        data.days = { days, day, fixtures: start ? await leagueFixtures(tx, slug, start, new Date(start.getTime() + dayMs)) : [] };
      }
      if (fixturesBy === "doi") {
        data.clubs = await leagueClubs(tx, slug, now);
        const clubId = query.club && data.clubs.some((club) => club.clubId === query.club) ? query.club : null;
        data.club = { clubId, fixtures: clubId ? await leagueClubSeason(tx, slug, clubId, now) : [] };
      }
      if (query.tab === "doi-bong") data.clubs = await leagueClubs(tx, slug, now);
      return { kind: "ready", data };
    });
  } catch { logger.error({ requestId: crypto.randomUUID() }, "league.page_failed"); return { kind: "error" }; }
}
