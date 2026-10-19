import type { SqlExecutor } from "../lib/sync-database";
import type { FixtureRow, LeagueSlug } from "../types/league-hub";
import { isLeagueSlug } from "./league-hub";
import type { FollowedEntity } from "./following";

export type FollowSummary = {
  clubs: { id: string; name: string }[]; players: { id: string; name: string }[]; leagues: { id: string; slug: LeagueSlug; name: string }[];
  /** IDs and slugs for the feed filter. */
  entityIds: string[]; leagueSlugs: string[];
};
export type FollowFixtures = { upcoming: FixtureRow[]; recent: FixtureRow[] };

/** Splits the user's follows by kind and resolves followed competitions to their slugs. */
export async function summarizeFollows(tx: SqlExecutor, follows: FollowedEntity[]): Promise<FollowSummary> {
  const clubs = follows.filter((item) => item.type === "CLUB").map((item) => ({ id: item.entityId, name: item.name }));
  const players = follows.filter((item) => item.type === "PLAYER").map((item) => ({ id: item.entityId, name: item.name }));
  const leagueIds = follows.filter((item) => item.type === "COMPETITION").map((item) => item.entityId);
  const rows = leagueIds.length ? await tx.query<{ id: string; slug: string; name: string }>('SELECT id,slug,name FROM "League" WHERE id=ANY($1::uuid[])', [leagueIds]) : [];
  const leagues = rows.flatMap((row) => isLeagueSlug(row.slug) ? [{ id: row.id, slug: row.slug, name: row.name }] : []);
  return { clubs, players, leagues, entityIds: [...clubs, ...players].map((item) => item.id), leagueSlugs: leagues.map((league) => league.slug) };
}

/** Next and last matches of the followed clubs, newest results first and soonest fixtures first. */
export async function followFixtures(tx: SqlExecutor, clubIds: string[], now: Date, limit = 6): Promise<FollowFixtures> {
  if (!clubIds.length) return { upcoming: [], recent: [] };
  type Row = { slug: string; kickoffAt: string; status: string; round: string | null; homeName: string; homeTla: string | null; awayName: string; awayTla: string | null; homeScore: number | null; awayScore: number | null };
  const select = `SELECT m.slug,m."kickoffAt",m.status,m.round,hc.name AS "homeName",hc.tla AS "homeTla",ac.name AS "awayName",ac.tla AS "awayTla",m."homeScore",m."awayScore" FROM "Match" m JOIN "Club" hc ON hc.id=m."homeClubId" JOIN "Club" ac ON ac.id=m."awayClubId" WHERE (m."homeClubId"=ANY($1::uuid[]) OR m."awayClubId"=ANY($1::uuid[]))`;
  const map = (row: Row): FixtureRow => ({ slug: row.slug, kickoffAt: new Date(row.kickoffAt).toISOString(), status: row.status, round: row.round, home: { name: row.homeName, tla: row.homeTla }, away: { name: row.awayName, tla: row.awayTla }, homeScore: row.homeScore, awayScore: row.awayScore });
  const upcoming = await tx.query<Row>(`${select} AND m.status NOT IN ('FINISHED','CANCELLED') AND m."kickoffAt">$2::timestamptz-interval '3 hours' ORDER BY m."kickoffAt",m.id LIMIT $3`, [clubIds, now, limit]);
  const recent = await tx.query<Row>(`${select} AND m.status='FINISHED' AND m."homeScore" IS NOT NULL AND m."awayScore" IS NOT NULL AND m."kickoffAt"<=$2::timestamptz ORDER BY m."kickoffAt" DESC,m.id LIMIT $3`, [clubIds, now, limit]);
  return { upcoming: upcoming.map(map), recent: recent.map(map) };
}
