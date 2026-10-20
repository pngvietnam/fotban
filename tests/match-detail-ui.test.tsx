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
  it("groups statistics by section, labels them in Vietnamese and sums total shots from inside + outside the box", () => {
    const stat = (metric: string, value: string, side: typeof home) => ({ metric, value, unit: null, club: { id: side.id, name: side.name }, player: null });
    const stats: MatchDetail["stats"] = [stat("possession", "0.58", home), stat("possession", "0.42", away), stat("shots_within_penalty_area", "9", home), stat("shots_outside_penalty_area", "5", home),
      stat("shots_within_penalty_area", "4", away), stat("shots_outside_penalty_area", "3", away), stat("throw_ins", "20", home), stat("brand_new_metric", "2", home)];
    const $ = render(detail({ stats }), "thong-ke");
    expect($("[aria-label='Kiểm soát bóng: 58% - 42%']")).toHaveLength(1);
    expect($("[aria-label='Tổng số cú sút: 14 - 7']")).toHaveLength(2); // summary and shots section
    expect($("[aria-label='Ném biên: 20 - —']")).toHaveLength(1);
    expect($("h3").map((_, node) => $(node).text()).get()).toEqual(["Tổng quan", "Sút bóng", "Bóng chết", "Khác"]);
    expect(statLabel("brand_new_metric")).toBe("Brand new metric");
    expect(statValue("expected_goals", 1.234)).toBe("1.23");
  });
  it("puts both teams on one pitch with ratings, match icons and the bench", () => {
    const striker = "33333333-3333-4333-8333-333333333333";
    const lineups: MatchDetail["lineups"] = [
      { clubId: home.id, formation: "4-3-3", players: [
        { name: "A. Keeper", number: 1, position: "Goalkeeper", starter: true, row: 0, slot: 0, playerId: null, rating: 6.4 },
        { name: "A. Striker", fullName: "Alpha Striker", number: 9, position: "Forward", starter: true, row: 1, slot: 0, playerId: striker, rating: 8.7 },
        { name: "A. Sub", fullName: "Alpha Sub", number: 18, position: "Midfielder", starter: false, row: null, slot: null, playerId: null, rating: 6.1 },
        { name: "A. Unused", number: 30, position: "Goalkeeper", starter: false, row: null, slot: null, playerId: null },
      ] },
      { clubId: away.id, formation: "4-4-2", players: [{ name: "B. Keeper", number: 1, position: "Goalkeeper", starter: true, row: 0, slot: 0, playerId: null, rating: 5.6 }] },
    ];
    const events: MatchDetail["events"] = [
      { type: "GOAL", minute: 12, addedMinute: null, detail: null, playerName: "A. Striker", relatedPlayerName: null, club: { id: home.id, name: home.name }, player: { id: striker, name: "Alpha Striker" }, relatedPlayer: null },
      { type: "YELLOW_CARD", minute: 30, addedMinute: null, detail: null, playerName: "Alpha Striker", relatedPlayerName: null, club: { id: home.id, name: home.name }, player: null, relatedPlayer: null },
      { type: "SUBSTITUTION", minute: 70, addedMinute: null, detail: null, playerName: "Alpha Sub", relatedPlayerName: "Alpha Striker", club: { id: home.id, name: home.name }, player: null, relatedPlayer: null },
    ];
    const $ = render(detail({ lineups, events }), "doi-hinh");
    const pitch = $("section[aria-label='Đội hình ra sân']");
    expect(pitch.text()).toContain("4-3-3"); expect(pitch.text()).toContain("4-4-2");
    // Home half: goalkeeper line first, then the forwards; the away half follows.
    const players = pitch.find("li[aria-label]").map((_, node) => $(node).attr("aria-label")).get();
    expect(players[0]).toBe("A. Keeper, số 1, điểm 6.4");
    expect(players[1]).toBe("A. Striker, số 9, điểm 8.7, cao nhất trận, 1 bàn, thẻ vàng phút 30, rời sân phút 70");
    expect(players[2]).toBe("B. Keeper, số 1, điểm 5.6");
    expect(pitch.find(`a[href='/player/player-${striker}']`)).toHaveLength(1);
    // Team rating: average of rated players (6.4, 8.7, 6.1).
    expect(pitch.text()).toContain("7.1");
    const bench = $("#lineup-bench").parent().find("li[aria-label]").map((_, node) => $(node).attr("aria-label")).get();
    expect(bench).toEqual(["A. Sub, số 18, điểm 6.1, vào sân phút 70", "A. Unused, số 30"]);
    expect($("#lineup-bench").parent().text()).toContain("Tiền vệ");
  });
  it("says plainly when a tab has no data yet", () => {
    expect(render(detail(), "su-kien")("[role=status]").text()).toContain("Chưa có dữ liệu diễn biến");
    expect(render(detail(), "doi-hinh")("[role=status]").text()).toContain("Chưa có đội hình");
    expect(render(detail(), "thong-ke")("[role=status]").text()).toContain("Chưa có dữ liệu thống kê");
  });
  it("shows the referee and credits the detail provider", () => {
    const $ = render(detail({ referee: "Referee, Fixture", detailAttributions: [{ text: "Diễn biến, đội hình và thống kê: Highlightly", url: "https://highlightly.net" }] }), "du-kien");
    expect($.text()).toContain("Fixture Referee");
    expect($("a[href='https://highlightly.net']")).toHaveLength(1);
  });
});
