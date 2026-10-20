import "server-only";
import { getDatabase } from "../lib/db";
import { logger } from "../lib/logger";
import { prismaSyncDatabase } from "../lib/sync-database";
import type { LeagueInfo, LeagueSlug, StandingRow } from "../types/league-hub";
import { isLeagueSlug, leagueInfo, leagueStandings } from "./league-hub";
import { readRibbon, type RibbonMatch } from "./home-overview";
import { latestHighlights, type ArchiveClip } from "./match-timeline";
import { timelineLeagues } from "../lib/match-timeline";

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

/** "Trên sân cỏ" and the latest highlights; either is empty when it cannot be read. */
export async function readHomeMatches(now = new Date()): Promise<{ ribbon: RibbonMatch[]; highlights: ArchiveClip[] }> {
  const db = getDatabase();
  if (!db) return { ribbon: [], highlights: [] };
  const database = prismaSyncDatabase(db);
  const [ribbon, highlights] = await Promise.all([
    readRibbon(database, now).catch(() => { logger.warn({ event: "home_ribbon_unavailable" }); return []; }),
    latestHighlights(database, timelineLeagues.map((league) => league.slug), now, 6).catch(() => { logger.warn({ event: "home_highlights_unavailable" }); return []; }),
  ]);
  return { ribbon, highlights };
}
