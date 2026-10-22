import { describe, expect, it } from "vitest";
import { clubTheme, contrast, defaultClubColor } from "../lib/club-colors";
import { clubHighlights, resultsOf } from "../lib/club-highlights";
import type { FixtureRow, StandingRow } from "../types/league-hub";

const row = (clubId: string, position: number, overrides: Partial<StandingRow> = {}): StandingRow => ({
  position, clubId, name: clubId, shortName: null, tla: null, crestUrl: null, played: 7, won: 3, drawn: 2, lost: 2, goalsFor: 10, goalsAgainst: 10, goalDifference: 0, points: 11, form: [], ...overrides,
});
const match = (home: string, away: string, homeScore: number, awayScore: number): FixtureRow => ({
  slug: `${home}-${away}-${homeScore}`, kickoffAt: "2026-10-20T19:00:00.000Z", status: "FINISHED", round: null, home: { name: home, tla: null, crestUrl: null }, away: { name: away, tla: null, crestUrl: null }, homeScore, awayScore,
});

describe("club colours", () => {
  it("gives a known club its colour and text that reads on it", () => {
    for (const name of ["Manchester City FC", "Borussia Dortmund", "Arsenal FC", "Real Madrid CF", "FC Bayern München", "Racing Club de Lens"]) {
      const theme = clubTheme(name);
      expect(theme.known).toBe(true);
      expect(contrast(theme.color, theme.on)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(theme.ink, "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
    }
    expect(clubTheme("Borussia Dortmund").on).toBe("#111111");
    expect(clubTheme("Arsenal FC").on).toBe("#FFFFFF");
  });
  it("falls back to the Fotban green for a club it does not know", () => {
    expect(clubTheme("Nobody United")).toMatchObject({ color: defaultClubColor, known: false });
  });
});

describe("club season highlights", () => {
  const table = [row("a", 1, { won: 7, drawn: 0, lost: 0, goalsFor: 19, goalsAgainst: 7, points: 21 }), row("b", 2, { goalsFor: 11, goalsAgainst: 5 }), row("c", 3), row("d", 4), row("e", 5)];
  it("names the leader, a perfect record and the best attack, and nothing it cannot back up", () => {
    const keys = clubHighlights(table, "a", [], "A", "Ngoại hạng Anh").map((item) => item.key);
    expect(keys).toEqual(["leader", "perfect", "attack"]);
    expect(clubHighlights(table, "c", [], "C", "Ngoại hạng Anh")).toEqual([]);
  });
  it("counts a winning run from the newest result backwards", () => {
    const recent = [match("C", "X", 2, 0), match("Y", "C", 0, 1), match("C", "Z", 3, 1), match("W", "C", 2, 1)];
    expect(resultsOf(recent, "C")).toEqual(["W", "W", "W", "L"]);
    expect(clubHighlights(table, "c", recent, "C", "Ngoại hạng Anh").map((item) => item.text)).toEqual(["Thắng liên tiếp 3 trận"]);
  });
  it("calls the best defence only when it is the best alone", () => {
    const tied = [row("a", 1, { goalsAgainst: 4 }), row("b", 2, { goalsAgainst: 4 }), row("c", 3), row("d", 4)];
    expect(clubHighlights(tied, "a", [], "A", "x").map((item) => item.key)).not.toContain("defence");
    const alone = [row("a", 5, { goalsAgainst: 3 }), row("b", 2, { goalsAgainst: 4 }), row("c", 3), row("d", 4)];
    expect(clubHighlights(alone, "a", [], "A", "x").map((item) => item.key)).toContain("defence");
  });
});
