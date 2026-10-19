import type { MatchSummary, MatchDetail } from "../../types/match-ui";

// Deterministic UI fixtures only. Production pages read persisted data, never this file.
export const uiNow = new Date("2026-10-16T00:00:00Z");
export function uiMatch(overrides: Partial<MatchSummary> = {}): MatchSummary {
  return {
    id: "fixture-ui-match", slug: "fixture-alpha-beta", status: "FINISHED", kickoffAt: "2026-10-15T19:00:00Z",
    homeClub: { name: "Fixture Alpha FC", shortName: "Fixture Alpha", tla: "ALP" },
    awayClub: { name: "Fixture Beta FC", shortName: "Fixture Beta", tla: "BET" },
    homeScore: 2, awayScore: 1, homeExtraTimeScore: null, awayExtraTimeScore: null, homePenaltyScore: null, awayPenaltyScore: null,
    league: { slug: "premier-league", name: "Premier League" }, season: { name: "2026/2027" }, round: "8", venue: "Fixture Ground",
    scoreDuration: "REGULAR", lastUpdatedAt: "2026-10-15T23:30:00Z",
    attribution: { text: "Football data provided by the Football-Data.org API", url: "https://www.football-data.org/" },
    ...overrides,
  };
}
export function uiDetail(overrides: Partial<MatchDetail> = {}): MatchDetail {
  return { ...uiMatch(), events: [], stats: [], ...overrides };
}
