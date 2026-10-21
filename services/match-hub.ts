import type { SqlExecutor } from "../lib/sync-database";
import type { FixtureRow, LeagueInfo, StandingsData } from "../types/league-hub";
import { isLeagueSlug, leagueInfo, leagueStandings } from "./league-hub";
import { clubFixtures } from "./club-hub";
import { storedMeetings } from "./head-to-head";

/** One earlier meeting of the page's two clubs; `homeIsPageHome` says which of them was at home that day. */
export type H2HMeeting = { key: string; date: string; competition: string | null; homeIsPageHome: boolean; homeScore: number; awayScore: number; penalties: string | null; slug: string | null };
/** `source`: the data provider's list (every competition) or, until that is read, the matches stored here. */
export type HeadToHead = { meetings: H2HMeeting[]; homeWins: number; draws: number; awayWins: number; source: "provider" | "stored" };
export type MatchHub = {
  league: LeagueInfo | null; standings: StandingsData | null;
  home: { recent: FixtureRow[]; next: FixtureRow | null } | null; away: { recent: FixtureRow[]; next: FixtureRow | null } | null;
  headToHead: HeadToHead;
};
type H2HRow = { slug: string; kickoffAt: string; homeClubId: string; homeScore: number; awayScore: number; competition: string };

/** Wins and draws for the page's home club over the given meetings. */
export function tally(meetings: H2HMeeting[]) {
  let homeWins = 0; let draws = 0; let awayWins = 0;
  for (const meeting of meetings) {
    if (meeting.homeScore === meeting.awayScore) { draws++; continue; }
    if ((meeting.homeScore > meeting.awayScore) === meeting.homeIsPageHome) homeWins++; else awayWins++;
  }
  return { homeWins, draws, awayWins };
}

/**
 * Earlier meetings of the two clubs, newest first: never this match or anything after its kickoff. The provider's
 * list covers every competition; until it has been read, the finished matches stored here stand in.
 */
export async function headToHead(tx: SqlExecutor, match: { id: string; kickoffAt: Date | string }, homeClubId: string, awayClubId: string, limit = 10): Promise<HeadToHead> {
  const kickoff = new Date(match.kickoffAt).getTime();
  const provided = await storedMeetings(tx, match.id);
  if (provided) {
    const meetings = provided.meetings.filter((meeting) => meeting.id !== provided.externalId && Date.parse(meeting.date) < kickoff).slice(0, limit)
      .map((meeting): H2HMeeting => ({ key: meeting.id, date: meeting.date, competition: meeting.competition, homeIsPageHome: meeting.homeTeamId === provided.homeTeamId, homeScore: meeting.homeScore, awayScore: meeting.awayScore, penalties: meeting.penalties, slug: null }));
    return { meetings, ...tally(meetings), source: "provider" };
  }
  const rows = await tx.query<H2HRow>(`SELECT m.slug,m."kickoffAt",m."homeClubId",m."homeScore",m."awayScore",l.name AS competition
    FROM "Match" m JOIN "League" l ON l.id=m."leagueId"
    WHERE ((m."homeClubId"=$1::uuid AND m."awayClubId"=$2::uuid) OR (m."homeClubId"=$2::uuid AND m."awayClubId"=$1::uuid)) AND m.id<>$3::uuid
      AND m.status='FINISHED' AND m."homeScore" IS NOT NULL AND m."awayScore" IS NOT NULL AND m."kickoffAt"<$4::timestamptz
    ORDER BY m."kickoffAt" DESC,m.id LIMIT $5`, [homeClubId, awayClubId, match.id, new Date(kickoff), limit]);
  const meetings = rows.map((row): H2HMeeting => ({ key: row.slug, date: new Date(row.kickoffAt).toISOString(), competition: row.competition, homeIsPageHome: row.homeClubId === homeClubId, homeScore: row.homeScore, awayScore: row.awayScore, penalties: null, slug: row.slug }));
  return { meetings, ...tally(meetings), source: "stored" };
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
  const empty: HeadToHead = { meetings: [], homeWins: 0, draws: 0, awayWins: 0, source: "stored" };
  return { league, standings, home, away, headToHead: match.homeClub?.id && match.awayClub?.id ? await headToHead(tx, match, match.homeClub.id, match.awayClub.id) : empty };
}
