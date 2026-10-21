import { describe, expect, it } from "vitest";
import { clubTallies, honoursSource, seasonHonours } from "../services/league-honours";
import { bracketPlan } from "../components/league/knockout-bracket";

describe("league honours", () => {
  it("counts titles and runner-up finishes per club, most titles first", () => {
    const list = [{ season: "2024–25", champion: "A", runnerUp: "B" }, { season: "2023–24", champion: "B", runnerUp: "A" }, { season: "2022–23", champion: "A", runnerUp: null }];
    expect(clubTallies(list)).toEqual([{ club: "A", titles: 2, runnerUps: 1, seasons: ["2024–25", "2022–23"] }, { club: "B", titles: 1, runnerUps: 1, seasons: ["2023–24"] }]);
  });
  it("ships the built honours of every league, newest season first", () => {
    for (const slug of ["premier-league", "la-liga", "ligue-1", "champions-league"] as const) {
      const list = seasonHonours(slug);
      expect(list.length).toBeGreaterThan(30);
      expect(list.every((item, index) => index === 0 || list[index - 1].season > item.season)).toBe(true);
      expect(list.every((item) => item.champion && item.champion !== item.runnerUp)).toBe(true);
      expect(honoursSource(slug)).toMatch(/^https:\/\/en\.wikipedia\.org\//);
    }
    expect(clubTallies(seasonHonours("champions-league"))[0]).toMatchObject({ club: "Real Madrid", titles: 15 });
  });
});

describe("knockout bracket plan", () => {
  it("uses every league-phase position from 1 to 24 exactly once", () => {
    const used = bracketPlan.flatMap((slot) => [...slot.seeds, ...slot.playoff.flat()]).sort((a, b) => a - b);
    expect(used).toEqual(Array.from({ length: 24 }, (_, index) => index + 1));
  });
});
