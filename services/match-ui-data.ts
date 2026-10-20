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

const leagueScope = (league: string) => league === "all" ? Object.keys(matchLeagues) : [league];
/** Matches per Vietnam calendar day in [from, to], for the day strip. Days without matches are absent. */
export async function countMatchesByDay(db: PrismaClient, league: string, from: string, to: string): Promise<Record<string, number>> {
  const rows = await db.$queryRawUnsafe<{ day: string; count: number }[]>(`SELECT to_char(m."kickoffAt" AT TIME ZONE 'Asia/Ho_Chi_Minh','YYYY-MM-DD') AS day,count(*)::int AS count
    FROM "Match" m JOIN "League" l ON l.id=m."leagueId" WHERE l.slug=ANY($1::text[]) AND m."kickoffAt">=$2::timestamptz AND m."kickoffAt"<$3::timestamptz GROUP BY 1`,
    leagueScope(league), new Date(`${from}T00:00:00+07:00`), new Date(Date.parse(`${to}T00:00:00+07:00`) + 86400000));
  return Object.fromEntries(rows.map((row) => [row.day, Number(row.count)]));
}
/** The nearest earlier and later Vietnam days that have a match, for an empty day. */
export async function nearestMatchDays(db: PrismaClient, league: string, day: string): Promise<{ previous: string | null; next: string | null }> {
  const start = new Date(`${day}T00:00:00+07:00`); const end = new Date(start.getTime() + 86400000);
  const pick = async (sql: string, at: Date) => (await db.$queryRawUnsafe<{ day: string | null }[]>(sql, leagueScope(league), at))[0]?.day ?? null;
  const base = `SELECT to_char(%s AT TIME ZONE 'Asia/Ho_Chi_Minh','YYYY-MM-DD') AS day FROM "Match" m JOIN "League" l ON l.id=m."leagueId" WHERE l.slug=ANY($1::text[]) AND m."kickoffAt"`;
  const [previous, next] = await Promise.all([pick(base.replace("%s", "max(m.\"kickoffAt\")") + "<$2::timestamptz", start), pick(base.replace("%s", "min(m.\"kickoffAt\")") + ">=$2::timestamptz", end)]);
  return { previous, next };
}
