import type { PrismaClient, MatchStatus } from "@prisma/client";
import { listMatches, readMatchBySlug } from "./match-queries";
import { matchTimeZone } from "../lib/match-presentation";
import { matchSlugSchema, type MatchUiFilters } from "../lib/match-filters";
import type { MatchSummary, MatchDetail } from "../types/match-ui";
import { matchLeagues } from "../lib/match-leagues";

export type MatchListData = { matches: MatchSummary[]; total: number; page: number; pageSize: number };
export type MatchListResult = { kind: "ready"; data: MatchListData } | { kind: "error" };
export type MatchDetailResult = { kind: "ready"; match: MatchDetail } | { kind: "not-found" } | { kind: "error" };

export async function loadMatchList(read: () => Promise<MatchListData>, onError?: () => void): Promise<MatchListResult> {
  try { return { kind: "ready", data: await read() }; }
  catch { onError?.(); return { kind: "error" }; }
}
export async function loadMatchDetail(slug: string, read: () => Promise<MatchDetail | null>, onError?: () => void): Promise<MatchDetailResult> {
  if (!matchSlugSchema.safeParse(slug).success) return { kind: "not-found" };
  try {
    const match = await read();
    return match ? { kind: "ready", match } : { kind: "not-found" };
  } catch { onError?.(); return { kind: "error" }; }
}
export function queryMatchList(db: PrismaClient, filters: MatchUiFilters) {
  const statuses: Partial<Record<MatchUiFilters["status"], MatchStatus[]>> = { upcoming: ["SCHEDULED"], live: ["LIVE", "HALFTIME"], finished: ["FINISHED"] };
  return listMatches(db, { ...filters, league: filters.league === "all" ? undefined : filters.league }, { timeZone: matchTimeZone, statuses: statuses[filters.status], leagueSlugs: Object.keys(matchLeagues) });
}
export { readMatchBySlug };
