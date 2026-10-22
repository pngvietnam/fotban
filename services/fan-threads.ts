import { randomUUID } from "node:crypto";
import { crudeWords, fanKind, footballWords, notTalk, parseRedditAtom, parseVozRss, sensitiveEnglish, type FanItem } from "../lib/fan-feeds";
import { holdReasons } from "../lib/feed-card-policy";
import type { SqlExecutor, SyncDatabase } from "../lib/sync-database";
import { resolveEntities } from "../providers/ai/rules";
import { vietnameseCatalogFrom } from "./vietnamese-catalog";

const hour = 3_600_000;
/** What a feed reader returns: the raw feed text, or null when the community did not answer (rate limited, down). */
export type FanReader = { voz(): Promise<string | null>; reddit(): Promise<string | null> };
const userAgent = "FotbanCommunity/1.0 (Vietnamese football site; links to public threads, titles and counts only)";
async function fetchText(url: string) {
  try {
    const response = await fetch(url, { headers: { "User-Agent": userAgent, Accept: "application/rss+xml, application/atom+xml, application/xml" }, signal: AbortSignal.timeout(15_000) });
    return response.ok ? await response.text() : null;
  } catch { return null; }
}
/** The live readers: Voz's sport forum feed and r/soccer's hot posts, both public feeds. */
export const liveFanReader: FanReader = {
  voz: () => fetchText("https://voz.vn/f/the-duc-the-thao.63/index.rss"),
  reddit: () => fetchText("https://www.reddit.com/r/soccer/hot.rss?limit=40"),
};

/** The match two clubs play within two days of a thread's activity (a match thread or a talk about it). */
async function matchBetween(tx: SqlExecutor, clubIds: string[], at: string) {
  if (clubIds.length < 2) return null;
  const rows = await tx.query<{ id: string }>(`SELECT id FROM "Match" WHERE "homeClubId"=ANY($1::uuid[]) AND "awayClubId"=ANY($1::uuid[]) AND "kickoffAt" BETWEEN $2::timestamptz-interval '48 hours' AND $2::timestamptz+interval '48 hours' ORDER BY abs(extract(epoch FROM ("kickoffAt"-$2::timestamptz))),id LIMIT 1`, [clubIds, at]);
  return rows[0]?.id ?? null;
}

/**
 * Reads both communities and keeps the football threads: each is matched to clubs, players, leagues and a match from its
 * title, held back when its title is crude or a heavy topic, and its reply count is recorded once an hour so the page can
 * say how lively it is. Returns how many threads were seen and kept per source.
 */
export async function syncFanThreads(db: SyncDatabase, reader: FanReader, now = new Date()) {
  const [vozText, redditText] = await Promise.all([reader.voz(), reader.reddit()]);
  const items: FanItem[] = [...(vozText ? parseVozRss(vozText) : []), ...(redditText ? parseRedditAtom(redditText) : [])];
  const counts = { seen: items.length, kept: 0, voz: vozText !== null, reddit: redditText !== null };
  if (!items.length) return counts;
  await db.transaction(async (tx) => {
    const catalog = await vietnameseCatalogFrom(tx);
    for (const item of items) {
      if (notTalk.test(item.title)) continue;
      const entities = resolveEntities(item.title, catalog).filter((entity) => entity.kind !== "match");
      // r/soccer is all football; the Voz sport forum also has MotoGP, billiards and gym threads.
      if (item.source === "VOZ" && !entities.length && !footballWords.test(item.title)) continue;
      const clubIds = entities.filter((entity) => entity.kind === "club").map((entity) => entity.id);
      const playerIds = entities.filter((entity) => entity.kind === "player").map((entity) => entity.id);
      const leagueIds = entities.filter((entity) => entity.kind === "league").map((entity) => entity.id);
      const kind = fanKind(item, clubIds.length);
      const held = crudeWords.test(item.title) || sensitiveEnglish.test(item.title) || holdReasons(item.title).length > 0;
      const matchId = kind === "MATCH" || clubIds.length === 2 ? await matchBetween(tx, clubIds, item.lastActivityAt) : null;
      const [row] = await tx.query<{ id: string }>(`INSERT INTO "FanThread" (id,source,"externalId",url,title,community,kind,replies,"lastActivityAt","firstSeenAt","lastSeenAt","clubIds","playerIds","leagueIds","matchId",held)
        VALUES ($1::uuid,$2,$3,$4,$5,$6,$7,$8,$9::timestamptz,$10::timestamptz,$10::timestamptz,$11::uuid[],$12::uuid[],$13::uuid[],$14::uuid,$15)
        ON CONFLICT (source,"externalId") DO UPDATE SET url=EXCLUDED.url,title=EXCLUDED.title,community=EXCLUDED.community,kind=EXCLUDED.kind,replies=EXCLUDED.replies,"lastActivityAt"=EXCLUDED."lastActivityAt","lastSeenAt"=EXCLUDED."lastSeenAt",
          "clubIds"=EXCLUDED."clubIds","playerIds"=EXCLUDED."playerIds","leagueIds"=EXCLUDED."leagueIds","matchId"=EXCLUDED."matchId",held=EXCLUDED.held RETURNING id`,
        [randomUUID(), item.source, item.externalId, item.url, item.title, item.community, kind, item.replies, item.lastActivityAt, now, clubIds, playerIds, leagueIds, matchId, held]);
      if (item.replies !== null) await tx.query(`INSERT INTO "FanThreadSnapshot" ("threadId","takenAt",replies) VALUES ($1::uuid,date_trunc('hour',$2::timestamptz),$3) ON CONFLICT ("threadId","takenAt") DO UPDATE SET replies=EXCLUDED.replies`, [row.id, now, item.replies]);
      counts.kept++;
    }
    const stored = await tx.query<{ id: string; title: string }>(`SELECT id,title FROM "FanThread" WHERE source='REDDIT'`);
    const stale = stored.filter((row) => notTalk.test(row.title)).map((row) => row.id);
    if (stale.length) await tx.query(`DELETE FROM "FanThread" WHERE id=ANY($1::uuid[])`, [stale]);
    await tx.query(`DELETE FROM "FanThread" WHERE "lastSeenAt"<$1::timestamptz`, [new Date(now.getTime() - 14 * 24 * hour)]);
  });
  return counts;
}

export type FanThreadView = {
  id: string; source: "VOZ" | "REDDIT"; community: string; title: string; url: string; kind: "MATCH" | "CLUB" | "TOPIC";
  replies: number | null; /** Replies added since the reading about a day ago (or since the first reading, when younger). */ delta: number | null; deltaHours: number | null; lastActivityAt: string;
};
type Row = { ents?: number; id: string; source: "VOZ" | "REDDIT"; community: string; title: string; url: string; kind: "MATCH" | "CLUB" | "TOPIC"; replies: number | null; lastActivityAt: string; base24: number | null; firstReplies: number | null; firstAt: string | null };
const base = `SELECT cardinality(t."clubIds")+cardinality(t."playerIds")+cardinality(t."leagueIds") AS ents,t.id,t.source,t.community,t.title,t.url,t.kind,t.replies,t."lastActivityAt",
  (SELECT s.replies FROM "FanThreadSnapshot" s WHERE s."threadId"=t.id AND s."takenAt"<=$1::timestamptz-interval '24 hours' ORDER BY s."takenAt" DESC LIMIT 1) AS base24,
  (SELECT s.replies FROM "FanThreadSnapshot" s WHERE s."threadId"=t.id ORDER BY s."takenAt" LIMIT 1) AS "firstReplies",
  (SELECT s."takenAt" FROM "FanThreadSnapshot" s WHERE s."threadId"=t.id ORDER BY s."takenAt" LIMIT 1) AS "firstAt"
  FROM "FanThread" t WHERE NOT t.held AND `;
type Scored = FanThreadView & { ents: number };
function view(row: Row, now: Date): Scored {
  let delta: number | null = null; let deltaHours: number | null = null;
  if (row.replies !== null && row.base24 !== null) { delta = row.replies - row.base24; deltaHours = 24; }
  else if (row.replies !== null && row.firstReplies !== null && row.firstAt) {
    const hours = Math.floor((now.getTime() - new Date(row.firstAt).getTime()) / hour);
    if (hours >= 1) { delta = row.replies - row.firstReplies; deltaHours = hours; }
  }
  return { ents: Number(row.ents ?? 0), id: row.id, source: row.source, community: row.community, title: row.title, url: row.url, kind: row.kind, replies: row.replies, delta: delta !== null && delta >= 0 ? delta : null, deltaHours, lastActivityAt: new Date(row.lastActivityAt).toISOString() };
}
const livelier = (a: FanThreadView, b: FanThreadView) => (b.delta ?? -1) - (a.delta ?? -1) || b.lastActivityAt.localeCompare(a.lastActivityAt);

/** What fans are talking about now: the liveliest Vietnamese threads and the newest r/soccer posts. */
export async function trendingFanThreads(tx: SqlExecutor, now: Date, limits = { voz: 4, reddit: 4 }) {
  const rows = await tx.query<Row>(`${base} t."lastActivityAt">$1::timestamptz-interval '36 hours' AND t."lastSeenAt">$1::timestamptz-interval '3 hours'`, [now]);
  const views = rows.map((row) => view(row, now));
  const plain = (item: Scored): FanThreadView => { const { ents, ...rest } = item; void ents; return rest; };
  return { voz: views.filter((item) => item.source === "VOZ").sort(livelier).slice(0, limits.voz).map(plain), reddit: views.filter((item) => item.source === "REDDIT").sort((a, b) => Number(b.ents > 0) - Number(a.ents > 0) || b.lastActivityAt.localeCompare(a.lastActivityAt)).slice(0, limits.reddit).map(plain) };
}
/** Threads about one club: its fan room on Voz and the recent posts that name it. */
export async function fanThreadsForClub(tx: SqlExecutor, clubId: string, now: Date, limit = 6) {
  const rows = await tx.query<Row>(`${base} $2::uuid=ANY(t."clubIds") AND t."lastActivityAt">$1::timestamptz-interval '7 days' AND t."lastSeenAt">$1::timestamptz-interval '3 hours'`, [now, clubId]);
  return rows.map((row) => view(row, now)).sort((a, b) => Number(b.kind === "CLUB") - Number(a.kind === "CLUB") || livelier(a, b)).slice(0, limit);
}
/** Threads about one match: the match threads and the talk that names both clubs around the game. */
export async function fanThreadsForMatch(tx: SqlExecutor, matchId: string, homeClubId: string, awayClubId: string, now: Date, limit = 4) {
  const rows = await tx.query<Row>(`${base} (t."matchId"=$2::uuid OR ($3::uuid=ANY(t."clubIds") AND $4::uuid=ANY(t."clubIds"))) AND t."lastActivityAt">$1::timestamptz-interval '4 days' AND t."lastSeenAt">$1::timestamptz-interval '3 hours'`, [now, matchId, homeClubId, awayClubId]);
  return rows.map((row) => view(row, now)).sort((a, b) => Number(b.kind === "MATCH") - Number(a.kind === "MATCH") || livelier(a, b)).slice(0, limit);
}
