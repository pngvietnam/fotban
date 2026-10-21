import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { describe, expect, it } from "vitest";
import { normalizeScorers } from "../providers/football-data/normalization";
import { leagueZones, zoneOf } from "../lib/league-zones";
import { RoundCard, StandingsMini } from "../components/league/league-overview";
import type { StandingRow } from "../types/league-hub";

describe("league top scorers from football-data", () => {
  it("keeps rows with a player, team and goals, and only the provider's own emblem host", () => {
    const body = { competition: { emblem: "https://crests.football-data.org/CL.png" }, season: { currentMatchday: 3 }, scorers: [
      { player: { id: 38101, name: "Erling Haaland" }, team: { id: 65, name: "Manchester City FC", shortName: "Man City" }, playedMatches: 3, goals: 4, assists: null, penalties: 1 },
      { player: { id: 2, name: "No Goals" }, team: { id: 1, name: "X" }, goals: null },
      { broken: true },
    ] };
    expect(normalizeScorers(body)).toEqual({ emblemUrl: "https://crests.football-data.org/CL.png", currentMatchday: 3, scorers: [{ playerId: "38101", name: "Erling Haaland", teamId: "65", teamName: "Man City", played: 3, goals: 4, assists: null, penalties: 1 }] });
    expect(normalizeScorers({ ...body, competition: { emblem: "https://evil.example/CL.png" } }).emblemUrl).toBeNull();
  });
});

describe("league table zones", () => {
  it("names only the consequences the format fixes", () => {
    expect(zoneOf(leagueZones["champions-league"], 8)?.label).toBe("Vào thẳng vòng 1/8");
    expect(zoneOf(leagueZones["champions-league"], 24)?.label).toBe("Đá play-off vòng loại trực tiếp");
    expect(zoneOf(leagueZones["premier-league"], 4)).toBeNull();
    expect(zoneOf(leagueZones["ligue-1"], 16)?.label).toBe("Đá play-off trụ hạng");
  });
  it("marks zones with a legend and words for screen readers, not colour alone", () => {
    const row = (position: number): StandingRow => ({ position, clubId: `c${position}`, name: `Club ${position}`, shortName: null, tla: null, crestUrl: null, played: 3, won: 1, drawn: 0, lost: 2, goalsFor: 3, goalsAgainst: 4, goalDifference: -1, points: 3, form: [] });
    const $ = load(renderToStaticMarkup(<StandingsMini slug="champions-league" data={{ rows: [1, 2, 9, 30].map(row), fetchedAt: null }} zones={leagueZones["champions-league"]} highlight={["c30"]} limit={2} />));
    expect($("tbody tr").map((_, node) => $(node).attr("class")?.trim()).get()).toEqual(["zone-advance", "zone-advance", "zone-out followed"]);
    expect($("tbody tr").first().find(".sr-only").text()).toBe(" (Vào thẳng vòng 1/8)");
    expect($(".lg-zone-legend li").map((_, node) => $(node).text()).get()).toEqual(["Vào thẳng vòng 1/8", "Bị loại"]);
  });
});

describe("round card", () => {
  const fixture = (slug: string, kickoffAt: string, status: string, scores: [number | null, number | null]) => ({ slug, kickoffAt, status, round: "3", home: { name: "Home", tla: null, crestUrl: null }, away: { name: "Away", tla: null, crestUrl: null }, homeScore: scores[0], awayScore: scores[1] });
  it("groups the round by day, shows scores once played and kickoff times before, and links the neighbouring rounds", () => {
    const $ = load(renderToStaticMarkup(<RoundCard slug="champions-league" rounds={{ rounds: [1, 2, 3, 4], current: 3 }} tab="tong-quan"
      round={{ number: 3, fixtures: [fixture("a", "2026-10-20T19:00:00Z", "FINISHED", [2, 1]), fixture("b", "2026-10-21T19:00:00Z", "SCHEDULED", [null, null])] }} />));
    expect($("#lg-round").text()).toBe("Lượt trận 3");
    expect($(".lg-day h3")).toHaveLength(2);
    expect($(".lg-fx-mid b").map((_, node) => $(node).text()).get()).toEqual(["2 – 1", "02:00"]);
    expect($(".lg-round-nav a").map((_, node) => $(node).attr("href")).get()).toEqual(["/league/champions-league?vong=2", "/league/champions-league?vong=4"]);
  });
});
