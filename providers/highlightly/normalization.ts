import { z } from "zod";

const entities: Record<string, string> = { amp: "&", apos: "'", quot: "\"", lt: "<", gt: ">", nbsp: " " };
/**
 * Provider names sometimes arrive HTML-escaped ("O&apos;Shea") or as UTF-8 read as Latin-1
 * ("MartÃ­nez"); both are repaired, anything else is kept as sent.
 */
export function cleanName(value: string) {
  let text = value.replace(/&(#\d{1,6}|#x[0-9a-f]{1,6}|[a-z]{2,6});/gi, (whole, code: string) => {
    if (code[0] === "#") { const point = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : Number(code.slice(1)); return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : whole; }
    return entities[code.toLowerCase()] ?? whole;
  });
  if (/[ÃÂ][\u0080-\u00bf]/.test(text) && /^[\u0000-\u00ff]*$/.test(text)) {
    const repaired = Buffer.from(text, "latin1").toString("utf8");
    if (!repaired.includes("\ufffd")) text = repaired;
  }
  return text.trim();
}
/** Lenient DTOs: only the fields FotBan reads are checked; unknown fields are ignored. */
const id = z.union([z.number().int(), z.string().regex(/^\d{1,20}$/)]).transform(String);
const text = z.string().trim().max(200).transform(cleanName);
const team = z.object({ id, name: text });
export const leagueListSchema = z.object({ data: z.array(z.object({ id, name: text, country: z.object({ name: text.optional() }).partial().optional() })) });
export const matchListSchema = z.object({ data: z.array(z.object({ id, date: z.string(), homeTeam: team, awayTeam: team })) });
const event = z.object({
  team: team.optional(), time: z.union([z.string(), z.number()]).optional(), type: text,
  playerId: id.optional().nullable(), player: text.optional().nullable(),
  assistingPlayerId: id.optional().nullable(), assist: text.optional().nullable(), substituted: text.optional().nullable(),
});
const statistic = z.object({ team, statistics: z.array(z.object({ displayName: text, value: z.number().finite().nullable() })) });
const detail = z.object({
  id, homeTeam: team, awayTeam: team,
  events: z.array(event).default([]), statistics: z.array(statistic).default([]),
  referee: z.object({ name: text.optional().nullable() }).partial().optional().nullable(),
});
/** The detail endpoint is documented as an object but its example is a one-element array; accept both. */
export const matchDetailSchema = z.union([detail, z.array(detail).length(1).transform((items) => items[0])]);
const lineupPlayer = z.object({ id: id.optional().nullable(), name: text, number: z.number().int().min(0).max(999).optional().nullable(), position: text.optional().nullable() });
const lineupTeam = z.object({ id, name: text, formation: text.optional().nullable(), initialLineup: z.array(z.array(lineupPlayer)).default([]), substitutes: z.array(lineupPlayer).default([]) });
export const lineupsSchema = z.object({ homeTeam: lineupTeam, awayTeam: lineupTeam });
const figure = z.union([z.number(), z.string(), z.null()]).optional();
const boxPlayer = z.object({
  id: id.optional().nullable(), name: text, fullName: text.optional().nullable(), shirtNumber: z.number().int().min(0).max(999).optional().nullable(),
  matchRating: figure, minutesPlayed: z.number().int().min(0).max(200).optional().nullable(), isCaptain: z.boolean().optional().nullable(),
  statistics: z.record(z.string(), z.unknown()).optional().nullable(),
});
export const boxScoreSchema = z.array(z.object({ team, players: z.array(boxPlayer) }));

export type HighlightlyLeague = { id: string; name: string; country: string | null };
export type HighlightlyMatch = { id: string; kickoffAt: Date; home: { id: string; name: string }; away: { id: string; name: string } };
export type DetailEvent = {
  teamId: string | null; minute: number | null; addedMinute: number | null;
  type: "GOAL" | "OWN_GOAL" | "PENALTY" | "YELLOW_CARD" | "RED_CARD" | "SUBSTITUTION" | "OTHER";
  detail: string | null; player: string | null; related: string | null;
};
export type DetailStat = { teamId: string; metric: string; value: number };
export type HighlightlyDetail = { id: string; homeTeamId: string; awayTeamId: string; referee: string | null; events: DetailEvent[]; stats: DetailStat[] };
/** Per-player figures kept from the box score (numbers only; percentages are derivable). */
export const boxFigures = ["goalsScored", "assists", "shotsTotal", "shotsOnTarget", "passesTotal", "passesSuccessful", "passesKey", "tacklesTotal", "interceptionsTotal", "duelsWon", "duelsTotal", "goalsSaved", "cardsYellow", "cardsRed", "expectedGoals", "expectedAssists"] as const;
export type BoxPlayer = { externalId: string | null; name: string; fullName: string | null; number: number | null; rating: number | null; minutes: number | null; captain: boolean; stats: Partial<Record<typeof boxFigures[number], number>> };
export type HighlightlyBoxScore = { teamId: string; players: BoxPlayer[] }[];
export type LineupPlayer = {
  name: string; number: number | null; position: string | null; starter: boolean; row: number | null; slot: number | null; playerId?: string | null;
  externalId?: string | null; fullName?: string | null; rating?: number | null; minutes?: number | null; stats?: BoxPlayer["stats"];
};
export type TeamLineup = { teamId: string; formation: string | null; players: LineupPlayer[] };
export type HighlightlyLineups = { home: TeamLineup; away: TeamLineup };

/** "45+2" → 45 and 2; "67" → 67; anything else → unknown. */
export function parseEventTime(value: string | number | undefined) {
  const match = /^\s*(\d{1,3})(?:\s*\+\s*(\d{1,2}))?\s*'?\s*$/.exec(String(value ?? ""));
  return match ? { minute: Number(match[1]), addedMinute: match[2] ? Number(match[2]) : null } : { minute: null, addedMinute: null };
}
const otherDetails: Record<string, string> = {
  "missed penalty": "Đá hỏng phạt đền", "var goal confirmed": "VAR: công nhận bàn thắng", "var goal cancelled": "VAR: hủy bàn thắng",
  "var goal cancelled - offside": "VAR: hủy bàn thắng vì việt vị", "var penalty": "VAR: cho hưởng phạt đền", "var penalty cancelled": "VAR: hủy quả phạt đền",
};
const eventTypes: Record<string, DetailEvent["type"]> = { goal: "GOAL", "own goal": "OWN_GOAL", penalty: "PENALTY", "yellow card": "YELLOW_CARD", "red card": "RED_CARD", substitution: "SUBSTITUTION" };
/** Metric key from a display name: "Ball possession" → "ball_possession". */
export const metricKey = (name: string) => name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/%/g, " percent ").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60);

export function normalizeLeagues(body: unknown): HighlightlyLeague[] {
  return leagueListSchema.parse(body).data.map((league) => ({ id: league.id, name: league.name, country: league.country?.name ?? null }));
}
export function normalizeMatches(body: unknown): HighlightlyMatch[] {
  return matchListSchema.parse(body).data.flatMap((match) => {
    const kickoffAt = new Date(match.date);
    return Number.isFinite(kickoffAt.getTime()) ? [{ id: match.id, kickoffAt, home: match.homeTeam, away: match.awayTeam }] : [];
  });
}
export function normalizeDetail(body: unknown): HighlightlyDetail {
  const match = matchDetailSchema.parse(body);
  const events = match.events.map((item): DetailEvent => {
    const key = item.type.toLowerCase();
    const type = eventTypes[key] ?? "OTHER";
    return { teamId: item.team?.id ?? null, ...parseEventTime(item.time), type, detail: type === "OTHER" ? otherDetails[key] ?? item.type : null,
      player: item.player || null, related: type === "SUBSTITUTION" ? item.substituted || null : item.assist || null };
  }).sort((a, b) => (a.minute ?? 999) - (b.minute ?? 999) || (a.addedMinute ?? 0) - (b.addedMinute ?? 0));
  const stats = match.statistics.flatMap((entry) => entry.statistics.flatMap((stat) => stat.value === null || !metricKey(stat.displayName) ? [] : [{ teamId: entry.team.id, metric: metricKey(stat.displayName), value: stat.value }]));
  return { id: match.id, homeTeamId: match.homeTeam.id, awayTeamId: match.awayTeam.id, referee: match.referee?.name || null, events, stats };
}
export function normalizeLineups(body: unknown): HighlightlyLineups {
  const parsed = lineupsSchema.parse(body);
  const team = (entry: z.infer<typeof lineupTeam>): TeamLineup => ({
    teamId: entry.id, formation: entry.formation || null,
    players: [
      ...entry.initialLineup.flatMap((row, rowIndex) => row.map((player, slot) => ({ name: player.name, number: player.number ?? null, position: player.position || null, starter: true, row: rowIndex, slot, ...(player.id ? { externalId: player.id } : {}) }))),
      ...entry.substitutes.map((player) => ({ name: player.name, number: player.number ?? null, position: player.position || null, starter: false, row: null, slot: null, ...(player.id ? { externalId: player.id } : {}) })),
    ],
  });
  return { home: team(parsed.homeTeam), away: team(parsed.awayTeam) };
}

const toNumber = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value.trim()) ? Number(value) : null;
/** Ratings are 0-10; anything else is treated as missing. */
export function normalizeBoxScore(body: unknown): HighlightlyBoxScore {
  return boxScoreSchema.parse(body).map((entry) => ({
    teamId: entry.team.id,
    players: entry.players.map((player) => {
      const rating = toNumber(player.matchRating);
      const stats: BoxPlayer["stats"] = {};
      for (const key of boxFigures) { const value = toNumber(player.statistics?.[key]); if (value !== null) stats[key] = value; }
      return { externalId: player.id ?? null, name: player.name, fullName: player.fullName || null, number: player.shirtNumber ?? null,
        rating: rating !== null && rating >= 0 && rating <= 10 ? Math.round(rating * 100) / 100 : null, minutes: player.minutesPlayed ?? null, captain: player.isCaptain === true, stats };
    }),
  }));
}
