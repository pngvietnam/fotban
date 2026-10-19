import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { describe, expect, it } from "vitest";
import { MatchDetailView } from "../components/matches/match-detail";
import { statLabel, statValue } from "../components/matches/match-tab-views";
import { uiDetail, uiMatch, uiNow } from "./fixtures/match-ui";
import type { MatchDetail } from "../types/match-ui";

const home = { id: "11111111-1111-4111-8111-111111111111", name: "Fixture Alpha FC", shortName: "Fixture Alpha", tla: "ALP" };
const away = { id: "22222222-2222-4222-8222-222222222222", name: "Fixture Beta FC", shortName: "Fixture Beta", tla: "BET" };
const detail = (overrides: Partial<MatchDetail> = {}) => uiDetail({ ...uiMatch({ homeClub: home, awayClub: away }), events: [], stats: [], ...overrides });
const render = (match: MatchDetail, tab: Parameters<typeof MatchDetailView>[0]["tab"]) => load(renderToStaticMarkup(<MatchDetailView match={match} now={uiNow} tab={tab} />));

describe("match detail tabs with provider data", () => {
  const events: MatchDetail["events"] = [
    { type: "GOAL", minute: 12, addedMinute: null, detail: null, playerName: "A. Striker", relatedPlayerName: null, club: { id: home.id, name: home.name }, player: { id: "33333333-3333-4333-8333-333333333333", name: "Alpha Striker" }, relatedPlayer: null },
    { type: "YELLOW_CARD", minute: 45, addedMinute: 2, detail: null, playerName: "B. Defender", relatedPlayerName: null, club: { id: away.id, name: away.name }, player: null, relatedPlayer: null },
    { type: "SUBSTITUTION", minute: 60, addedMinute: null, detail: null, playerName: "B. Winger", relatedPlayerName: "B. Defender", club: { id: away.id, name: away.name }, player: null, relatedPlayer: null },
  ];
  it("puts home events on the left and away events on the right, with scorers under the score", () => {
    const $ = render(detail({ events }), "su-kien");
    const rows = $("#match-events ~ ol > li");
    expect(rows).toHaveLength(3);
    expect(rows.eq(0).find("div.grid > div").first().text()).toContain("Alpha Striker");
    expect(rows.eq(1).find("div.grid > div").last().text()).toContain("B. Defender");
    expect(rows.eq(1).text()).toContain("45+2′");
    expect(rows.eq(2).text()).toContain("Vào: B. Winger"); expect(rows.eq(2).text()).toContain("Ra: B. Defender");
    expect($("a[href='/player/player-33333333-3333-4333-8333-333333333333']").length).toBeGreaterThan(0);
    expect($("[aria-label='Bàn thắng đội nhà']").text()).toContain("Alpha Striker 12′");
  });
  it("shows statistics as home/away pairs with Vietnamese labels and percentages", () => {
    const stats: MatchDetail["stats"] = [
      { metric: "ball_possession", value: "0.58", unit: null, club: { id: home.id, name: home.name }, player: null },
      { metric: "ball_possession", value: "0.42", unit: null, club: { id: away.id, name: away.name }, player: null },
      { metric: "total_shots", value: "14", unit: null, club: { id: home.id, name: home.name }, player: null },
    ];
    const $ = render(detail({ stats }), "thong-ke");
    expect($("[aria-label='Kiểm soát bóng: 58% - 42%']")).toHaveLength(1);
    expect($("[aria-label='Tổng số cú sút: 14 - —']")).toHaveLength(1);
    expect(statLabel("big_chances_created")).toBe("Big chances created");
    expect(statValue("expected_goals", 1.234)).toBe("1.23");
  });
  it("draws the starting eleven by formation rows and lists the bench", () => {
    const lineups: MatchDetail["lineups"] = [{ clubId: home.id, formation: "4-3-3", players: [
      { name: "Alpha Keeper", number: 1, position: "Goalkeeper", starter: true, row: 0, slot: 0, playerId: null },
      { name: "Alpha Striker", number: 9, position: "Forward", starter: true, row: 1, slot: 0, playerId: "33333333-3333-4333-8333-333333333333", photoUrl: null },
      { name: "Alpha Sub", number: 18, position: "Midfielder", starter: false, row: null, slot: null, playerId: null },
    ] }];
    const $ = render(detail({ lineups }), "doi-hinh");
    const team = $("section[aria-label^='Đội hình Fixture Alpha']");
    expect(team.text()).toContain("4-3-3");
    // Forwards first (top of the pitch), goalkeeper last.
    expect(team.find("ol > li").first().text()).toContain("Striker");
    expect(team.find("ol > li").last().text()).toContain("Keeper");
    expect(team.text()).toContain("Dự bị"); expect(team.text()).toContain("Tiền vệ");
  });
  it("says plainly when a tab has no data yet", () => {
    expect(render(detail(), "su-kien")("[role=status]").text()).toContain("Chưa có dữ liệu diễn biến");
    expect(render(detail(), "doi-hinh")("[role=status]").text()).toContain("Chưa có đội hình");
    expect(render(detail(), "thong-ke")("[role=status]").text()).toContain("Chưa có dữ liệu thống kê");
  });
  it("shows the referee and credits the detail provider", () => {
    const $ = render(detail({ referee: "Fixture Referee", detailAttributions: [{ text: "Diễn biến, đội hình và thống kê: Highlightly", url: "https://highlightly.net" }] }), "du-kien");
    expect($.text()).toContain("Fixture Referee");
    expect($("a[href='https://highlightly.net']")).toHaveLength(1);
  });
});
