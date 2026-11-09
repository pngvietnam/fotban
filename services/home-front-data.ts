import "server-only";
import { getDatabase } from "../lib/db";
import { logger } from "../lib/logger";
import { prismaSyncDatabase } from "../lib/sync-database";
import type { LeagueInfo, LeagueSlug, StandingRow } from "../types/league-hub";
import { isLeagueSlug, leagueInfo, leagueNames, leagueStandings } from "./league-hub";
import { readLeagueLeaders } from "./league-leaders";
import { hotNow, type HotNow } from "./hot-now";
import type { HomeScorers } from "../components/home/home-extras";
import { leagueHref } from "../lib/league-presentation";
import { readNewsCollectedAt, readRibbon, readWatchMatch, type RibbonMatch, type WatchMatch } from "./home-overview";
import { latestHighlights, type ArchiveClip } from "./match-timeline";
import { timelineLeagues } from "../lib/match-timeline";
import { hotFanPulses, type MatchFanPulse } from "./fan-pulse";

export type HomeStandings = { league: LeagueInfo; rows: StandingRow[] };
/** The homepage table: a league's leaders, or null when it cannot be read (the block is then left out). */
export async function readHomeStandings(slug: string | string[] | undefined, now = new Date(), limit = 6): Promise<HomeStandings | null> {
  const league: LeagueSlug = typeof slug === "string" && isLeagueSlug(slug) ? slug : "premier-league";
  const db = getDatabase();
  if (!db) return null;
  try {
    const database = prismaSyncDatabase(db);
    const [info, table] = await Promise.all([leagueInfo(database, league, now), leagueStandings(database, league, now)]);
    return info && table.rows.length ? { league: info, rows: table.rows.slice(0, limit) } : null;
  } catch { logger.warn({ event: "home_standings_unavailable" }); return null; }
}

export type HomeMatches = { ribbon: RibbonMatch[]; highlights: ArchiveClip[]; watch: WatchMatch | null; collectedAt: string | null };
/** "Trên sân cỏ", the match worth watching next, the latest highlights and the newest news collection time; each is empty when it cannot be read. */
export async function readHomeMatches(now = new Date()): Promise<HomeMatches> {
  const db = getDatabase();
  if (!db) return { ribbon: [], highlights: [], watch: null, collectedAt: null };
  const database = prismaSyncDatabase(db);
  const [ribbon, highlights, watch, collectedAt] = await Promise.all([
    readRibbon(database, now).catch(() => { logger.warn({ event: "home_ribbon_unavailable" }); return []; }),
    latestHighlights(database, timelineLeagues.map((league) => league.slug), now, 6).catch(() => { logger.warn({ event: "home_highlights_unavailable" }); return []; }),
    readWatchMatch(database, now).catch(() => { logger.warn({ event: "home_watch_unavailable" }); return null; }),
    readNewsCollectedAt(database).catch(() => { logger.warn({ event: "home_freshness_unavailable" }); return null; }),
  ]);
  return { ribbon, highlights, watch, collectedAt };
}

/** Short club names ("Man United") by club id, for views that carry the full name only. */
export async function readClubShortNames(ids: string[]): Promise<Record<string, string>> {
  const unique = [...new Set(ids)].slice(0, 100);
  const db = getDatabase();
  if (!unique.length || !db) return {};
  try {
    const rows = await prismaSyncDatabase(db).query<{ id: string; shortName: string }>(`SELECT id,"shortName" FROM "Club" WHERE id=ANY($1::uuid[]) AND "shortName" IS NOT NULL AND btrim("shortName")<>''`, [unique]);
    return Object.fromEntries(rows.map((row) => [row.id, row.shortName.trim()]));
  } catch { logger.warn({ event: "home_short_names_unavailable" }); return {}; }
}

/** "Fan đang nói gì": the matches Vietnamese viewers comment on most under the highlight videos; empty when they cannot be read. */
export async function readHomeFans(now = new Date()): Promise<MatchFanPulse[]> {
  const db = getDatabase();
  if (!db) return [];
  try { return await hotFanPulses(prismaSyncDatabase(db), now); } catch { logger.warn({ event: "home_fans_unavailable" }); return []; }
}

/** "Đang nóng": matches and topics fans and papers are busy with; empty when it cannot be read. */
export async function readHomeHot(now = new Date()): Promise<HotNow> {
  const db = getDatabase();
  if (!db) return { matches: [], topics: [] };
  try { return await hotNow(prismaSyncDatabase(db), now); } catch { logger.warn({ event: "home_hot_unavailable" }); return { matches: [], topics: [] }; }
}

/** The top scorers of the league shown beside the homepage table, from the stored leaders; null when none are stored. */
export async function readHomeScorers(slug: string | string[] | undefined, limit = 5): Promise<HomeScorers | null> {
  const league: LeagueSlug = typeof slug === "string" && isLeagueSlug(slug) ? slug : "premier-league";
  const db = getDatabase();
  if (!db) return null;
  try {
    const leaders = await readLeagueLeaders(prismaSyncDatabase(db), league);
    if (!leaders?.scorers.length) return null;
    return { leagueName: leagueNames[league].name, leagueHref: leagueHref(league, { tab: "thong-ke" }), list: leaders.scorers.slice(0, limit).map((scorer) => ({ name: scorer.name, goals: scorer.goals, assists: scorer.assists ?? null, team: scorer.teamName, crestUrl: scorer.crestUrl, photoUrl: scorer.photoUrl, href: scorer.playerPath })) };
  } catch { logger.warn({ event: "home_scorers_unavailable" }); return null; }
}
