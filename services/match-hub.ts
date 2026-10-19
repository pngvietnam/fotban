import type { SqlExecutor } from "../lib/sync-database";
import type { FixtureRow, LeagueInfo, StandingsData } from "../types/league-hub";
import { isLeagueSlug, leagueInfo, leagueStandings } from "./league-hub";
import { clubFixtures } from "./club-hub";

export type HeadToHead = { fixtures: FixtureRow[]; homeWins: number; draws: number; awayWins: number };
export type MatchHub = {
  league: LeagueInfo | null; standings: StandingsData | null;
  home: { recent: FixtureRow[]; next: FixtureRow | null } | null; away: { recent: FixtureRow[]; next: FixtureRow | null } | null;
  headToHead: HeadToHead;
};
type H2HRow = { slug: string; kickoffAt: string; status: string; round: string | null; homeClubId: string; homeName: string; homeTla: string | null; homeCrest: string | null; awayName: string; awayTla: string | null; awayCrest: string | null; homeScore: number; awayScore: number };

/** Finished meetings of two clubs in any competition stored here, newest first; wins are counted for the page's home club. */
export async function headToHead(tx: SqlExecutor, homeClubId: string, awayClubId: string, now: Date, limit = 10): Promise<HeadToHead> {
  const rows = await tx.query<H2HRow>(`SELECT m.slug,m."kickoffAt",m.status,m.round,m."homeClubId",hc.name AS "homeName",hc.tla AS "homeTla",hc."externalCrestUrl" AS "homeCrest",ac.name AS "awayName",ac.tla AS "awayTla",ac."externalCrestUrl" AS "awayCrest",m."homeScore",m."awayScore"
    FROM "Match" m JOIN "Club" hc ON hc.id=m."homeClubId" JOIN "Club" ac ON ac.id=m."awayClubId"
    WHERE ((m."homeClubId"=$1::uuid AND m."awayClubId"=$2::uuid) OR (m."homeClubId"=$2::uuid AND m."awayClubId"=$1::uuid)) AND m.status='FINISHED' AND m."homeScore" IS NOT NULL AND m."awayScore" IS NOT NULL AND m."kickoffAt"<=$3::timestamptz
    ORDER BY m."kickoffAt" DESC,m.id LIMIT $4`, [homeClubId, awayClubId, now, limit]);
  let homeWins = 0; let draws = 0; let awayWins = 0;
  for (const row of rows) {
    if (row.homeScore === row.awayScore) { draws++; continue; }
    const pageHomeWon = (row.homeScore > row.awayScore) === (row.homeClubId === homeClubId);
    if (pageHomeWon) homeWins++; else awayWins++;
  }
  return { fixtures: rows.map((row) => ({ slug: row.slug, kickoffAt: new Date(row.kickoffAt).toISOString(), status: row.status, round: row.round, home: { name: row.homeName, tla: row.homeTla, crestUrl: row.homeCrest }, away: { name: row.awayName, tla: row.awayTla, crestUrl: row.awayCrest }, homeScore: row.homeScore, awayScore: row.awayScore })), homeWins, draws, awayWins };
}
/** Everything the match tabs read besides the match row itself. */
export async function matchHub(tx: SqlExecutor, match: { id: string; slug: string; kickoffAt: Date | string; league: { slug: string }; homeClub: { id?: string } | null; awayClub: { id?: string } | null }, now: Date): Promise<MatchHub> {
  const slug = isLeagueSlug(match.league.slug) ? match.league.slug : null;
  const club = async (id: string | undefined) => {
    if (!id) return null;
    const fixtures = await clubFixtures(tx, id, now);
    // The next fixture other than this match, so a finished match points forward.
    return { recent: fixtures.recent, next: fixtures.upcoming.find((fixture) => fixture.slug !== match.slug) ?? null };
  };
  const [league, standings, home, away] = await Promise.all([slug ? leagueInfo(tx, slug, now) : null, slug ? leagueStandings(tx, slug, now) : null, club(match.homeClub?.id), club(match.awayClub?.id)]);
  const empty: HeadToHead = { fixtures: [], homeWins: 0, draws: 0, awayWins: 0 };
  return { league, standings, home, away, headToHead: match.homeClub?.id && match.awayClub?.id ? await headToHead(tx, match.homeClub.id, match.awayClub.id, now) : empty };
}
