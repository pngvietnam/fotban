import type { LeagueSlug } from "../../types/league-hub";

export const HIGHLIGHTLY = {
  id: "HIGHLIGHTLY",
  baseUrl: "https://soccer.highlightly.net",
  /** The free Basic plan allows 100 requests per day: 60 for match details, 30 for player profiles (services/player-profiles.ts), ten left for manual checks. */
  dailyBudget: 60,
  requestIntervalMs: 1500,
  timeoutMs: 15000,
  attribution: { text: "Diễn biến, đội hình và thống kê: Highlightly", url: "https://highlightly.net" },
} as const;

/** How each supported competition is named there, and the country names its league entry may carry. */
export const highlightlyLeagues: Record<LeagueSlug, { name: string; countries: string[] }> = {
  "premier-league": { name: "Premier League", countries: ["England"] },
  "la-liga": { name: "La Liga", countries: ["Spain"] },
  "ligue-1": { name: "Ligue 1", countries: ["France"] },
  "champions-league": { name: "UEFA Champions League", countries: ["World", "Europe", "International"] },
};
