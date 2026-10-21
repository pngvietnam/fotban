import honoursFile from "../data/league-honours.json";
import type { LeagueSlug } from "../types/league-hub";

export type Honour = { season: string; champion: string; runnerUp: string | null; score?: string | null };
export type ClubTally = { club: string; titles: number; runnerUps: number; seasons: string[] };

const honours = honoursFile.honours as Record<string, Honour[]>;
export const honoursSource = (slug: LeagueSlug) => (honoursFile.sources as Record<string, string>)[slug] ?? null;
export const honoursGeneratedAt = honoursFile.generatedAt;
/** Notes on how to read the counts (stripped titles, suspended seasons, older club names). */
export const honoursNotes = (slug: LeagueSlug) => ((honoursFile as { notes?: Record<string, { season: string; text: string }[]> }).notes?.[slug]) ?? [];

/** Seasons newest first, as stored (built by scripts/build-honours.ts from Wikipedia lists checked against Wikidata). */
export const seasonHonours = (slug: LeagueSlug): Honour[] => honours[slug] ?? [];

/** Titles and runner-up finishes per club, most titles first. */
export function clubTallies(list: Honour[]): ClubTally[] {
  const map = new Map<string, ClubTally>();
  const entry = (club: string) => map.get(club) ?? map.set(club, { club, titles: 0, runnerUps: 0, seasons: [] }).get(club)!;
  for (const item of list) { const winner = entry(item.champion); winner.titles++; winner.seasons.push(item.season); if (item.runnerUp) entry(item.runnerUp).runnerUps++; }
  return [...map.values()].sort((a, b) => b.titles - a.titles || b.runnerUps - a.runnerUps || a.club.localeCompare(b.club));
}
