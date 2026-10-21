import type { SqlExecutor } from "../lib/sync-database";
import { leagueLinks } from "../lib/league-presentation";
import { clubPath } from "../lib/club-presentation";
import { playerPath } from "../lib/player-presentation";
import type { FollowedEntity } from "./following";

export type CatalogItem = Omit<FollowedEntity, "following"> & { detail: string | null; href: string };

/** What a reader can follow: the four leagues, their current clubs, and players found by name. Only entities already in the data. */
export async function followCatalog(tx: SqlExecutor, now: Date, search = ""): Promise<CatalogItem[]> {
  const term = search.trim().slice(0, 80);
  const [leagues, clubs, players] = await Promise.all([
    tx.query<{ id: string; slug: string; name: string }>(`SELECT id,slug,name FROM "League" WHERE slug=ANY($1::text[])`, [leagueLinks.map((league) => league.slug)]),
    tx.query<{ id: string; name: string; crest: string | null; league: string }>(
      `SELECT DISTINCT ON (c.id) c.id,c.name,c."externalCrestUrl" AS crest,l.name AS league FROM "ClubSeason" cs JOIN "Club" c ON c.id=cs."clubId" JOIN "League" l ON l.id=cs."leagueId" JOIN "Season" s ON s.id=cs."seasonId"
       WHERE l.slug IN ('premier-league','la-liga','ligue-1') AND $1::timestamptz BETWEEN s."startsAt" AND s."endsAt" ORDER BY c.id,c.name`, [now]),
    term ? tx.query<{ id: string; name: string; club: string | null }>(
      `SELECT p.id,p.name,(SELECT c.name FROM "PlayerClub" pc JOIN "Club" c ON c.id=pc."clubId" WHERE pc."playerId"=p.id ORDER BY pc."updatedAt" DESC LIMIT 1) AS club FROM "Player" p
       WHERE strpos(lower(p.name),lower($1))>0 OR EXISTS (SELECT 1 FROM unnest(p.aliases) a WHERE strpos(lower(a),lower($1))>0) ORDER BY p.name LIMIT 20`, [term]) : Promise.resolve([]),
  ]);
  const order = new Map(leagueLinks.map((league, index) => [league.slug, index]));
  return [
    ...leagues.sort((a, b) => (order.get(a.slug as never) ?? 9) - (order.get(b.slug as never) ?? 9)).map((row): CatalogItem => ({ type: "COMPETITION", entityId: row.id, name: leagueLinks.find((league) => league.slug === row.slug)?.label ?? row.name, detail: "Giải đấu", href: `/league/${row.slug}` })),
    ...clubs.sort((a, b) => a.name.localeCompare(b.name, "vi")).map((row): CatalogItem => ({ type: "CLUB", entityId: row.id, name: row.name, crestUrl: row.crest, detail: row.league, href: clubPath(row.id) })),
    ...players.map((row): CatalogItem => ({ type: "PLAYER", entityId: row.id, name: row.name, detail: row.club, href: playerPath(row.id) })),
  ];
}
