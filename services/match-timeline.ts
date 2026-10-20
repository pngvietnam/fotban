import type { SqlExecutor } from "../lib/sync-database";
import { timelineLeagues, timelineStatusValues, type TimelineView } from "../lib/match-timeline";
import type { MatchSummary } from "../types/match-ui";
import type { LeagueSlug, StandingRow } from "../types/league-hub";
import { leagueStandings } from "./league-hub";
import { videoFreshMs } from "./video-store";

const vnDay = `to_char(m."kickoffAt" AT TIME ZONE 'Asia/Ho_Chi_Minh','YYYY-MM-DD')`;
const dayStart = (day: string) => new Date(`${day}T00:00:00+07:00`);
const dayEnd = (day: string) => new Date(dayStart(day).getTime() + 86400000);
/** League and (optionally) club scope shared by every timeline query: $1 league slugs, $2 club ids or null. */
const scopeSql = `FROM "Match" m JOIN "League" l ON l.id=m."leagueId" WHERE l.slug=ANY($1::text[]) AND ($2::uuid[] IS NULL OR m."homeClubId"=ANY($2::uuid[]) OR m."awayClubId"=ANY($2::uuid[]))`;

export type TimelineScope = { leagueSlugs: string[]; clubIds: string[] | null };
export type TimelineData = {
  /** Days shown, oldest first; always includes the anchor day. */
  days: string[];
  matches: MatchSummary[];
  /** Match days (under the status filter) before the first day shown. */
  earlierDays: number;
  /** First later day with an upcoming match, if any. */
  nextUpcoming: string | null;
  /** Matches with a validated highlight from a reviewed channel. */
  highlighted: string[];
};

export function timelineScope(view: TimelineView, followedClubIds: string[] | null): TimelineScope {
  return { leagueSlugs: view.league === "all" ? timelineLeagues.map((league) => league.slug) : [view.league], clubIds: view.doi ? followedClubIds ?? [] : null };
}

/**
 * The anchor day, `truoc` earlier match days and `sau` later days that have upcoming matches.
 * `loadMatches` reads the match rows of the chosen days (listMatchesOnDays in production).
 */
export async function readTimeline(tx: SqlExecutor, view: TimelineView, scope: TimelineScope, now: Date, loadMatches: (days: string[], scope: TimelineScope) => Promise<MatchSummary[]>): Promise<TimelineData> {
  const statuses = view.status === "all" ? null : timelineStatusValues[view.status];
  const params = [scope.leagueSlugs, scope.clubIds];
  const days = async (sql: string, extra: unknown[]) => (await tx.query<{ day: string }>(sql, [...params, ...extra])).map((row) => row.day);
  const earlier = view.truoc ? (await days(`SELECT DISTINCT ${vnDay} AS day ${scopeSql} AND ($3::text[] IS NULL OR m.status::text=ANY($3::text[])) AND m."kickoffAt"<$4::timestamptz ORDER BY day DESC LIMIT $5`, [statuses, dayStart(view.ngay), view.truoc])).reverse() : [];
  const later = view.sau ? await days(`SELECT DISTINCT ${vnDay} AS day ${scopeSql} AND m.status='SCHEDULED' AND m."kickoffAt">=$3::timestamptz ORDER BY day LIMIT $4`, [dayEnd(view.ngay), view.sau]) : [];
  const shown = [...earlier, view.ngay, ...later];
  const [first, last] = [shown[0], shown[shown.length - 1]];
  const [[before], [next], matches] = await Promise.all([
    tx.query<{ count: number }>(`SELECT count(DISTINCT ${vnDay})::int AS count ${scopeSql} AND ($3::text[] IS NULL OR m.status::text=ANY($3::text[])) AND m."kickoffAt"<$4::timestamptz`, [...params, statuses, dayStart(first)]),
    tx.query<{ day: string }>(`SELECT ${vnDay} AS day ${scopeSql} AND m.status='SCHEDULED' AND m."kickoffAt">=$3::timestamptz ORDER BY m."kickoffAt" LIMIT 1`, [...params, dayEnd(last)]),
    scope.clubIds && !scope.clubIds.length ? [] : loadMatches(shown, scope),
  ]);
  return { days: shown, matches, earlierDays: Number(before?.count ?? 0), nextUpcoming: next?.day ?? null, highlighted: await highlightedMatches(tx, matches.map((match) => match.id), now) };
}

/** Same freshness rule as the match page: validated and re-checked within the last week. */
export async function highlightedMatches(tx: SqlExecutor, matchIds: string[], now: Date) {
  if (!matchIds.length) return [];
  const rows = await tx.query<{ matchId: string }>(`SELECT DISTINCT v."matchId" FROM "Video" v WHERE v."matchId"=ANY($1::uuid[]) AND v.provider='YOUTUBE' AND v."validationStatus"='VALIDATED' AND v."lastCheckedAt"<=$2::timestamptz AND v."lastCheckedAt">$3::timestamptz`, [matchIds, now, new Date(now.getTime() - videoFreshMs)]);
  return rows.map((row) => row.matchId);
}

export type Spotlight = {
  slug: string; kickoffAt: string; round: string | null; leagueSlug: string;
  home: { id: string; name: string; crestUrl: string | null; position: number | null; form: StandingRow["form"] };
  away: { id: string; name: string; crestUrl: string | null; position: number | null; form: StandingRow["form"] };
};
export type ArchiveClip = { videoId: string; title: string; channelName: string; publishedAt: string; matchSlug: string; home: string; away: string; kickoffAt: string };
export type TimelineSidebar = { leagueSlug: string; standings: StandingRow[]; standingsFetchedAt: string | null; spotlight: Spotlight | null; archive: ArchiveClip[] };

/**
 * Right column: the standings race and "trận tâm điểm" of the league in view (Premier League for all
 * leagues, as in the prototype), and the latest validated highlights in scope.
 */
export async function readTimelineSidebar(tx: SqlExecutor, view: TimelineView, scope: TimelineScope, followedClubIds: string[], now: Date): Promise<TimelineSidebar> {
  const leagueSlug = view.league === "all" ? "premier-league" : view.league;
  const standings = await leagueStandings(tx, leagueSlug as LeagueSlug, now);
  const byClub = new Map(standings.rows.map((row) => [row.clubId, row]));
  type Row = { slug: string; kickoffAt: string; round: string | null; homeId: string; homeName: string; homeCrest: string | null; awayId: string; awayName: string; awayCrest: string | null };
  const upcoming = await tx.query<Row>(`SELECT m.slug,m."kickoffAt",m.round,h.id AS "homeId",COALESCE(h."shortName",h.name) AS "homeName",h."externalCrestUrl" AS "homeCrest",a.id AS "awayId",COALESCE(a."shortName",a.name) AS "awayName",a."externalCrestUrl" AS "awayCrest"
    FROM "Match" m JOIN "League" l ON l.id=m."leagueId" JOIN "Club" h ON h.id=m."homeClubId" JOIN "Club" a ON a.id=m."awayClubId"
    WHERE l.slug=$1 AND m.status='SCHEDULED' AND m."kickoffAt">$2::timestamptz AND m."kickoffAt"<$2::timestamptz+interval '10 days' ORDER BY m."kickoffAt",m.id LIMIT 12`, [leagueSlug, now]);
  // A followed club's next match first; otherwise the meeting of the best-placed clubs, earliest on a tie.
  const followed = new Set(followedClubIds);
  const rank = (row: Row) => followed.has(row.homeId) || followed.has(row.awayId) ? -1 : (byClub.get(row.homeId)?.position ?? 40) + (byClub.get(row.awayId)?.position ?? 40);
  const best = upcoming.reduce<Row | null>((pick, row) => !pick || rank(row) < rank(pick) ? row : pick, null);
  const side = (id: string, name: string, crestUrl: string | null) => ({ id, name, crestUrl, position: byClub.get(id)?.position ?? null, form: byClub.get(id)?.form ?? [] });
  const archive = await tx.query<ArchiveClip>(`SELECT DISTINCT ON (m."kickoffAt",m.id) v."externalId" AS "videoId",v.title,v."channelName",v."publishedAt"::text AS "publishedAt",m.slug AS "matchSlug",COALESCE(h."shortName",h.name) AS home,COALESCE(a."shortName",a.name) AS away,m."kickoffAt"::text AS "kickoffAt"
    FROM "Video" v JOIN "Match" m ON m.id=v."matchId" JOIN "League" l ON l.id=m."leagueId" JOIN "Club" h ON h.id=m."homeClubId" JOIN "Club" a ON a.id=m."awayClubId"
    WHERE l.slug=ANY($1::text[]) AND v.provider='YOUTUBE' AND v."validationStatus"='VALIDATED' AND v."lastCheckedAt"<=$2::timestamptz AND v."lastCheckedAt">$3::timestamptz
    ORDER BY m."kickoffAt" DESC,m.id,v."selectedAsPrimary" DESC,v."publishedAt" DESC LIMIT 2`, [scope.leagueSlugs, now, new Date(now.getTime() - videoFreshMs)]);
  return {
    leagueSlug, standings: standings.rows, standingsFetchedAt: standings.fetchedAt,
    spotlight: best ? { slug: best.slug, kickoffAt: new Date(best.kickoffAt).toISOString(), round: best.round, leagueSlug, home: side(best.homeId, best.homeName, best.homeCrest), away: side(best.awayId, best.awayName, best.awayCrest) } : null,
    archive,
  };
}
