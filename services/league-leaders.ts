import type { SqlExecutor } from "../lib/sync-database";
import { FOOTBALL_DATA } from "../providers/football-data/config";
import type { Scorer, normalizeScorers } from "../providers/football-data/normalization";
import type { LeagueSlug } from "../types/league-hub";
import { playerPath } from "../lib/player-presentation";

const provider = FOOTBALL_DATA.id;
/** Scorers change after matches only; a few reads a day per league is plenty. */
export const leadersTtlMs = 6 * 3600_000;

export type ScorersApi = { getScorers(competition: string): Promise<ReturnType<typeof normalizeScorers>> };
/** A top scorer as the league page shows it: our player and club pages when the provider's ids are known. */
export type LeagueScorer = Scorer & { rank: number; playerPath: string | null; clubId: string | null; crestUrl: string | null; photoUrl: string | null };
export type LeagueLeaders = { currentMatchday: number | null; emblemUrl: string | null; scorers: LeagueScorer[]; fetchedAt: string };

/** Reads one league's scorers when the stored copy is older than the TTL; returns whether a request was made. */
export async function syncLeagueLeaders(db: SqlExecutor, api: ScorersApi, slug: LeagueSlug, now = new Date()): Promise<boolean> {
  const [row] = await db.query<{ id: string; fetchedAt: string | null }>(`SELECT l.id,ll."fetchedAt" FROM "League" l LEFT JOIN "LeagueLeaders" ll ON ll."leagueId"=l.id WHERE l.slug=$1`, [slug]);
  if (!row || (row.fetchedAt && Date.parse(row.fetchedAt) > now.getTime() - leadersTtlMs)) return false;
  const data = await api.getScorers(slug);
  await db.query(`INSERT INTO "LeagueLeaders" ("leagueId",provider,"currentMatchday","emblemUrl",scorers,"fetchedAt","updatedAt") VALUES ($1::uuid,$2,$3,$4,$5::jsonb,$6::timestamptz,$6::timestamptz)
    ON CONFLICT ("leagueId") DO UPDATE SET provider=EXCLUDED.provider,"currentMatchday"=EXCLUDED."currentMatchday","emblemUrl"=EXCLUDED."emblemUrl",scorers=EXCLUDED.scorers,"fetchedAt"=EXCLUDED."fetchedAt","updatedAt"=EXCLUDED."updatedAt"`,
    [row.id, provider, data.currentMatchday, data.emblemUrl, JSON.stringify(data.scorers), now]);
  return true;
}

/** The stored leaders of a league with players and clubs resolved to Fotban pages, or null before the first read. */
export async function readLeagueLeaders(tx: SqlExecutor, slug: LeagueSlug): Promise<LeagueLeaders | null> {
  const [row] = await tx.query<{ currentMatchday: number | null; emblemUrl: string | null; scorers: Scorer[]; fetchedAt: string }>(`SELECT ll."currentMatchday",ll."emblemUrl",ll.scorers,ll."fetchedAt" FROM "LeagueLeaders" ll JOIN "League" l ON l.id=ll."leagueId" WHERE l.slug=$1`, [slug]);
  if (!row) return null;
  const scorers = Array.isArray(row.scorers) ? row.scorers : [];
  const players = scorers.length ? await tx.query<{ externalId: string; playerId: string; photoUrl: string | null }>(`SELECT e."externalId",e."playerId",i."thumbUrl" AS "photoUrl" FROM "ExternalIdentity" e LEFT JOIN "PlayerImage" i ON i."playerId"=e."playerId" AND i.status='FOUND'
    WHERE e.provider=$1 AND e."entityType"='PLAYER' AND e."externalId"=ANY($2::text[])`, [provider, scorers.map((scorer) => scorer.playerId)]) : [];
  const clubs = scorers.length ? await tx.query<{ externalId: string; clubId: string; crestUrl: string | null }>(`SELECT e."externalId",e."clubId",c."externalCrestUrl" AS "crestUrl" FROM "ExternalIdentity" e JOIN "Club" c ON c.id=e."clubId"
    WHERE e.provider=$1 AND e."entityType"='CLUB' AND e."externalId"=ANY($2::text[])`, [provider, scorers.map((scorer) => scorer.teamId)]) : [];
  const player = new Map(players.map((item) => [item.externalId, item])); const club = new Map(clubs.map((item) => [item.externalId, item]));
  let rank = 0; let previous: number | null = null;
  return { currentMatchday: row.currentMatchday, emblemUrl: row.emblemUrl, fetchedAt: new Date(row.fetchedAt).toISOString(), scorers: scorers.map((scorer, index) => {
    // Equal goals share a rank ("1, 2, 2, 4"), as the provider lists them.
    if (scorer.goals !== previous) { rank = index + 1; previous = scorer.goals; }
    const found = player.get(scorer.playerId); const team = club.get(scorer.teamId);
    return { ...scorer, rank, playerPath: found ? playerPath(found.playerId) : null, clubId: team?.clubId ?? null, crestUrl: team?.crestUrl ?? null, photoUrl: found?.photoUrl ?? null };
  }) };
}
