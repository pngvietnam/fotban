import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { MatchCard } from "../components/matches/match-card";
import { MatchList } from "../components/matches/match-list";
import { MatchDetailView } from "../components/matches/match-detail";
import { MatchFilters } from "../components/matches/match-filters";
import { MatchState } from "../components/matches/match-state";
import { MatchShell } from "../components/matches/match-shell";
import { defaultUiFilters, parseUiFilters, matchListHref } from "../lib/match-filters";
import { dateBounds, formatMatchTime, groupMatchesByDate, matchDayKey, scorePresentation } from "../lib/match-presentation";
import { loadMatchDetail, loadMatchList, queryMatchList } from "../services/match-ui-data";
import { uiDetail, uiMatch, uiNow } from "./fixtures/match-ui";

const filters = defaultUiFilters(uiNow);
const render = renderToStaticMarkup;
describe("Match UI", () => {
  it("renders grouped list cards with real links, competition, TLA, status, round and attribution", () => {
    const html = render(<MatchList filters={filters} now={uiNow} result={{ kind: "ready", data: { matches: [uiMatch()], total: 1, page: 1, pageSize: 50 } }} />);
    for (const text of ["Premier League", "Fixture Alpha", "ALP", "BET", "2 – 1", "Kết thúc", "Vòng 8", "02:00", "Hôm nay", "Football data provided by"]) expect(html).toContain(text);
    expect(html).toContain('href="/match/fixture-alpha-beta"');
    expect(html).not.toContain("<img"); expect(html).not.toContain("undefined");
  });
  it("renders upcoming kickoff instead of a pretend score", () => {
    const html = render(<MatchCard match={uiMatch({ status: "SCHEDULED", homeScore: null, awayScore: null })} now={uiNow} />);
    expect(html).toContain("Sắp diễn ra"); expect(html).toContain("Giờ thi đấu"); expect(html).toContain("02:00");
    expect(html).not.toContain("0 – 0");
  });
  it.each([["POSTPONED", "Hoãn"], ["CANCELLED", "Hủy"], ["LIVE", "Đang diễn ra"], ["HALFTIME", "Nghỉ giữa hiệp"], ["SUSPENDED", "Tạm dừng"]] as const)("labels %s clearly", (status, label) => {
    const html = render(<MatchCard match={uiMatch({ status })} now={uiNow} />);
    expect(html).toContain(label);
    if (status === "POSTPONED" || status === "CANCELLED") expect(html).not.toContain("2 – 1");
  });
  it("handles missing or one-sided scores without zero-filling", () => {
    const html = render(<MatchCard match={uiMatch({ homeScore: 2, awayScore: null })} now={uiNow} />);
    expect(html).toContain("Chưa có tỷ số"); expect(html).not.toContain("2 – 0"); expect(html).not.toContain("null");
  });
  it("uses honest text fallbacks for missing team metadata", () => {
    const html = render(<MatchCard match={uiMatch({ homeClub: null, awayClub: { name: "Fixture United" } })} now={uiNow} />);
    expect(html).toContain("Đội chủ nhà"); expect(html).toContain("FU"); expect(html).not.toContain("<img");
  });
  it("converts UTC to Vietnam time and groups matches after local midnight correctly", () => {
    expect(formatMatchTime("2026-10-15T19:00:00Z")).toBe("02:00");
    expect(matchDayKey("2026-10-15T19:00:00Z")).toBe("2026-10-16");
    expect(matchDayKey("2026-10-15T16:59:59Z")).toBe("2026-10-15");
    const groups = groupMatchesByDate([uiMatch(), uiMatch({ id: "fixture-2", kickoffAt: "2026-10-15T16:00:00Z" })]);
    expect(groups.map(([day]) => day)).toEqual(["2026-10-15", "2026-10-16"]);
    const bounds = dateBounds("2026-10-16", "2026-10-16", "Asia/Ho_Chi_Minh");
    expect(bounds.gte.toISOString()).toBe("2026-10-15T17:00:00.000Z"); expect(bounds.lt.toISOString()).toBe("2026-10-16T17:00:00.000Z");
    expect(dateBounds("2026-10-16", "2026-10-16").gte.toISOString()).toBe("2026-10-16T00:00:00.000Z");
  });
  it("separates extra-time totals and penalties from regulation scores", () => {
    const match = uiMatch({ homeScore: 1, awayScore: 1, homeExtraTimeScore: 1, awayExtraTimeScore: 1, homePenaltyScore: 5, awayPenaltyScore: 4, scoreDuration: "PENALTY_SHOOTOUT" });
    expect(scorePresentation(match)).toMatchObject({ text: "2 – 2", label: "Sau hiệp phụ", penalties: "5 – 4", regulation: "1 – 1" });
  });
  it("warns about stale non-final snapshots without changing their status", () => {
    const html = render(<MatchCard match={uiMatch({ status: "LIVE", lastUpdatedAt: "2026-10-14T00:00:00Z" })} now={uiNow} />);
    expect(html).toContain("Có thể đã cũ"); expect(html).toContain("Đang diễn ra");
  });
  it("renders an honest empty state", () => {
    const html = render(<MatchList filters={filters} now={uiNow} result={{ kind: "ready", data: { matches: [], total: 0, page: 1, pageSize: 50 } }} />);
    expect(html).toContain("Chưa có trận đấu"); expect(html).toContain("Đặt lại bộ lọc");
  });
  it("turns an API/service failure into a generic Vietnamese state without a stack or secret", async () => {
    const result = await loadMatchList(async () => { throw new Error("private-driver-stack-and-key"); });
    const html = render(<MatchList result={result} filters={filters} now={uiNow} />);
    expect(html).toContain("Chưa thể tải dữ liệu trận đấu"); expect(html).toContain('role="alert"'); expect(html).not.toContain("private-driver");
  });
  it("handles unknown league, bad dates and repeated query parameters", () => {
    expect(parseUiFilters({ league: "unknown-league" }, uiNow).success).toBe(false);
    expect(parseUiFilters({ from: "2026-02-30" }, uiNow).success).toBe(false);
    expect(parseUiFilters({ league: ["premier-league", "la-liga"] }, uiNow).success).toBe(false);
    expect(render(<MatchState kind="invalid-filter" />)).toContain("Bộ lọc chưa hợp lệ");
  });
  it("renders both league options, keyboard-friendly controls and canonical pagination/filter links", () => {
    const html = render(<MatchFilters filters={{ ...filters, league: "la-liga" }} counts={{ [filters.from]: 4 }} now={uiNow} />);
    const $ = load(html);
    expect($("nav[aria-label='Giải đấu'] a").map((_, node) => $(node).text()).get()).toEqual(["Tất cả giải", "Ngoại hạng Anh", "La Liga", "Champions League"]);
    expect($("nav[aria-label='Giải đấu'] a[aria-current=page]").text()).toBe("La Liga");
    expect($("nav[aria-label='Chọn ngày'] li")).toHaveLength(7);
    expect($("nav[aria-label='Chọn ngày'] a[aria-current=date]").attr("aria-label")).toBe("Hôm nay 16/10: 4 trận");
    expect(html).toContain('method="get"'); expect($("input[type=date][name=ngay]")).toHaveLength(1); expect($("input[type=hidden][name=league]").attr("value")).toBe("la-liga");
    expect(matchListHref({ ...filters, page: 2 }, { status: "live", page: 1 })).toBe("/matches?ngay=2026-10-16&status=live");
    expect(matchListHref(filters, { from: "2026-10-01", to: "2026-10-31", league: "la-liga" })).toBe("/matches?from=2026-10-01&to=2026-10-31&league=la-liga");
    const shell = render(<MatchShell><h1>Trận đấu</h1></MatchShell>);
    expect(shell).toContain('href="#match-content"'); expect(shell).toContain('aria-label="Điều hướng chính"');
  });
  it.each(["premier-league", "la-liga"])("passes the %s filter to the existing database service", async (league) => {
    const findMany = vi.fn().mockResolvedValue([]); const count = vi.fn().mockResolvedValue(0);
    const db = { match: { findMany, count } } as unknown as PrismaClient;
    await queryMatchList(db, { ...filters, league, from: "2026-10-16", to: "2026-10-16" });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ league: { slug: league }, kickoffAt: { gte: new Date("2026-10-15T17:00:00Z"), lt: new Date("2026-10-16T17:00:00Z") } }) }));
  });
  it("keeps the all-leagues view in scope and filters live/halftime in the database", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const db = { match: { findMany, count: vi.fn().mockResolvedValue(0) } } as unknown as PrismaClient;
    await queryMatchList(db, { ...filters, status: "live" });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ league: { slug: { in: ["premier-league", "la-liga", "champions-league"] } }, status: { in: ["LIVE", "HALFTIME"] } }) }));
  });
  it("renders available detail fields and omits invented stats or related features", () => {
    const html = render(<MatchDetailView match={uiDetail()} now={uiNow} />);
    for (const text of ["Chi tiết trận đấu", "Fixture Alpha FC", "Fixture Beta FC", "Fixture Ground", "2026/2027", "Vòng 8", "Asia/Ho_Chi_Minh"]) expect(html).toContain(text);
    for (const text of ["Kiểm soát bóng", "Số cú sút", "AI Match", "Fan Pulse", "undefined", "<img"]) expect(html).not.toContain(text);
    expect(html).toContain("Chưa tìm thấy highlight tiếng Việt từ nguồn được xác minh.");
    expect(html).not.toContain("https://www.youtube.com/watch?v=");
  });
  it("shows events/stats only when persisted records actually exist", () => {
    const alpha = "11111111-1111-4111-8111-111111111111";
    const html = render(<MatchDetailView now={uiNow} match={uiDetail({ homeClub: { id: alpha, name: "Fixture Alpha FC", shortName: "Fixture Alpha", tla: "ALP" }, events: [{ type: "GOAL", minute: 12, addedMinute: null, detail: null, club: { id: alpha, name: "Fixture Alpha" }, player: { name: "Fixture Player" }, relatedPlayer: null }], stats: [{ metric: "shots", value: "3", unit: null, club: { id: alpha, name: "Fixture Alpha" }, player: null }] })} />);
    expect(html).toContain("Bàn thắng"); expect(html).toContain("Fixture Player"); expect(html).toContain("Số cú sút"); expect(html).toContain("Xem tất cả thống kê");
    // Figures that cannot be placed on a side are not shown, and the facts tab then has no statistics block.
    expect(render(<MatchDetailView now={uiNow} match={uiDetail({ stats: [{ metric: "shots", value: "3", unit: null, club: { name: "Unknown" }, player: null }] })} />)).not.toContain("Thống kê nổi bật");
  });
  it("distinguishes an invalid/nonexistent slug from a service error", async () => {
    const read = vi.fn().mockResolvedValue(null);
    expect(await loadMatchDetail("../../unsafe", read)).toEqual({ kind: "not-found" }); expect(read).not.toHaveBeenCalled();
    expect(await loadMatchDetail("missing-match", read)).toEqual({ kind: "not-found" });
    expect(await loadMatchDetail("valid-match", async () => { throw new Error("private-key"); })).toEqual({ kind: "error" });
    expect(render(<MatchState kind="not-found" />)).toContain("Không tìm thấy trận đấu");
  });
});

describe("day-by-day match calendar", () => {
  it("defaults to today, reads ?ngay= as one day and keeps older ranges working", async () => {
    const { dayStrip, isSingleDay, longDay, shiftDay } = await import("../lib/match-filters");
    expect(defaultUiFilters(uiNow)).toMatchObject({ from: "2026-10-16", to: "2026-10-16", league: "all", status: "all", page: 1 });
    const day = parseUiFilters({ ngay: "2026-10-21", league: "champions-league" }, uiNow);
    expect(day.success && day.data).toMatchObject({ from: "2026-10-21", to: "2026-10-21", league: "champions-league" });
    expect(parseUiFilters({ ngay: "2026-02-30" }, uiNow).success).toBe(false);
    const range = parseUiFilters({ from: "2026-10-01", to: "2026-10-20" }, uiNow);
    expect(range.success && !isSingleDay(range.data)).toBe(true);
    expect(shiftDay("2026-10-30", 3)).toBe("2026-11-02");
    expect(dayStrip("2026-10-16", uiNow).map((item) => `${item.label} ${item.date}`)).toEqual(["T3 13/10", "T4 14/10", "Hôm qua 15/10", "Hôm nay 16/10", "Ngày mai 17/10", "CN 18/10", "T2 19/10"]);
    expect(longDay("2026-10-20")).toBe("Thứ Ba, 20/10/2026");
  });
  it("groups one day's matches by competition and points an empty day to the nearest match days", () => {
    const pl = uiMatch({ id: "a", league: { slug: "premier-league", name: "Premier League" } });
    const cl = uiMatch({ id: "b", league: { slug: "champions-league", name: "UEFA Champions League" } });
    const $ = load(render(<MatchList filters={filters} now={uiNow} result={{ kind: "ready", data: { matches: [cl, pl], total: 2, page: 1, pageSize: 50 } }} />));
    expect($("section h2").map((_, node) => $(node).text().replace(/\d+ trận$/, "").trim()).get()).toEqual(["Ngoại hạng Anh", "Champions League"]);
    const empty = load(render(<MatchList filters={filters} now={uiNow} nearest={{ previous: "2026-10-12", next: "2026-10-18" }} result={{ kind: "ready", data: { matches: [], total: 0, page: 1, pageSize: 50 } }} />));
    expect(empty("h2").text()).toBe("Không có trận đấu ngày Thứ Sáu, 16/10/2026");
    expect(empty("a").map((_, node) => empty(node).attr("href")).get()).toEqual(["/matches?ngay=2026-10-12", "/matches?ngay=2026-10-18"]);
  });
});
