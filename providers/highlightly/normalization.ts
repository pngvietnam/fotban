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

export type HighlightlyLeague = { id: string; name: string; country: string | null };
export type HighlightlyMatch = { id: string; kickoffAt: Date; home: { id: string; name: string }; away: { id: string; name: string } };
export type DetailEvent = {
  teamId: string | null; minute: number | null; addedMinute: number | null;
  type: "GOAL" | "OWN_GOAL" | "PENALTY" | "YELLOW_CARD" | "RED_CARD" | "SUBSTITUTION" | "OTHER";
  detail: string | null; player: string | null; related: string | null;
};
export type DetailStat = { teamId: string; metric: string; value: number };
export type HighlightlyDetail = { id: string; homeTeamId: string; awayTeamId: string; referee: string | null; events: DetailEvent[]; stats: DetailStat[] };
export type LineupPlayer = { name: string; number: number | null; position: string | null; starter: boolean; row: number | null; slot: number | null; playerId?: string | null };
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
      ...entry.initialLineup.flatMap((row, rowIndex) => row.map((player, slot) => ({ name: player.name, number: player.number ?? null, position: player.position || null, starter: true, row: rowIndex, slot }))),
      ...entry.substitutes.map((player) => ({ name: player.name, number: player.number ?? null, position: player.position || null, starter: false, row: null, slot: null })),
    ],
  });
  return { home: team(parsed.homeTeam), away: team(parsed.awayTeam) };
}
