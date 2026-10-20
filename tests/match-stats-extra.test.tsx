import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { describe, expect, it } from "vitest";
import { MatchDetailView } from "../components/matches/match-detail";
import { displayName, goalTargetText, parseGoalTarget, parsePlayerStatView } from "../components/matches/match-stats-extra";
import type { MatchDetail } from "../types/match-ui";
import { uiDetail, uiMatch, uiNow } from "./fixtures/match-ui";

const home = "11111111-1111-4111-8111-111111111111"; const away = "22222222-2222-4222-8222-222222222222";
const detail = (overrides: Partial<MatchDetail> = {}) => uiDetail({ ...uiMatch({ homeClub: { id: home, name: "Real Madrid CF", shortName: "Real Madrid" }, awayClub: { id: away, name: "Sevilla FC", shortName: "Sevilla" } }), events: [], stats: [], ...overrides });
const shot = (clubId: string, minute: number, outcome: string, goalTarget: string | null, playerName: string): NonNullable<MatchDetail["shots"]>[number] => ({ clubId, minute, addedMinute: null, playerName, outcome, goalTarget, player: null });

describe("shot helpers", () => {
  it("reads the provider's goal targets and describes them in Vietnamese", () => {
    expect(parseGoalTarget("Low Right")).toEqual({ close: false, vertical: "low", horizontal: "right" });
    expect(parseGoalTarget("CloseLeft")).toEqual({ close: true, vertical: null, horizontal: "left" });
    expect(parseGoalTarget("")).toBeNull();
    expect(goalTargetText("High Centre", "GOAL")).toBe("Góc cao giữa");
    expect(goalTargetText("High Right", "MISSED")).toBe("Vọt xà");
    expect(goalTargetText("Low Left", "MISSED")).toBe("Chệch cột trái");
    expect(goalTargetText("CloseRight", "MISSED")).toBe("Chệch cột phải");
    expect(goalTargetText("Close High", "MISSED")).toBe("Vọt xà");
  });
  it("shows the name fans use and falls back to the first player view", () => {
    expect(displayName({ name: "E. Martínez", fullName: "Damián Emiliano Martínez Romero" })).toBe("Emiliano Martínez");
    expect(displayName({ name: "Joshua Kofi Acheampong", fullName: "Joshua Kofi Acheampong" })).toBe("Joshua Kofi Acheampong");
    expect(displayName({ name: "M. Caicedo", fullName: null })).toBe("M. Caicedo");
    expect(parsePlayerStatView("tranh-bong")).toBe("tranh-bong"); expect(parsePlayerStatView("x")).toBe("hang-dau");
  });
});

describe("statistics tab extras", () => {
  const lineups: MatchDetail["lineups"] = [
    { clubId: home, formation: "4-3-3", players: [
      { name: "K. Mbappé", fullName: "Kylian Mbappé Lottin", number: 10, position: "Forward", starter: true, row: 1, slot: 0, playerId: null, rating: 8.2, minutes: 85, stats: { goalsScored: 2, expectedGoals: 1.8, duelsWon: 6, duelsTotal: 10, dribblesSuccessful: 3, dribblesTotal: 5 } },
      { name: "T. Courtois", fullName: "Thibaut Courtois", number: 1, position: "Goalkeeper", starter: true, row: 0, slot: 0, playerId: null, rating: 7.5, minutes: 90, stats: { goalsSaved: 4, goalsConceded: 1, duelsWon: 1, duelsTotal: 1 } },
      { name: "U. Unused", number: 30, position: "Goalkeeper", starter: false, row: null, slot: null, playerId: null },
    ] },
    { clubId: away, formation: "4-4-2", players: [{ name: "Y. Fofana", fullName: "Youssouf Fofana", number: 8, position: "Midfielder", starter: true, row: 1, slot: 0, playerId: null, rating: 6.4, minutes: 90, stats: { duelsWon: 3, duelsTotal: 9 } }] },
  ];
  const shots = [shot(home, 37, "GOAL", "Low Centre", "Kylian Mbappé"), shot(home, 40, "POST", null, "Kylian Mbappé"), shot(home, 45, "MISSED", "High Right", "Endrick"), shot(away, 80, "SAVED", "Low Left", "Manu Bueno"), shot(away, 81, "BLOCKED", "Low Left", "Juan Iglesias")];
  const render = (bang?: Parameters<typeof MatchDetailView>[0]["statsView"]) => load(renderToStaticMarkup(<MatchDetailView match={detail({ lineups, shots, stats: [{ metric: "total_shots", value: "3", unit: null, club: { id: home, name: "Real Madrid" }, player: null }] })} now={uiNow} tab="thong-ke" statsView={bang} />));

  it("adds team duels summed from players, woodwork from shots, and percentages", () => {
    const $ = render();
    expect($("[aria-label='Tranh chấp thắng: 7 (64%) - 3 (33%)']")).toHaveLength(1);
    expect($("[aria-label='Sút trúng xà/cột dọc: 1 - 0']")).toHaveLength(1);
  });
  it("draws each team's shots on the goal frame and lists them with outcome and target", () => {
    const $ = render();
    const section = $("#match-shots").parent();
    expect(section.text()).toContain("3 cú sút · 1 bàn");
    const rows = section.find("ol li").map((_, node) => $(node).text()).get();
    expect(rows[0]).toContain("37′"); expect(rows[0]).toContain("Bàn thắng · Góc thấp giữa");
    expect(rows[2]).toContain("Ra ngoài · Vọt xà");
    expect(rows[4]).toContain("Bị chặn");
  });
  it("lists players who played, best rating first, with a view per area", () => {
    let $ = render();
    const names = $("#thong-ke-cau-thu").find("tbody th").map((_, node) => $(node).find("span.truncate").first().text()).get();
    expect(names).toEqual(["Kylian Mbappé", "Thibaut Courtois", "Youssouf Fofana"]);
    expect($("#thong-ke-cau-thu").find("tbody tr").first().text()).toContain("1.8");
    $ = render("tranh-bong");
    expect($("#thong-ke-cau-thu").find("tbody tr").first().text()).toContain("6/10 (60%)");
    expect($("nav[aria-label='Nhóm chỉ số cầu thủ'] a[aria-current=page]").text()).toBe("Tranh bóng");
    expect($("nav[aria-label='Lọc theo đội'] a[aria-current=page]").text()).toBe("Cả hai đội");
    $ = render("thu-thanh");
    expect($("#thong-ke-cau-thu").find("tbody tr")).toHaveLength(1);
    expect($("nav[aria-label='Nhóm chỉ số cầu thủ'] a[href$='bang=thu-thanh#thong-ke-cau-thu']")).toHaveLength(1);
    // Team chips keep the current view.
    expect($("nav[aria-label='Lọc theo đội'] a").map((_, node) => $(node).attr("href")).get()).toEqual(["/match/fixture-alpha-beta?tab=thong-ke&bang=thu-thanh#thong-ke-cau-thu", "/match/fixture-alpha-beta?tab=thong-ke&bang=thu-thanh&doi=nha#thong-ke-cau-thu", "/match/fixture-alpha-beta?tab=thong-ke&bang=thu-thanh&doi=khach#thong-ke-cau-thu"]);
  });
});

describe("player table team filter", () => {
  it("keeps only one team's players and links keep the view", async () => {
    const { parsePlayerTeamFilter } = await import("../components/matches/match-stats-extra");
    expect(parsePlayerTeamFilter("nha")).toBe("home"); expect(parsePlayerTeamFilter("khach")).toBe("away"); expect(parsePlayerTeamFilter(undefined)).toBe("all");
  });
});
