export const FOOTBALL_DATA = {
  id: "FOOTBALL_DATA",
  baseUrl: "https://api.football-data.org/v4",
  attribution: { text: "Football data provided by the Football-Data.org API", url: "https://www.football-data.org/" },
  requestIntervalMs: 7000,
  timeoutMs: 10000,
  retries: 2,
} as const;

// Adapter-only codes. Services use the stable internal keys instead.
export const competitionConfig: Record<string, { code: string; name: string; country: string }> = {
  "premier-league": { code: "PL", ...matchLeagues["premier-league"] },
  "la-liga": { code: "PD", ...matchLeagues["la-liga"] },
  "ligue-1": { code: "FL1", ...matchLeagues["ligue-1"] },
  "champions-league": { code: "CL", ...matchLeagues["champions-league"] },
};
import { matchLeagues } from "../../lib/match-leagues";

