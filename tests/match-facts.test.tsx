import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { MatchDetailView } from "../components/matches/match-detail";
import { scorerLines } from "../components/matches/match-tab-views";
import { MatchMomentum, NextMatchCards, shortClub } from "../components/matches/match-facts";
import { normalizeHeadToHead } from "../providers/highlightly/normalization";
import { pairKey } from "../services/head-to-head";
import { tally, type MatchHub } from "../services/match-hub";
import { uiDetail, uiMatch, uiNow } from "./fixtures/match-ui";
import type { MatchDetail } from "../types/match-ui";

const home = { id: "11111111-1111-4111-8111-111111111111", name: "Fixture Alpha FC", shortName: "Fixture Alpha", tla: "ALP" };
const away = { id: "22222222-2222-4222-8222-222222222222", name: "Fixture Beta FC", shortName: "Fixture Beta", tla: "BET" };
const detail = (overrides: Partial<MatchDetail> = {}) => uiDetail({ ...uiMatch({ homeClub: home, awayClub: away }), events: [], stats: [], ...overrides });
const event = (type: string, minute: number, side: typeof home, name: string, extra: Partial<MatchDetail["events"][number]> = {}): MatchDetail["events"][number] =>
  ({ type, minute, addedMinute: null, detail: null, playerName: name, relatedPlayerName: null, club: { id: side.id, name: side.name }, player: null, relatedPlayer: null, ...extra });

describe("head to head from the data provider", () => {
  const meeting = (id: number, date: string, current: string | null, description = "Finished") => ({ id, date, round: "Round 1", league: { name: "Premier League", season: 2024 }, homeTeam: { id: 1, name: "A" }, awayTeam: { id: 2, name: "B" }, state: { description, score: { current, penalties: null } } });
  it("keeps finished meetings with a readable score, newest first", () => {
    const rows = normalizeHeadToHead([meeting(1, "2024-01-01T15:00:00Z", "2 - 1"), meeting(2, "2025-03-01T15:00:00Z", "0 - 0"), meeting(3, "2026-11-01T15:00:00Z", null, "Not started"), meeting(4, "2025-05-01T15:00:00Z", "1 - 1", "Postponed"), { broken: true }]);
    expect(rows.map((row) => [row.id, row.homeScore, row.awayScore, row.competition])).toEqual([["2", 0, 0, "Premier League"], ["1", 2, 1, "Premier League"]]);
  });
  it("stores one row per pair of clubs, smaller provider id first", () => {
    expect(pairKey("490109", "43334")).toEqual(["43334", "490109"]);
    expect(pairKey("43334", "490109")).toEqual(["43334", "490109"]);
  });
  it("counts wins for the page's home club whichever side it played on", () => {
    const at = (homeIsPageHome: boolean, homeScore: number, awayScore: number) => ({ key: `${homeIsPageHome}${homeScore}${awayScore}`, date: "2025-01-01T00:00:00Z", competition: null, homeIsPageHome, homeScore, awayScore, penalties: null, slug: null });
    expect(tally([at(true, 2, 0), at(false, 2, 0), at(false, 0, 3), at(true, 1, 1)])).toEqual({ homeWins: 2, draws: 1, awayWins: 1 });
  });
  it("says plainly when the clubs have never met before this match", () => {
    const hub: MatchHub = { league: null, standings: null, home: null, away: null, headToHead: { meetings: [], homeWins: 0, draws: 0, awayWins: 0, source: "provider" } };
    const $ = load(renderToStaticMarkup(<MatchDetailView match={detail()} now={uiNow} tab="doi-dau" hub={hub} />));
    expect($("[role='status']").text()).toBe("Fixture Alpha FC và Fixture Beta FC chưa gặp nhau trước trận này.");
  });
});

describe("Dữ kiện summary", () => {
  it("puts every goal of one scorer on one line and adds red cards after the goals", () => {
    const lines = scorerLines(detail({ events: [event("GOAL", 34, home, "P. Foden"), event("RED_CARD", 70, home, "R. Dias"), event("PENALTY", 65, home, "P. Foden"), event("GOAL", 12, home, "E. Anderson"), event("GOAL", 52, away, "S. Pilios")] }));
    expect(lines?.home).toEqual([{ text: "P. Foden 34′, 65′ (pen)", kind: "goal" }, { text: "E. Anderson 12′", kind: "goal" }, { text: "R. Dias 70′", kind: "red" }]);
    expect(lines?.away).toEqual([{ text: "S. Pilios 52′", kind: "goal" }]);
  });
  it("leaves the full event list to the Sự kiện tab", () => {
    const $ = load(renderToStaticMarkup(<MatchDetailView match={detail({ events: [event("GOAL", 12, home, "A. Striker")] })} now={uiNow} />));
    expect($("#match-events")).toHaveLength(0);
    expect($("[aria-label='Bàn thắng và thẻ đỏ đội nhà']").text()).toBe("A. Striker 12′");
  });
  it("draws Thế trận from the shot list only, and leaves it out with too few shots", () => {
    const shot = (clubId: string, minute: number, addedMinute: number | null = null) => ({ clubId, minute, addedMinute, playerName: null, outcome: "MISSED", goalTarget: null, player: null });
    const shots = [shot(home.id, 3), shot(home.id, 44, 2), shot(away.id, 47), shot(away.id, 88), shot(home.id, 90, 4)];
    const $ = load(renderToStaticMarkup(<MatchMomentum match={detail({ shots, events: [event("GOAL", 47, away, "B. Striker")] })} />));
    expect($("svg[role='img']").attr("aria-label")).toBe("Thế trận theo số cú sút mỗi 5 phút. Fixture Alpha FC: 3 cú sút (2 trong hiệp 1, 1 trong hiệp 2). Fixture Beta FC: 2 cú sút (0 trong hiệp 1, 2 trong hiệp 2).");
    expect($("rect.home")).toHaveLength(3); expect($("rect.away")).toHaveLength(2);
    expect($(".mf-goal.away")).toHaveLength(1);
    expect(renderToStaticMarkup(<MatchMomentum match={detail({ shots: shots.slice(0, 3) })} />)).toBe("");
  });
  it("lays out each club's next fixture as FotMob does: competition, crests and time, names and day", () => {
    const next = { slug: "next-1", kickoffAt: "2026-10-25T14:00:00Z", status: "SCHEDULED", round: "9", home: { name: "Liverpool FC", tla: "LIV", crestUrl: null }, away: { name: "Brighton & Hove Albion FC", tla: "BHA", crestUrl: null }, homeScore: null, awayScore: null, competition: { name: "Premier League", slug: "premier-league" } };
    const hub: MatchHub = { league: null, standings: null, home: { recent: [], next }, away: { recent: [], next }, headToHead: { meetings: [], homeWins: 0, draws: 0, awayWins: 0, source: "stored" } };
    const $ = load(renderToStaticMarkup(<NextMatchCards hub={hub} />));
    expect($(".mf-next")).toHaveLength(1);
    expect($(".mf-next-comp").text()).toBe("Ngoại hạng Anh");
    expect($(".mf-next-time").text()).toBe("21:00");
    expect($(".mf-next-day").text()).toBe("CN, 25 thg 10");
    expect($(".mf-next-name").map((_, node) => $(node).text()).get()).toEqual(["Liverpool", "Brighton & Hove Albion"]);
    expect(shortClub("AFC Bournemouth")).toBe("Bournemouth");
  });
});
