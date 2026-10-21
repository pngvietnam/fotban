import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { describe, expect, it, vi } from "vitest";
import { matchLeagues } from "../lib/match-leagues";
import { competitionConfig } from "../providers/football-data/config";
import { highlightlyLeagues } from "../providers/highlightly/config";
import { initialVideoSources, registeredChannel } from "../providers/youtube/sources";
import { vietnameseLeagueAliases, vietnameseClubAliases } from "../providers/news/vietnamese-aliases";
import { relevantVietnameseFootball } from "../providers/news/vietnamese-provider";
import { classifyVideo } from "../services/video-policy";
import { isLeagueSlug, leagueNames } from "../services/league-hub";
import { leagueLinks } from "../lib/league-presentation";
import { parseNewsFilters } from "../lib/news-presentation";
import { timelineLeagues } from "../lib/match-timeline";
import { countryVi, nationalityVi } from "../lib/country-vi";
import { Crest, Empty, Facts, FixturePanel, FormDots, StandingsPanel, StoryGrid } from "../components/domain/domain-ui";
import { FollowLink } from "../components/account/follow-link";
import type { StandingRow } from "../types/league-hub";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn() }) }));

describe("Ligue 1 as a supported competition", () => {
  it("is configured everywhere a competition list is used", () => {
    expect(Object.keys(matchLeagues)).toContain("ligue-1");
    expect(competitionConfig["ligue-1"]).toMatchObject({ code: "FL1", name: "Ligue 1", country: "France" });
    expect(highlightlyLeagues["ligue-1"]).toEqual({ name: "Ligue 1", countries: ["France"] });
    expect(isLeagueSlug("ligue-1")).toBe(true); expect(leagueNames["ligue-1"]).toEqual({ name: "Ligue 1", country: "Pháp" });
    expect(leagueLinks.map((link) => link.slug)).toContain("ligue-1");
    expect(parseNewsFilters({ league: "ligue-1" })).toEqual({ league: "ligue-1", offset: 0 });
    expect(timelineLeagues.map((league) => league.slug)).toEqual(["premier-league", "la-liga", "ligue-1", "champions-league"]);
    expect(timelineLeagues.find((league) => league.slug === "ligue-1")).toMatchObject({ mark: "L1", rounds: 34, country: "Pháp" });
  });
  it("recognises Ligue 1 news by its Vietnamese names and aliases every club", () => {
    for (const title of ["Ligue 1: lịch thi đấu vòng 9", "VĐQG Pháp hấp dẫn", "Bóng đá Pháp cuối tuần"]) expect(relevantVietnameseFootball(title, null, [])).toBe(true);
    expect(vietnameseLeagueAliases["ligue-1"]).toContain("VĐQG Pháp");
    for (const id of ["524", "516", "523", "548", "522", "529", "576", "512", "511", "525", "533", "532", "519", "531", "535", "1045", "521", "546"]) expect(vietnameseClubAliases[id]?.length).toBeGreaterThan(0);
  });
  it("registers the VTVcab channel for Ligue 1 highlights only and classifies its titles", () => {
    const channel = registeredChannel("@OnChampionsLeague");
    expect(channel).toMatchObject({ league: "ligue-1", channelId: "UCbdlxg0t8O7WGPrFsVcz6Gg", feedAuthor: "VTVcab - On Champions League" });
    expect(initialVideoSources.filter((entry) => entry.league === "ligue-1")).toHaveLength(1);
    expect(classifyVideo("Highlights LYON vs NICE | 4 phút ngược dòng đỉnh cao, Nakamura thi triển nhận thẻ đỏ | Ligue 1 26/27")).toBe("HIGHLIGHT");
  });
});

describe("Vietnamese country names", () => {
  it("translates countries and lists of nationalities and keeps unknown names", () => {
    expect(countryVi("France")).toBe("Pháp"); expect(countryVi("Narnia")).toBe("Narnia"); expect(countryVi(null)).toBeNull();
    expect(nationalityVi("Sweden, Hungary")).toBe("Thụy Điển, Hungary"); expect(nationalityVi("")).toBeNull();
  });
});

const row = (position: number, overrides: Partial<StandingRow> = {}): StandingRow => ({ position, clubId: `c${position}`, name: `Club ${position} FC`, shortName: `Club ${position}`, tla: null, crestUrl: null, played: 7, won: 4, drawn: 2, lost: 1, goalsFor: 10, goalsAgainst: 5, goalDifference: 5, points: 14, form: ["W", "D", "L"], ...overrides });
describe("league, club and player blocks", () => {
  it("renders the full table with form and a compact overview, emphasising followed clubs", () => {
    const data = { rows: [row(1), row(2, { goalDifference: -3, points: null }), row(3)], fetchedAt: "2026-10-20T10:17:00Z" };
    const full = load(renderToStaticMarkup(<StandingsPanel data={data} leagueName="Ligue 1" seasonName="2026/2027" highlight={["c2"]} />));
    expect(full(".dp-standing-head span").map((_, node) => full(node).text()).get()).toEqual(["#", "CLB", "Trận", "T", "H", "B", "Bàn", "HS", "Điểm", "Phong độ"]);
    expect(full("a.dp-standing").first().attr("href")).toBe("/club/club-c1"); expect(full("a.dp-standing.followed")).toHaveLength(1);
    const second = full("a.dp-standing").eq(1).text(); expect(second).toContain("-3"); expect(second).toContain("–"); expect(second).not.toContain("null");
    expect(full(".dp-form").first().attr("aria-label")).toBe("Phong độ: Thắng, Hòa, Thua");
    const compact = load(renderToStaticMarkup(<StandingsPanel data={data} leagueName="Ligue 1" limit={2} />));
    expect(compact("a.dp-standing")).toHaveLength(2); expect(compact(".dp-form")).toHaveLength(0);
    expect(load(renderToStaticMarkup(<StandingsPanel data={{ rows: [], fetchedAt: null }} leagueName="Ligue 1" />)).text()).toContain("Chưa có dữ liệu bảng xếp hạng");
  });
  it("lists fixtures with real links and scores, never a made-up score, and uses letters for missing crests", () => {
    const fixtures = [
      { slug: "m1", kickoffAt: "2026-10-19T18:45:00Z", status: "FINISHED", round: "8", home: { name: "Olympique Lyonnais", tla: "LYO", crestUrl: "https://crests.football-data.org/523.png" }, away: { name: "OGC Nice", tla: "NIC", crestUrl: "https://evil.example/x.png" }, homeScore: 2, awayScore: 1 },
      { slug: "m2", kickoffAt: "2026-10-25T19:45:00Z", status: "POSTPONED", round: "9", home: { name: "Lille OSC", tla: null, crestUrl: null }, away: { name: "AS Monaco", tla: null, crestUrl: null }, homeScore: null, awayScore: null },
    ];
    const $ = load(renderToStaticMarkup(<FixturePanel title="Lịch đấu & kết quả" fixtures={fixtures} action={{ href: "/matches", label: "Xem tất cả →" }} />));
    expect($("a.dp-fixture").map((_, node) => $(node).attr("href")).get()).toEqual(["/match/m1", "/match/m2"]);
    expect($("a.dp-fixture b").map((_, node) => $(node).text()).get()).toEqual(["2 – 1", "—"]);
    expect($("a.dp-fixture").first().find("img")).toHaveLength(1); expect($("a.dp-fixture").first().find(".dp-crest-fallback").text()).toBe("ON");
    expect(load(renderToStaticMarkup(<FixturePanel title="x" fixtures={[]} empty="Chưa có lịch." />)).text()).toContain("Chưa có lịch.");
  });
  it("leaves out facts without a value instead of filling them in, and shows empty and error states", () => {
    const $ = load(renderToStaticMarkup(<Facts items={[["Vị trí", "Thủ môn"], ["Tuổi", null], ["Quốc tịch", ""]]} />));
    expect($("dt").map((_, node) => $(node).text()).get()).toEqual(["Vị trí"]);
    expect(load(renderToStaticMarkup(<StoryGrid result={{ kind: "error" }} now={new Date()} />)).text()).toContain("Chưa thể tải tin");
    expect(load(renderToStaticMarkup(<StoryGrid result={{ kind: "ready", data: { groups: [], nextOffset: null } }} now={new Date()} empty={{ title: "Chưa có tin", text: "Thử lại sau." }} />))(".dp-empty a").attr("href")).toBe("/news");
    expect(renderToStaticMarkup(<StoryGrid result={{ kind: "ready", data: { groups: [], nextOffset: null } }} now={new Date()} />)).toBe("");
    expect(load(renderToStaticMarkup(<Empty title="T" text="X" />))("[role=status]")).toHaveLength(1);
    expect(renderToStaticMarkup(<FormDots form={[]} />)).toContain("—");
    expect(renderToStaticMarkup(<Crest url={null} name="Paris Saint-Germain" />)).toContain("PS");
  });
  it("offers a follow button that keeps the account link and names what is followed", () => {
    const $ = load(renderToStaticMarkup(<FollowLink type="CLUB" entityId="c1" name="PSG" variant="button" />));
    expect($("a").attr("href")).toBe("/account?type=CLUB&entityId=c1"); expect($("a").text()).toBe("+ Theo dõi"); expect($("a").attr("aria-label")).toBe("Theo dõi PSG");
    expect(load(renderToStaticMarkup(<FollowLink type="CLUB" entityId="c1" name="PSG" />))("a").text()).toBe("Theo dõi PSG");
  });
});
