import { z } from "zod";
import type { CompetitionData, CompetitionRef, NormalizedMatch, ProviderBatch, SeasonRef, StandingRow, TeamRef } from "../../types/match-provider";
import { ProviderError } from "../errors";
import { competitionConfig, FOOTBALL_DATA } from "./config";

// All provider DTO schemas stay inside this adapter directory. Unknown paid fields
// are discarded rather than exposed as domain contracts or stored raw payloads.
const id = z.number().int().positive();
const text = z.string().trim().min(1);
const optionalText = text.nullish();
const area = z.object({ name: optionalText }).nullish();
const scoreValue = z.number().int().nonnegative().nullish();
const pairSchema = z.object({ home: scoreValue, away: scoreValue }).nullish();
const seasonSchema = z.object({ id: id.nullish(), startDate: z.iso.date(), endDate: z.iso.date().nullish() });
const competitionSchema = z.object({ id, code: text, name: text, area, currentSeason: seasonSchema.nullish() });
const teamSchema = z.object({ id, name: text, shortName: optionalText, tla: optionalText, area, venue: optionalText, crest: z.url().nullish() });
const matchSchema = z.object({
  id, competition: competitionSchema, season: seasonSchema,
  homeTeam: teamSchema, awayTeam: teamSchema,
  utcDate: z.iso.datetime({ offset: true }), status: text,
  matchday: z.number().int().positive().nullish(), stage: optionalText, venue: optionalText,
  lastUpdated: z.iso.datetime({ offset: true }).nullish(),
  score: z.object({
    duration: z.enum(["REGULAR", "EXTRA_TIME", "PENALTY_SHOOTOUT"]).nullish(),
    fullTime: pairSchema, regularTime: pairSchema, extraTime: pairSchema, penalties: pairSchema,
  }).nullish(),
});

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new ProviderError("MALFORMED_RESPONSE");
  return result.data;
}

export function competitionKey(code: string) {
  const entry = Object.entries(competitionConfig).find(([, config]) => config.code === code);
  if (!entry) throw new ProviderError("UNSUPPORTED");
  return entry[0];
}

export function normalizeSeason(input: unknown): SeasonRef {
  const s = parse(seasonSchema, input);
  if (s.endDate && s.endDate < s.startDate) throw new ProviderError("MALFORMED_RESPONSE");
  return {
    externalId: s.id?.toString(),
    name: s.endDate ? `${s.startDate.slice(0, 4)}/${s.endDate.slice(0, 4)}` : s.startDate.slice(0, 4),
    startsAt: `${s.startDate}T00:00:00.000Z`, endsAt: s.endDate ? `${s.endDate}T00:00:00.000Z` : undefined,
  };
}

export function normalizeCompetition(input: unknown): CompetitionData {
  const c = parse(competitionSchema, input);
  const key = competitionKey(c.code);
  return {
    competition: { key, externalId: c.id.toString(), name: competitionConfig[key].name, country: c.area?.name ?? competitionConfig[key].country },
    season: c.currentSeason ? normalizeSeason(c.currentSeason) : undefined,
  };
}

export function normalizeTeam(input: unknown): TeamRef {
  const t = parse(teamSchema, input);
  // Store a reference only. Never put this in Club.logoUrl or download the asset.
  const crest = t.crest && ["http:", "https:"].includes(new URL(t.crest).protocol) ? t.crest : undefined;
  return { externalId: t.id.toString(), name: t.name, shortName: t.shortName ?? undefined, tla: t.tla ?? undefined, country: t.area?.name ?? undefined, venue: t.venue ?? undefined, externalCrestUrl: crest };
}

const statusMap: Record<string, NormalizedMatch["status"]> = {
  SCHEDULED: "SCHEDULED", TIMED: "SCHEDULED", IN_PLAY: "LIVE", PAUSED: "HALFTIME",
  FINISHED: "FINISHED", AWARDED: "FINISHED", SUSPENDED: "SUSPENDED", POSTPONED: "POSTPONED", CANCELLED: "CANCELLED",
};

export function normalizeStatus(value: string) {
  if (!Object.hasOwn(statusMap, value)) throw new ProviderError("MALFORMED_RESPONSE");
  return statusMap[value];
}

function scorePair(value: z.infer<typeof pairSchema>) {
  return value?.home != null && value?.away != null ? { home: value.home, away: value.away } : undefined;
}

export function normalizeMatch(input: unknown, fallbackCompetition?: unknown): NormalizedMatch {
  const raw = typeof input === "object" && input !== null ? input : {};
  const m = parse(matchSchema, { competition: fallbackCompetition, ...raw });
  if (m.homeTeam.id === m.awayTeam.id) throw new ProviderError("MALFORMED_RESPONSE");
  const status = normalizeStatus(m.status);
  const playable = !["SCHEDULED", "POSTPONED", "CANCELLED"].includes(status);
  // v4 fullTime aggregates shootout goals. Internal homeScore/awayScore are
  // regulation scores; ET goals and penalties are separate, never guessed.
  const duration = m.score?.duration;
  const regulation = playable ? scorePair(duration === "REGULAR" ? m.score?.fullTime : m.score?.regularTime) : undefined;
  const extra = playable && duration !== "REGULAR" ? scorePair(m.score?.extraTime) : undefined;
  const penalties = playable && duration === "PENALTY_SHOOTOUT" ? scorePair(m.score?.penalties) : undefined;
  return {
    externalId: m.id.toString(), competition: normalizeCompetition(m.competition).competition,
    season: normalizeSeason(m.season), home: normalizeTeam(m.homeTeam), away: normalizeTeam(m.awayTeam),
    kickoffAt: new Date(m.utcDate).toISOString(), status, providerStatus: m.status,
    providerUpdatedAt: m.lastUpdated ? new Date(m.lastUpdated).toISOString() : undefined,
    round: m.matchday != null ? String(m.matchday) : m.stage ?? undefined,
    venue: m.venue ?? undefined, scoreDuration: duration ?? undefined,
    homeScore: regulation?.home, awayScore: regulation?.away,
    homeExtraTimeScore: extra?.home, awayExtraTimeScore: extra?.away,
    homePenaltyScore: penalties?.home, awayPenaltyScore: penalties?.away,
    sourceUrl: `${FOOTBALL_DATA.baseUrl}/matches/${m.id}`,
  };
}

export function normalizeBatch<T>(items: unknown[], normalize: (item: unknown) => T): ProviderBatch<T> {
  const output: ProviderBatch<T> = { items: [], skipped: 0, warnings: [] };
  for (const item of items) {
    try { output.items.push(normalize(item)); }
    catch { output.skipped++; }
  }
  if (output.skipped) output.warnings.push("INCOMPLETE_OR_INVALID_RECORDS_SKIPPED");
  return output;
}

export function normalizeStandings(input: unknown): ProviderBatch<StandingRow> {
  const envelope = parse(z.object({ competition: competitionSchema, season: seasonSchema, standings: z.array(z.unknown()) }), input);
  const competition: CompetitionRef = normalizeCompetition(envelope.competition).competition;
  const season = normalizeSeason(envelope.season);
  const rowSchema = z.object({
    position: z.number().int().positive(), team: teamSchema,
    playedGames: scoreValue, won: scoreValue, draw: scoreValue, lost: scoreValue,
    points: z.number().int().nullish(), goalsFor: scoreValue, goalsAgainst: scoreValue, goalDifference: z.number().int().nullish(),
  });
  const result: ProviderBatch<StandingRow> = { items: [], skipped: 0, warnings: [] };
  for (const value of envelope.standings) {
    const table = z.object({ stage: text, type: text, group: optionalText, table: z.array(rowSchema).min(1) }).safeParse(value);
    if (!table.success) { result.skipped++; continue; }
    const t = table.data;
    if (new Set(t.table.map((row) => row.team.id)).size !== t.table.length || new Set(t.table.map((row) => row.position)).size !== t.table.length) { result.skipped++; continue; }
    for (const row of t.table) result.items.push({
      competition, season, team: normalizeTeam(row.team), stage: t.stage, group: t.group ?? "", tableType: t.type,
      position: row.position, playedGames: row.playedGames ?? undefined, won: row.won ?? undefined,
      drawn: row.draw ?? undefined, lost: row.lost ?? undefined, points: row.points ?? undefined,
      goalsFor: row.goalsFor ?? undefined, goalsAgainst: row.goalsAgainst ?? undefined, goalDifference: row.goalDifference ?? undefined,
    });
  }
  if (result.skipped) result.warnings.push("INCOMPLETE_STANDINGS_TABLE_SKIPPED");
  return result;
}
