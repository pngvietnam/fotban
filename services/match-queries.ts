import type { PrismaClient, MatchStatus } from "@prisma/client";
import { z } from "zod";
import { dataSources } from "../lib/data-sources";
import { dateBounds, matchTimeZone } from "../lib/match-presentation";

const clubSelect = { id: true, slug: true, name: true, shortName: true, tla: true, externalCrestUrl: true } as const;
const matchSelect = {
  id: true, slug: true, kickoffAt: true, status: true, round: true, venue: true,
  homeScore: true, awayScore: true, homeExtraTimeScore: true, awayExtraTimeScore: true,
  homePenaltyScore: true, awayPenaltyScore: true, scoreDuration: true,
  lastUpdatedAt: true, providerUpdatedAt: true, provider: true, sourceUrl: true,
  league: { select: { id: true, slug: true, name: true } },
  season: { select: { id: true, name: true } },
  homeClub: { select: clubSelect }, awayClub: { select: clubSelect },
} as const;
export const matchReadSchema = z.object({
  league: z.string().regex(/^[a-z0-9-]{1,80}$/).optional(),
  from: z.iso.date(), to: z.iso.date(),
  page: z.coerce.number().int().min(1).max(10000).default(1),
}).refine((value) => value.from <= value.to && Date.parse(value.to) - Date.parse(value.from) <= 31 * 86400000);

export function defaultMatchWindow(now = new Date()) {
  return { from: new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10), to: new Date(now.getTime() + 14 * 86400000).toISOString().slice(0, 10) };
}
export async function listMatches(db: PrismaClient, input: z.infer<typeof matchReadSchema>, options: { timeZone?: "UTC" | typeof matchTimeZone; statuses?: MatchStatus[]; leagueSlugs?: string[] } = {}) {
  const where = {
    kickoffAt: dateBounds(input.from, input.to, options.timeZone),
    ...(input.league ? { league: { slug: input.league } } : {}),
    ...(!input.league && options.leagueSlugs ? { league: { slug: { in: options.leagueSlugs } } } : {}),
    ...(options.statuses ? { status: { in: options.statuses } } : {}),
  };
  const rows = await db.match.findMany({ where, select: matchSelect, orderBy: [{ kickoffAt: "asc" }, { id: "asc" }], take: 50, skip: (input.page - 1) * 50 });
  const total = await db.match.count({ where });
  return { matches: rows.map((row) => ({ ...row, attribution: dataSources[row.provider]?.attribution ?? null })), page: input.page, pageSize: 50, total };
}
export async function readMatchBySlug(db: PrismaClient, slug: string) {
  const row = await db.match.findUnique({ where: { slug }, select: { ...matchSelect,
    events: { select: { type: true, minute: true, addedMinute: true, detail: true, club: { select: { name: true } }, player: { select: { name: true } }, relatedPlayer: { select: { name: true } } }, orderBy: [{ minute: "asc" }, { id: "asc" }], take: 200 },
    stats: { select: { metric: true, value: true, unit: true, club: { select: { name: true } }, player: { select: { name: true } } }, orderBy: [{ metric: "asc" }, { id: "asc" }], take: 100 },
  } });
  return row ? { ...row, stats: row.stats.map((stat) => ({ ...stat, value: stat.value.toString() })), attribution: dataSources[row.provider]?.attribution ?? null } : null;
}
export async function readMatch(db: PrismaClient, id: string) {
  const row = await db.match.findUnique({ where: { id }, select: matchSelect });
  return row ? { ...row, attribution: dataSources[row.provider]?.attribution ?? null, capabilities: dataSources[row.provider]?.capabilities ?? null } : null;
}
export async function listStandings(db: PrismaClient, league: string) {
  const season = await db.season.findFirst({ where: { league: { slug: league }, standings: { some: {} } }, orderBy: [{ startsAt: "desc" }, { id: "asc" }], select: { id: true, name: true } });
  if (!season) return { season: null, standings: [] };
  const rows = await db.standing.findMany({ where: { seasonId: season.id, league: { slug: league } }, orderBy: [{ tableType: "asc" }, { stage: "asc" }, { group: "asc" }, { position: "asc" }], take: 1000,
    select: { id: true, stage: true, group: true, tableType: true, position: true, playedGames: true, won: true, drawn: true, lost: true, points: true, goalsFor: true, goalsAgainst: true, goalDifference: true, fetchedAt: true, provider: true, club: { select: clubSelect } } });
  return { season, standings: rows.map((row) => ({ ...row, attribution: dataSources[row.provider]?.attribution ?? null })) };
}
