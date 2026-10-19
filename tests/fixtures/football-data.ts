// Synthetic adapter fixtures. Imported by tests only; never a production fallback.
export const competitionFixture = { id: 2021, code: "PL", name: "Premier League", area: { name: "England" } };
export const seasonFixture = { id: 900001, startDate: "2026-08-01", endDate: "2027-05-31" };
export const teamFixture = (id = 910001, name = "Fixture Alpha") => ({ id, name, shortName: name, tla: "FIX", area: { name: "England" }, venue: "Fixture Ground", crest: "https://example.test/fixture.svg" });
export function matchFixture() {
  return { id: 920001, competition: competitionFixture, season: seasonFixture,
    homeTeam: teamFixture(), awayTeam: teamFixture(910002, "Fixture Beta"),
    utcDate: "2026-10-15T20:00:00Z", status: "FINISHED", matchday: 8,
    lastUpdated: "2026-10-15T22:00:00Z", score: { duration: "REGULAR", fullTime: { home: 2, away: 1 } },
  };
}
export function standingsFixture() {
  return { competition: competitionFixture, season: seasonFixture,
    standings: [{ stage: "REGULAR_SEASON", type: "TOTAL", group: null, table: [{ position: 1, team: teamFixture(), playedGames: 8, won: 6, draw: 1, lost: 1, points: 19, goalsFor: 15, goalsAgainst: 5, goalDifference: 10 }] }],
  };
}
