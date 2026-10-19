import type { SqlExecutor } from "../lib/sync-database";
import { isLeagueSlug, leagueNames } from "./league-hub";

export type PlayerProfile = {
  playerId: string; slug: string; name: string; position: string | null; nationality: string | null; birthDate: string | null; dataAsOf: string;
  club: { clubId: string; slug: string; name: string; tla: string | null; leagueName: string };
};
export const playerIdFromSlug = (slug: string) => /^player-([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/.exec(slug)?.[1] ?? null;

/** A player page exists only while the provider lists the player in a current EPL/La Liga squad. */
export async function playerProfile(tx: SqlExecutor, slug: string, now: Date): Promise<PlayerProfile | null> {
  const [row] = await tx.query<{ id: string; slug: string; name: string; position: string | null; nationality: string | null; birthDate: string | null; updatedAt: string; clubId: string; clubSlug: string; clubName: string; tla: string | null; leagueSlug: string }>(
    `SELECT p.id,p.slug,p.name,p.position,p.nationality,to_char(p."birthDate",'YYYY-MM-DD') AS "birthDate",p."updatedAt",c.id AS "clubId",c.slug AS "clubSlug",c.name AS "clubName",c.tla,l.slug AS "leagueSlug"
     FROM "Player" p JOIN "PlayerClub" pc ON pc."playerId"=p.id AND pc."endsAt" IS NULL JOIN "Club" c ON c.id=pc."clubId" JOIN "ClubSeason" cs ON cs."clubId"=c.id JOIN "Season" s ON s.id=cs."seasonId" JOIN "League" l ON l.id=cs."leagueId"
     WHERE p.slug=$1 AND $2::timestamptz BETWEEN s."startsAt" AND s."endsAt" AND l.slug IN ('premier-league','la-liga') ORDER BY pc."startsAt" DESC LIMIT 1`, [slug, now]);
  if (!row || !isLeagueSlug(row.leagueSlug)) return null;
  return { playerId: row.id, slug: row.slug, name: row.name, position: row.position, nationality: row.nationality, birthDate: row.birthDate, dataAsOf: new Date(row.updatedAt).toISOString(),
    club: { clubId: row.clubId, slug: row.clubSlug, name: row.clubName, tla: row.tla, leagueName: leagueNames[row.leagueSlug].name } };
}
