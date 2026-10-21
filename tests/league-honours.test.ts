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

import { clubHistory, seasonStories, startsAtBeginning } from "../lib/league-memories";
describe("season stories", () => {
  const list = [
    { season: "2024–25", champion: "Liverpool", runnerUp: "Arsenal", points: 84, runnerUpPoints: 74 },
    { season: "2023–24", champion: "Manchester City", runnerUp: "Arsenal", points: 91, runnerUpPoints: 89 },
    { season: "2022–23", champion: "Manchester City", runnerUp: "Arsenal", points: 89, runnerUpPoints: 84 },
    { season: "2021–22", champion: "Manchester City", runnerUp: "Liverpool", points: 93, runnerUpPoints: 92 },
  ];
  it("derives title numbers, streaks and margins from the stored points, and says when the list starts late", () => {
    expect(startsAtBeginning(list)).toBe(false);
    const stories = seasonStories(list, false);
    const city = stories.find((item) => item.season === "2023–24")!;
    expect(city.titleNumber).toBe(3); expect(city.streak).toBe(3);
    expect(city.moments.map((moment) => moment.text)).toContain("Danh hiệu thứ 3 kể từ 2021–22");
    expect(stories.find((item) => item.season === "2021–22")!.moments.map((moment) => moment.text)).toContain("Hơn á quân đúng 1 điểm");
    expect(stories[0].moments.map((moment) => moment.text)).not.toContain("Từ á quân lên ngôi vô địch");
  });
  it("builds a club's history: titles, runner-up finishes, longest run and best total", () => {
    const history = clubHistory("Manchester City FC", seasonStories(list, false), false);
    expect(history.titles).toHaveLength(3); expect(history.runnerUps).toHaveLength(0);
    expect(history.longestStreak).toEqual({ years: 3, from: "2021–22", to: "2023–24" });
    expect(history.bestSeason?.points).toBe(93); expect(history.since).toBe("2021–22");
    expect(clubHistory("Arsenal", seasonStories(list, false), false).runnerUps).toHaveLength(3);
  });
});

import { sameClubName } from "../lib/league-memories";
describe("title counts", () => {
  const counts = (slug: "premier-league" | "la-liga" | "ligue-1" | "champions-league") => Object.fromEntries(clubTallies(seasonHonours(slug)).map((item) => [item.club, item.titles]));
  it("every season has one real champion: no placeholders, and no club listed twice under two names", () => {
    for (const slug of ["premier-league", "la-liga", "ligue-1", "champions-league"] as const) {
      const list = seasonHonours(slug);
      const champions = [...new Set(list.map((item) => item.champion))];
      expect(champions.every((name) => !/suspended|league|war|not held|\d{4}/i.test(name.replace(/^Football League$/, "")))).toBe(true);
      for (const [index, name] of champions.entries()) for (const other of champions.slice(index + 1)) expect([name, other, sameClubName(name, other) && !/Manchester|Sheffield|Inter|Milan|Madrid/.test(`${name}${other}`)]).toEqual([name, other, false]);
      expect(clubTallies(list).reduce((sum, item) => sum + item.titles, 0)).toBe(list.length);
    }
  });
  it("matches the clubs' own title totals, with older names counted for the club that carries the record", () => {
    expect(counts("premier-league")).toMatchObject({ Liverpool: 20, "Manchester United": 20, "Manchester City": 10, Everton: 9, "Aston Villa": 7, Chelsea: 6 });
    expect(seasonHonours("premier-league").length).toBe(127);
    expect(counts("la-liga")).toMatchObject({ "Real Madrid": 36, Barcelona: 29, "Atlético Madrid": 11, "Athletic Bilbao": 8, Valencia: 6 });
    expect(counts("la-liga")["Madrid FC"]).toBeUndefined(); expect(counts("la-liga")["Atlético Aviación"]).toBeUndefined();
    expect(counts("champions-league")).toMatchObject({ "Real Madrid": 15, Milan: 7, "Bayern Munich": 6, Liverpool: 6, Barcelona: 5, Ajax: 4 });
    expect(counts("ligue-1")).toMatchObject({ Marseille: 9, "Saint-Étienne": 10 });
  });
});
