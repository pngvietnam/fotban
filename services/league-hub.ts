import type { SqlExecutor } from "../lib/sync-database";
import type { ClubRow, FixtureRow, LeagueInfo, LeagueSlug, StandingRow, StandingsData } from "../types/league-hub";

export const leagueNames: Record<LeagueSlug, { name: string; country: string }> = {
  "premier-league": { name: "Ngoại hạng Anh", country: "Anh" },
  "la-liga": { name: "La Liga", country: "Tây Ban Nha" },
};
export const isLeagueSlug = (value: string): value is LeagueSlug => Object.hasOwn(leagueNames, value);

/** Current season of a league: the stored season containing `now`, else the latest one. */
export async function leagueInfo(tx: SqlExecutor, slug: LeagueSlug, now: Date): Promise<LeagueInfo | null> {
  const [league] = await tx.query<{ id: string }>('SELECT id FROM "League" WHERE slug=$1', [slug]);
  if (!league) return null;
  const [season] = await tx.query<{ name: string }>('SELECT name FROM "Season" WHERE "leagueId"=$1::uuid ORDER BY ($2::timestamptz BETWEEN "startsAt" AND "endsAt") DESC,"startsAt" DESC LIMIT 1', [league.id, now]);
  return { slug, ...leagueNames[slug], seasonName: season?.name ?? null };
}

/** Stored standings (TOTAL table) with form computed from finished matches in the same league. */
export async function leagueStandings(tx: SqlExecutor, slug: LeagueSlug, now: Date): Promise<StandingsData> {
  const rows = await tx.query<{ position: number; clubId: string; name: string; shortName: string | null; tla: string | null; crestUrl: string | null; played: number | null; won: number | null; drawn: number | null; lost: number | null; goalsFor: number | null; goalsAgainst: number | null; goalDifference: number | null; points: number | null; fetchedAt: string }>(
    `SELECT st.position,c.id AS "clubId",c.name,c."shortName",c.tla,c."externalCrestUrl" AS "crestUrl",st."playedGames" AS played,st.won,st.drawn,st.lost,st."goalsFor",st."goalsAgainst",st."goalDifference",st.points,st."fetchedAt"
     FROM "Standing" st JOIN "Club" c ON c.id=st."clubId" JOIN "League" l ON l.id=st."leagueId" JOIN "Season" s ON s.id=st."seasonId"
     WHERE l.slug=$1 AND st."tableType"='TOTAL' AND s.id=(SELECT se.id FROM "Season" se WHERE se."leagueId"=l.id AND EXISTS(SELECT 1 FROM "Standing" x WHERE x."seasonId"=se.id) ORDER BY ($2::timestamptz BETWEEN se."startsAt" AND se."endsAt") DESC,se."startsAt" DESC LIMIT 1)
     ORDER BY st.position,c.name`, [slug, now]);
  const forms = await tx.query<{ clubId: string; form: ("W" | "D" | "L")[] }>(
    `SELECT club_id AS "clubId",array_agg(res ORDER BY kickoff) AS form FROM (
       SELECT club_id,res,kickoff,row_number() OVER (PARTITION BY club_id ORDER BY kickoff DESC) AS rn FROM (
         SELECT m."homeClubId" AS club_id,m."kickoffAt" AS kickoff,CASE WHEN m."homeScore">m."awayScore" THEN 'W' WHEN m."homeScore"<m."awayScore" THEN 'L' ELSE 'D' END AS res
           FROM "Match" m JOIN "League" l ON l.id=m."leagueId" WHERE l.slug=$1 AND m.status='FINISHED' AND m."homeScore" IS NOT NULL AND m."awayScore" IS NOT NULL AND m."kickoffAt"<=$2::timestamptz
         UNION ALL
         SELECT m."awayClubId",m."kickoffAt",CASE WHEN m."awayScore">m."homeScore" THEN 'W' WHEN m."awayScore"<m."homeScore" THEN 'L' ELSE 'D' END
           FROM "Match" m JOIN "League" l ON l.id=m."leagueId" WHERE l.slug=$1 AND m.status='FINISHED' AND m."homeScore" IS NOT NULL AND m."awayScore" IS NOT NULL AND m."kickoffAt"<=$2::timestamptz) r) ranked
     WHERE rn<=5 GROUP BY club_id`, [slug, now]);
  const byClub = new Map(forms.map((row) => [row.clubId, row.form]));
  const mapped: StandingRow[] = rows.map((row) => ({ position: row.position, clubId: row.clubId, name: row.name, shortName: row.shortName, tla: row.tla, crestUrl: row.crestUrl, played: row.played, won: row.won, drawn: row.drawn, lost: row.lost, goalsFor: row.goalsFor, goalsAgainst: row.goalsAgainst, goalDifference: row.goalDifference, points: row.points, form: byClub.get(row.clubId) ?? [] }));
  const newest = rows.map((row) => new Date(row.fetchedAt).getTime()).filter(Number.isFinite);
  return { rows: mapped, fetchedAt: newest.length ? new Date(Math.max(...newest)).toISOString() : null };
}

/** Matches whose kickoff falls in [from, to); postponed/cancelled stay visible with their real status. */
export async function leagueFixtures(tx: SqlExecutor, slug: LeagueSlug, from: Date, to: Date): Promise<FixtureRow[]> {
  const rows = await tx.query<{ slug: string; kickoffAt: string; status: string; round: string | null; homeName: string; homeTla: string | null; homeCrest: string | null; awayName: string; awayTla: string | null; awayCrest: string | null; homeScore: number | null; awayScore: number | null }>(
    `SELECT m.slug,m."kickoffAt",m.status,m.round,hc.name AS "homeName",hc.tla AS "homeTla",hc."externalCrestUrl" AS "homeCrest",ac.name AS "awayName",ac.tla AS "awayTla",ac."externalCrestUrl" AS "awayCrest",m."homeScore",m."awayScore"
     FROM "Match" m JOIN "League" l ON l.id=m."leagueId" JOIN "Club" hc ON hc.id=m."homeClubId" JOIN "Club" ac ON ac.id=m."awayClubId"
     WHERE l.slug=$1 AND m."kickoffAt">=$2::timestamptz AND m."kickoffAt"<$3::timestamptz ORDER BY m."kickoffAt",m.id LIMIT 200`, [slug, from, to]);
  return rows.map((row) => ({ slug: row.slug, kickoffAt: new Date(row.kickoffAt).toISOString(), status: row.status, round: row.round, home: { name: row.homeName, tla: row.homeTla, crestUrl: row.homeCrest }, away: { name: row.awayName, tla: row.awayTla, crestUrl: row.awayCrest }, homeScore: row.homeScore, awayScore: row.awayScore }));
}

/** Next scheduled/live matches from now (for the overview). */
export async function leagueUpcoming(tx: SqlExecutor, slug: LeagueSlug, now: Date, limit = 4): Promise<FixtureRow[]> {
  const rows = await leagueFixtures(tx, slug, new Date(now.getTime() - 3 * 3600000), new Date(now.getTime() + 21 * 86400000));
  return rows.filter((row) => ["SCHEDULED", "LIVE", "HALFTIME"].includes(row.status)).slice(0, limit);
}

/** Clubs of the league's current season with their stored table position. */
export async function leagueClubs(tx: SqlExecutor, slug: LeagueSlug, now: Date): Promise<ClubRow[]> {
  return tx.query<ClubRow>(
    `SELECT c.id AS "clubId",c.name,c."shortName",c.tla,c."externalCrestUrl" AS "crestUrl",st.position,st.points FROM "ClubSeason" cs JOIN "Club" c ON c.id=cs."clubId" JOIN "League" l ON l.id=cs."leagueId" JOIN "Season" s ON s.id=cs."seasonId"
     LEFT JOIN "Standing" st ON st."clubId"=c.id AND st."seasonId"=s.id AND st."tableType"='TOTAL'
     WHERE l.slug=$1 AND $2::timestamptz BETWEEN s."startsAt" AND s."endsAt" ORDER BY st.position NULLS LAST,c.name`, [slug, now]);
}
