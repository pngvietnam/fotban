import type { SqlExecutor } from "../lib/sync-database";

export type HotMatch = { slug: string; home: string; away: string; homeScore: number | null; awayScore: number | null; threads: number };
export type HotTopic = { kind: "club" | "player"; id: string; name: string; crestUrl: string | null; stories: number; threads: number };
export type HotNow = { matches: HotMatch[]; topics: HotTopic[] };

/** A club or player needs at least this many mentions in a day to be called hot: a thin day shows nothing rather than a weak signal. */
const minimum = 3;
const hours = 24;

/**
 * What is hot right now, counted from stored data only: finished matches fans opened threads about, and the clubs and
 * players named most in the last day's stories (one count per story, not per paper) and fan threads (counted double,
 * because a thread is a person choosing to talk about it).
 */
export async function hotNow(tx: SqlExecutor, now: Date, limits = { matches: 2, clubs: 4, players: 2 }): Promise<HotNow> {
  const matches = await tx.query<{ slug: string; home: string; away: string; homeScore: number | null; awayScore: number | null; threads: string }>(
    `SELECT m.slug,COALESCE(hc."shortName",hc.name) AS home,COALESCE(ac."shortName",ac.name) AS away,m."homeScore",m."awayScore",count(t.id) AS threads
     FROM "Match" m JOIN "Club" hc ON hc.id=m."homeClubId" JOIN "Club" ac ON ac.id=m."awayClubId" JOIN "FanThread" t ON t."matchId"=m.id AND NOT t.held
     WHERE m.status='FINISHED' AND m."kickoffAt">$1::timestamptz-interval '30 hours' AND m."kickoffAt"<=$1::timestamptz GROUP BY m.id,hc.id,ac.id ORDER BY count(t.id) DESC,m."kickoffAt" DESC LIMIT $2`, [now, limits.matches]);
  const clubs = await tx.query<{ id: string; name: string; crestUrl: string | null; stories: string; threads: string }>(
    `SELECT c.id,COALESCE(c."shortName",c.name) AS name,c."externalCrestUrl" AS "crestUrl",
       (SELECT count(DISTINCT f."groupKey") FROM "ArticleEntity" e JOIN "Article" a ON a.id=e."articleId" JOIN "FeedCard" f ON f."articleId"=a.id WHERE e."clubId"=c.id AND f.status='PUBLISHED' AND a."publishedAt">$1::timestamptz-interval '${hours} hours' AND a."publishedAt"<=$1::timestamptz) AS stories,
       (SELECT count(*) FROM "FanThread" t WHERE NOT t.held AND c.id=ANY(t."clubIds") AND t."lastActivityAt">$1::timestamptz-interval '${hours} hours') AS threads
     FROM "Club" c WHERE EXISTS (SELECT 1 FROM "ArticleEntity" e WHERE e."clubId"=c.id) OR EXISTS (SELECT 1 FROM "FanThread" t WHERE c.id=ANY(t."clubIds"))`, [now]);
  const players = await tx.query<{ id: string; name: string; stories: string; threads: string }>(
    `SELECT p.id,p.name,
       (SELECT count(DISTINCT f."groupKey") FROM "ArticleEntity" e JOIN "Article" a ON a.id=e."articleId" JOIN "FeedCard" f ON f."articleId"=a.id WHERE e."playerId"=p.id AND f.status='PUBLISHED' AND a."publishedAt">$1::timestamptz-interval '${hours} hours' AND a."publishedAt"<=$1::timestamptz) AS stories,
       (SELECT count(*) FROM "FanThread" t WHERE NOT t.held AND p.id=ANY(t."playerIds") AND t."lastActivityAt">$1::timestamptz-interval '${hours} hours') AS threads
     FROM "Player" p WHERE EXISTS (SELECT 1 FROM "ArticleEntity" e WHERE e."playerId"=p.id) OR EXISTS (SELECT 1 FROM "FanThread" t WHERE p.id=ANY(t."playerIds"))`, [now]);
  const topic = (kind: HotTopic["kind"]) => (row: { id: string; name: string; crestUrl?: string | null; stories: string; threads: string }): HotTopic => ({ kind, id: row.id, name: row.name, crestUrl: row.crestUrl ?? null, stories: Number(row.stories), threads: Number(row.threads) });
  const score = (item: HotTopic) => item.stories + 2 * item.threads;
  const rank = (items: HotTopic[], limit: number) => items.filter((item) => item.stories + item.threads >= minimum).sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name)).slice(0, limit);
  return {
    matches: matches.map((row) => ({ slug: row.slug, home: row.home, away: row.away, homeScore: row.homeScore, awayScore: row.awayScore, threads: Number(row.threads) })),
    topics: [...rank(clubs.map(topic("club")), limits.clubs), ...rank(players.map(topic("player")), limits.players)],
  };
}
