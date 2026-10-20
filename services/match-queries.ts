import type { PrismaClient, MatchStatus } from "@prisma/client";
import { z } from "zod";
import { dataSources } from "../lib/data-sources";
import { dateBounds, matchTimeZone } from "../lib/match-presentation";

type StoredLineupPlayer = { name: string; fullName: string | null; number: number | null; position: string | null; starter: boolean; row: number | null; slot: number | null; playerId: string | null; rating: number | null; minutes: number | null; stats: Record<string, number> };
/** Defensive read of the stored lineup JSON: malformed entries are dropped, never shown half-formed. */
function lineupPlayers(value: unknown): StoredLineupPlayer[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const player = item as Record<string, unknown>;
    if (typeof player.name !== "string" || !player.name.trim()) return [];
    const int = (field: unknown) => typeof field === "number" && Number.isInteger(field) ? field : null;
    const rating = typeof player.rating === "number" && player.rating >= 0 && player.rating <= 10 ? player.rating : null;
    const stats = player.stats && typeof player.stats === "object" ? Object.fromEntries(Object.entries(player.stats as Record<string, unknown>).filter((entry): entry is [string, number] => typeof entry[1] === "number" && Number.isFinite(entry[1]))) : {};
    return [{ name: player.name, fullName: typeof player.fullName === "string" && player.fullName.trim() ? player.fullName : null, number: int(player.number), position: typeof player.position === "string" ? player.position : null,
      starter: player.starter === true, row: int(player.row), slot: int(player.slot), playerId: typeof player.playerId === "string" ? player.playerId : null, rating, minutes: int(player.minutes), stats }];
  });
}

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
/** Every match on the given Vietnam calendar days, optionally only those of some clubs. */
export async function listMatchesOnDays(db: PrismaClient, days: string[], options: { leagueSlugs: string[]; clubIds?: string[] | null }) {
  if (!days.length) return [];
  const where = {
    OR: days.map((day) => ({ kickoffAt: dateBounds(day, day, matchTimeZone) })),
    league: { slug: { in: options.leagueSlugs } },
    ...(options.clubIds ? { AND: [{ OR: [{ homeClubId: { in: options.clubIds } }, { awayClubId: { in: options.clubIds } }] }] } : {}),
  };
  const rows = await db.match.findMany({ where, select: matchSelect, orderBy: [{ kickoffAt: "asc" }, { id: "asc" }], take: 400 });
  return rows.map((row) => ({ ...row, attribution: dataSources[row.provider]?.attribution ?? null }));
}
export async function readMatchBySlug(db: PrismaClient, slug: string) {
  const row = await db.match.findUnique({ where: { slug }, select: { ...matchSelect,
    events: { select: { type: true, minute: true, addedMinute: true, detail: true, provider: true, playerName: true, relatedPlayerName: true, club: { select: { id: true, name: true } }, player: { select: { id: true, name: true } }, relatedPlayer: { select: { id: true, name: true } } }, orderBy: [{ minute: "asc" }, { addedMinute: "asc" }, { externalId: "asc" }], take: 200 },
    stats: { select: { metric: true, value: true, unit: true, provider: true, club: { select: { id: true, name: true } }, player: { select: { name: true } } }, orderBy: [{ metric: "asc" }, { id: "asc" }], take: 200 },
    lineups: { select: { clubId: true, formation: true, players: true, provider: true }, take: 4 },
    detailSyncs: { select: { referee: true, venueName: true, venueCity: true, venueCapacity: true, weather: true, temperatureC: true }, take: 1 },
    shots: { select: { clubId: true, minute: true, addedMinute: true, playerName: true, outcome: true, goalTarget: true, player: { select: { id: true, name: true } } }, orderBy: [{ minute: "asc" }, { addedMinute: "asc" }, { sequence: "asc" }], take: 120 },
  } });
  if (!row) return null;
  const { detailSyncs, ...rest } = row;
  const lineups = row.lineups.map((lineup) => ({ clubId: lineup.clubId, formation: lineup.formation, provider: lineup.provider, players: lineupPlayers(lineup.players) }));
  // Hotlinked free-licence photos for players matched to the canonical squad.
  const ids = [...new Set(lineups.flatMap((lineup) => lineup.players.flatMap((player) => player.playerId ? [player.playerId] : [])))];
  const photos = ids.length ? new Map((await db.playerImage.findMany({ where: { playerId: { in: ids }, status: "FOUND" }, select: { playerId: true, thumbUrl: true } })).map((image) => [image.playerId, image.thumbUrl])) : new Map<string, string | null>();
  const providers = [...new Set([...row.events.map((event) => event.provider), ...row.stats.map((stat) => stat.provider), ...lineups.map((lineup) => lineup.provider)])];
  const sync = detailSyncs[0];
  const venueInfo = sync && (sync.venueName || sync.weather) ? { name: sync.venueName, city: sync.venueCity, capacity: sync.venueCapacity, weather: sync.weather, temperatureC: sync.temperatureC === null ? null : Number(sync.temperatureC) } : null;
  return { ...rest, referee: sync?.referee ?? null, venueInfo, stats: row.stats.map((stat) => ({ ...stat, value: stat.value.toString() })),
    lineups: lineups.map((lineup) => ({ ...lineup, players: lineup.players.map((player) => ({ ...player, photoUrl: player.playerId ? photos.get(player.playerId) ?? null : null })) })),
    attribution: dataSources[row.provider]?.attribution ?? null,
    detailAttributions: providers.filter((name) => name !== row.provider).flatMap((name) => dataSources[name] ? [dataSources[name].attribution] : []) };
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
