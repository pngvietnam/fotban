import type { SqlExecutor } from "../lib/sync-database";
import type { FeedCardView } from "../types/feed-card";

export type ClubContext = {
  /** Newest stored match snapshot time for this club, so readers can judge how current the data is. */
  dataAsOf: string | null;
  clubId: string; name: string; tla: string | null;
  standing: { league: string; leagueSlug: string; position: number; points: number | null; played: number | null; fetchedAt: string } | null;
  lastMatch: { slug: string; home: string; away: string; homeScore: number; awayScore: number; kickoffAt: string } | null;
  nextMatch: { slug: string; home: string; away: string; kickoffAt: string } | null;
};
const maxClubs = 2;

/**
 * Stored-data context for the clubs a card links to: league position, last finished result and
 * next fixture. Nothing is estimated; a missing piece is simply absent. Postponed or cancelled
 * fixtures are never shown as results or upcoming matches.
 */
export async function clubContexts(tx: SqlExecutor, card: FeedCardView, now: Date): Promise<ClubContext[]> {
  const clubs = card.entities.filter((entity) => entity.kind === "club" && entity.id).slice(0, maxClubs);
  const result: ClubContext[] = [];
  for (const club of clubs) {
    const [standing] = await tx.query<{ league: string; slug: string; position: number; points: number | null; played: number | null; fetchedAt: string }>(
      `SELECT l.name AS league,l.slug,st.position,st.points,st."playedGames" AS played,st."fetchedAt" FROM "Standing" st JOIN "League" l ON l.id=st."leagueId" JOIN "Season" s ON s.id=st."seasonId"
       WHERE st."clubId"=$1::uuid AND st."tableType"='TOTAL' AND $2::timestamptz BETWEEN s."startsAt" AND s."endsAt" ORDER BY st."fetchedAt" DESC LIMIT 1`, [club.id, now]);
    const [last] = await tx.query<{ slug: string; home: string; away: string; homeScore: number; awayScore: number; kickoffAt: string }>(
      `SELECT m.slug,hc.name AS home,ac.name AS away,m."homeScore",m."awayScore",m."kickoffAt" FROM "Match" m JOIN "Club" hc ON hc.id=m."homeClubId" JOIN "Club" ac ON ac.id=m."awayClubId"
       WHERE (m."homeClubId"=$1::uuid OR m."awayClubId"=$1::uuid) AND m.status='FINISHED' AND m."homeScore" IS NOT NULL AND m."awayScore" IS NOT NULL AND m."kickoffAt"<=$2::timestamptz ORDER BY m."kickoffAt" DESC LIMIT 1`, [club.id, now]);
    const [next] = await tx.query<{ slug: string; home: string; away: string; kickoffAt: string }>(
      `SELECT m.slug,hc.name AS home,ac.name AS away,m."kickoffAt" FROM "Match" m JOIN "Club" hc ON hc.id=m."homeClubId" JOIN "Club" ac ON ac.id=m."awayClubId"
       WHERE (m."homeClubId"=$1::uuid OR m."awayClubId"=$1::uuid) AND m.status IN ('SCHEDULED','LIVE','HALFTIME') AND m."kickoffAt">$2::timestamptz-interval '3 hours' ORDER BY m."kickoffAt" LIMIT 1`, [club.id, now]);
    const [fresh] = await tx.query<{ at: string | null }>(`SELECT max(m."lastUpdatedAt") AS at FROM "Match" m WHERE m."homeClubId"=$1::uuid OR m."awayClubId"=$1::uuid`, [club.id]);
    const iso = (value: string) => new Date(value).toISOString();
    result.push({
      clubId: club.id!, name: club.name, tla: club.initials, dataAsOf: fresh?.at ? iso(fresh.at) : null,
      standing: standing ? { league: standing.league, leagueSlug: standing.slug, position: standing.position, points: standing.points, played: standing.played, fetchedAt: iso(standing.fetchedAt) } : null,
      lastMatch: last ? { ...last, kickoffAt: iso(last.kickoffAt) } : null,
      nextMatch: next ? { ...next, kickoffAt: iso(next.kickoffAt) } : null,
    });
  }
  return result;
}
