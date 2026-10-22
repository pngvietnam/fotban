import type { SqlExecutor } from "../lib/sync-database";
import type { FeedCardView } from "../types/feed-card";

export type ClubContext = {
  /** Newest stored match snapshot time for this club, so readers can judge how current the data is. */
  dataAsOf: string | null;
  clubId: string; name: string; tla: string | null; crestUrl: string | null;
  /** Results of the last five finished matches, newest first (W win, D draw, L loss). */
  form: ("W" | "D" | "L")[];
  standing: { league: string; leagueSlug: string; position: number; points: number | null; played: number | null; fetchedAt: string } | null;
  lastMatch: { slug: string; home: string; away: string; homeScore: number; awayScore: number; kickoffAt: string } | null;
  nextMatch: { slug: string; home: string; away: string; kickoffAt: string } | null;
};
const maxClubs = 2;

/** The match a story is about, with scores and crests, for the strip at the top of the story page. */
export type StoryMatch = { slug: string; status: string; kickoffAt: string; leagueSlug: string | null; home: { name: string; crestUrl: string | null; score: number | null }; away: { name: string; crestUrl: string | null; score: number | null } };
export async function storyMatch(tx: SqlExecutor, card: FeedCardView): Promise<StoryMatch | null> {
  if (!card.match) return null;
  const [row] = await tx.query<{ slug: string; status: string; kickoffAt: string; leagueSlug: string | null; home: string; away: string; homeCrest: string | null; awayCrest: string | null; homeScore: number | null; awayScore: number | null }>(
    `SELECT m.slug,m.status::text AS status,m."kickoffAt",l.slug AS "leagueSlug",hc.name AS home,ac.name AS away,hc."externalCrestUrl" AS "homeCrest",ac."externalCrestUrl" AS "awayCrest",m."homeScore",m."awayScore"
     FROM "Match" m JOIN "Club" hc ON hc.id=m."homeClubId" JOIN "Club" ac ON ac.id=m."awayClubId" LEFT JOIN "League" l ON l.id=m."leagueId" WHERE m.slug=$1`, [card.match.slug]);
  if (!row) return null;
  return { slug: row.slug, status: row.status, kickoffAt: new Date(row.kickoffAt).toISOString(), leagueSlug: row.leagueSlug, home: { name: row.home, crestUrl: row.homeCrest, score: row.homeScore }, away: { name: row.away, crestUrl: row.awayCrest, score: row.awayScore } };
}

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
    const [crest] = await tx.query<{ crest: string | null }>(`SELECT "externalCrestUrl" AS crest FROM "Club" WHERE id=$1::uuid`, [club.id]);
    const recent = await tx.query<{ home: boolean; homeScore: number; awayScore: number }>(
      `SELECT (m."homeClubId"=$1::uuid) AS home,m."homeScore",m."awayScore" FROM "Match" m WHERE (m."homeClubId"=$1::uuid OR m."awayClubId"=$1::uuid) AND m.status='FINISHED' AND m."homeScore" IS NOT NULL AND m."awayScore" IS NOT NULL AND m."kickoffAt"<=$2::timestamptz ORDER BY m."kickoffAt" DESC LIMIT 5`, [club.id, now]);
    const iso = (value: string) => new Date(value).toISOString();
    result.push({
      clubId: club.id!, name: club.name, tla: club.initials, crestUrl: crest?.crest ?? null,
      form: recent.map((row) => { const mine = row.home ? row.homeScore : row.awayScore; const theirs = row.home ? row.awayScore : row.homeScore; return mine > theirs ? "W" as const : mine < theirs ? "L" as const : "D" as const; }),
      dataAsOf: fresh?.at ? iso(fresh.at) : null,
      standing: standing ? { league: standing.league, leagueSlug: standing.slug, position: standing.position, points: standing.points, played: standing.played, fetchedAt: iso(standing.fetchedAt) } : null,
      lastMatch: last ? { ...last, kickoffAt: iso(last.kickoffAt) } : null,
      nextMatch: next ? { ...next, kickoffAt: iso(next.kickoffAt) } : null,
    });
  }
  return result;
}
