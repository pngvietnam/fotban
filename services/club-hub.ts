import type { SqlExecutor } from "../lib/sync-database";
import type { ClubFixtures, ClubProfile, ClubStanding, SquadPlayer } from "../types/club-hub";
import type { LeagueSlug } from "../types/league-hub";
import { isLeagueSlug, leagueNames, leagueStandings } from "./league-hub";

export const clubIdFromSlug = (slug: string) => /^club-([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/.exec(slug)?.[1] ?? null;
export const clubSlug = (clubId: string) => `club-${clubId}`;

/** A club page exists only for clubs in a current EPL/La Liga season; others are not-found. */
export async function clubProfile(tx: SqlExecutor, slug: string, now: Date): Promise<ClubProfile | null> {
  const [row] = await tx.query<{ id: string; slug: string; name: string; shortName: string | null; tla: string | null; crestUrl: string | null; venue: string | null; country: string | null; leagueSlug: string; seasonName: string }>(
    `SELECT c.id,c.slug,c.name,c."shortName",c.tla,c."externalCrestUrl" AS "crestUrl",c.venue,c.country,l.slug AS "leagueSlug",s.name AS "seasonName" FROM "Club" c JOIN "ClubSeason" cs ON cs."clubId"=c.id JOIN "League" l ON l.id=cs."leagueId" JOIN "Season" s ON s.id=cs."seasonId"
     WHERE c.slug=$1 AND $2::timestamptz BETWEEN s."startsAt" AND s."endsAt" AND l.slug IN ('premier-league','la-liga') LIMIT 1`, [slug, now]);
  if (!row || !isLeagueSlug(row.leagueSlug)) return null;
  return { clubId: row.id, slug: row.slug, name: row.name, shortName: row.shortName, tla: row.tla, crestUrl: row.crestUrl, venue: row.venue, country: row.country, league: { slug: row.leagueSlug, name: leagueNames[row.leagueSlug].name, seasonName: row.seasonName } };
}
export async function clubStanding(tx: SqlExecutor, club: ClubProfile, now: Date): Promise<ClubStanding | null> {
  if (!club.league) return null;
  const table = await leagueStandings(tx, club.league.slug as LeagueSlug, now);
  const row = table.rows.find((item) => item.clubId === club.clubId);
  return row ? { row, fetchedAt: table.fetchedAt } : null;
}
/** Last five finished matches and the next five (postponed ones stay visible with their real status). */
export async function clubFixtures(tx: SqlExecutor, clubId: string, now: Date): Promise<ClubFixtures> {
  type Row = { slug: string; kickoffAt: string; status: string; round: string | null; homeName: string; homeTla: string | null; homeCrest: string | null; awayName: string; awayTla: string | null; awayCrest: string | null; homeScore: number | null; awayScore: number | null };
  const select = `SELECT m.slug,m."kickoffAt",m.status,m.round,hc.name AS "homeName",hc.tla AS "homeTla",hc."externalCrestUrl" AS "homeCrest",ac.name AS "awayName",ac.tla AS "awayTla",ac."externalCrestUrl" AS "awayCrest",m."homeScore",m."awayScore" FROM "Match" m JOIN "Club" hc ON hc.id=m."homeClubId" JOIN "Club" ac ON ac.id=m."awayClubId" WHERE (m."homeClubId"=$1::uuid OR m."awayClubId"=$1::uuid)`;
  const map = (row: Row) => ({ slug: row.slug, kickoffAt: new Date(row.kickoffAt).toISOString(), status: row.status, round: row.round, home: { name: row.homeName, tla: row.homeTla, crestUrl: row.homeCrest }, away: { name: row.awayName, tla: row.awayTla, crestUrl: row.awayCrest }, homeScore: row.homeScore, awayScore: row.awayScore });
  const recent = await tx.query<Row>(`${select} AND m.status='FINISHED' AND m."homeScore" IS NOT NULL AND m."awayScore" IS NOT NULL AND m."kickoffAt"<=$2::timestamptz ORDER BY m."kickoffAt" DESC,m.id LIMIT 5`, [clubId, now]);
  const upcoming = await tx.query<Row>(`${select} AND m.status<>'FINISHED' AND m.status<>'CANCELLED' AND m."kickoffAt">$2::timestamptz-interval '3 hours' ORDER BY m."kickoffAt",m.id LIMIT 5`, [clubId, now]);
  return { recent: recent.map(map), upcoming: upcoming.map(map) };
}
const groups: [string, RegExp][] = [["Thủ môn", /goalkeeper/i], ["Hậu vệ", /defen|back/i], ["Tiền vệ", /midfield/i], ["Tiền đạo", /offence|forward|winger|striker/i]];
export const positionGroup = (position: string | null) => groups.find(([, pattern]) => position && pattern.test(position))?.[0] ?? "Khác";
export const positionOrder = [...groups.map(([name]) => name), "Khác"];
/** Current squad: open PlayerClub memberships, as last listed by the data provider. */
export async function clubSquad(tx: SqlExecutor, clubId: string): Promise<SquadPlayer[]> {
  return tx.query<SquadPlayer>(`SELECT p.id AS "playerId",p.name,p.position,p.nationality,i."thumbUrl" AS "photoUrl" FROM "PlayerClub" pc JOIN "Player" p ON p.id=pc."playerId" LEFT JOIN "PlayerImage" i ON i."playerId"=p.id AND i.status='FOUND' WHERE pc."clubId"=$1::uuid AND pc."endsAt" IS NULL ORDER BY p.name,p.id LIMIT 80`, [clubId]);
}
