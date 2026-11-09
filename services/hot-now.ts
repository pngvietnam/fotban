import type { SqlExecutor } from "../lib/sync-database";

/**
 * `comments` counts stored YouTube comments ("bình luận fan"). `threads` is the same number under its old name, kept only
 * until the homepage strip reads `comments`.
 */
export type HotMatch = { slug: string; home: string; away: string; homeScore: number | null; awayScore: number | null; comments: number; /** @deprecated Read `comments`. */ threads: number };
export type HotTopic = { kind: "club" | "player"; id: string; name: string; crestUrl: string | null; stories: number; comments: number; /** @deprecated Read `comments`. */ threads: number };
export type HotNow = { matches: HotMatch[]; topics: HotTopic[] };

/** A club or player needs a score of at least this in a day to be called hot: a thin day shows nothing rather than a weak signal. */
const minimum = 3;
/** Fan comments that weigh as much as one story: a comment costs a fan less than a paper's story costs a newsroom. */
const commentsPerStory = 5;
const hours = 24;
const kept = `c."fetchedAt">$1::timestamptz-interval '30 days'`;

/**
 * What is hot right now, counted from stored data only: finished matches with fan comments under their highlight videos,
 * and the clubs and players named most in the last day's stories (one count per story, not per paper) and in fan comments
 * written in the last day (five comments count as one story).
 */
export async function hotNow(tx: SqlExecutor, now: Date, limits = { matches: 2, clubs: 4, players: 2 }): Promise<HotNow> {
  const matches = await tx.query<{ slug: string; home: string; away: string; homeScore: number | null; awayScore: number | null; comments: string }>(
    `SELECT m.slug,COALESCE(hc."shortName",hc.name) AS home,COALESCE(ac."shortName",ac.name) AS away,m."homeScore",m."awayScore",count(c.id) AS comments
     FROM "Match" m JOIN "Club" hc ON hc.id=m."homeClubId" JOIN "Club" ac ON ac.id=m."awayClubId" JOIN "Video" v ON v."matchId"=m.id AND v."validationStatus"='VALIDATED' JOIN "VideoComment" c ON c."videoId"=v.id AND ${kept}
     WHERE m.status='FINISHED' AND m."kickoffAt">$1::timestamptz-interval '30 hours' AND m."kickoffAt"<=$1::timestamptz GROUP BY m.id,hc.id,ac.id ORDER BY count(c.id) DESC,m."kickoffAt" DESC LIMIT $2`, [now, limits.matches]);
  const recent = `${kept} AND c."publishedAt">$1::timestamptz-interval '${hours} hours' AND c."publishedAt"<=$1::timestamptz`;
  const clubs = await tx.query<{ id: string; name: string; crestUrl: string | null; stories: string; comments: string }>(
    `SELECT c0.id,COALESCE(c0."shortName",c0.name) AS name,c0."externalCrestUrl" AS "crestUrl",
       (SELECT count(DISTINCT f."groupKey") FROM "ArticleEntity" e JOIN "Article" a ON a.id=e."articleId" JOIN "FeedCard" f ON f."articleId"=a.id WHERE e."clubId"=c0.id AND f.status='PUBLISHED' AND a."publishedAt">$1::timestamptz-interval '${hours} hours' AND a."publishedAt"<=$1::timestamptz) AS stories,
       (SELECT count(*) FROM "VideoComment" c WHERE c0.id=ANY(c."clubIds") AND ${recent}) AS comments
     FROM "Club" c0 WHERE EXISTS (SELECT 1 FROM "ArticleEntity" e WHERE e."clubId"=c0.id) OR EXISTS (SELECT 1 FROM "VideoComment" c WHERE c0.id=ANY(c."clubIds"))`, [now]);
  const players = await tx.query<{ id: string; name: string; stories: string; comments: string }>(
    `SELECT p.id,p.name,
       (SELECT count(DISTINCT f."groupKey") FROM "ArticleEntity" e JOIN "Article" a ON a.id=e."articleId" JOIN "FeedCard" f ON f."articleId"=a.id WHERE e."playerId"=p.id AND f.status='PUBLISHED' AND a."publishedAt">$1::timestamptz-interval '${hours} hours' AND a."publishedAt"<=$1::timestamptz) AS stories,
       (SELECT count(*) FROM "VideoComment" c WHERE p.id=ANY(c."playerIds") AND ${recent}) AS comments
     FROM "Player" p WHERE EXISTS (SELECT 1 FROM "ArticleEntity" e WHERE e."playerId"=p.id) OR EXISTS (SELECT 1 FROM "VideoComment" c WHERE p.id=ANY(c."playerIds"))`, [now]);
  const topic = (kind: HotTopic["kind"]) => (row: { id: string; name: string; crestUrl?: string | null; stories: string; comments: string }): HotTopic => ({ kind, id: row.id, name: row.name, crestUrl: row.crestUrl ?? null, stories: Number(row.stories), comments: Number(row.comments), threads: Number(row.comments) });
  const score = (item: HotTopic) => item.stories + item.comments / commentsPerStory;
  const rank = (items: HotTopic[], limit: number) => items.filter((item) => score(item) >= minimum).sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name)).slice(0, limit);
  return {
    matches: matches.map((row) => ({ slug: row.slug, home: row.home, away: row.away, homeScore: row.homeScore, awayScore: row.awayScore, comments: Number(row.comments), threads: Number(row.comments) })),
    topics: [...rank(clubs.map(topic("club")), limits.clubs), ...rank(players.map(topic("player")), limits.players)],
  };
}
