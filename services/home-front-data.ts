import "server-only";
import { getDatabase } from "../lib/db";
import { logger } from "../lib/logger";
import { prismaSyncDatabase } from "../lib/sync-database";
import type { LeagueInfo, LeagueSlug, StandingRow } from "../types/league-hub";
import { isLeagueSlug, leagueInfo, leagueStandings } from "./league-hub";

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
