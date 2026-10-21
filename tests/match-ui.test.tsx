import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { MatchDetailView } from "../components/matches/match-detail";
import { MatchState } from "../components/matches/match-state";
import { MatchShell } from "../components/matches/match-shell";
import { dateBounds, formatMatchTime, groupMatchesByDate, matchDayKey, scorePresentation } from "../lib/match-presentation";
import { longDay } from "../lib/match-filters";
import { loadMatchDetail } from "../services/match-ui-data";
import { uiDetail, uiMatch, uiNow } from "./fixtures/match-ui";

const render = renderToStaticMarkup;
describe("Match UI", () => {
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
  it("renders available detail fields and omits invented stats or related features", () => {
    const html = render(<MatchDetailView match={uiDetail()} now={uiNow} />);
    for (const text of ["Chi tiết trận đấu", "Fixture Alpha FC", "Fixture Beta FC", "Fixture Ground", "2026/2027", "Vòng 8", "Giờ Việt Nam (UTC+7)"]) expect(html).toContain(text);
    for (const text of ["Kiểm soát bóng", "Số cú sút", "AI Match", "Fan Pulse", "undefined", "<img"]) expect(html).not.toContain(text);
    expect(html).toContain("Chưa có highlight tiếng Việt từ kênh bản quyền.");
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
  it("renders the shell with a skip link and long Vietnamese day names", () => {
    const shell = render(<MatchShell><h1>Trận đấu</h1></MatchShell>);
    expect(shell).toContain('href="#match-content"'); expect(shell).toContain('aria-label="Điều hướng chính"');
    expect(longDay("2026-10-20")).toBe("Thứ Ba, 20/10/2026");
  });
});
