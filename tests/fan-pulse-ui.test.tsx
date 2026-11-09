import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { describe, expect, it, vi } from "vitest";
import { FanTalkHome, FanTalkPanel } from "../components/fan/fan-talk";
import { Overview, type OverviewData } from "../components/home/overview";
import type { FanPulse, MatchFanPulse } from "../services/fan-pulse";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
const pulse = (overrides: Partial<FanPulse> = {}): FanPulse => ({
  total: 8214, read: 100, kept: 74, videos: 1, videoUrl: "https://www.youtube.com/watch?v=abcdefghijk", updatedAt: "2026-11-09T05:00:00.000Z",
  chips: [{ kind: "player", key: "p1", label: "Kylian Mbappé", count: 82 }, { kind: "topic", key: "referee", label: "Trọng tài & VAR", count: 35 }],
  quotes: [
    { id: "q1", text: "Mbappé quá đỉnh, trọng tài bắt penalty sai rõ ràng", likeCount: 1520, publishedAt: "2026-11-08T22:00:00.000Z", url: "https://www.youtube.com/watch?v=abcdefghijk&lc=q1", matchId: "m1", match: null },
    { id: "q2", text: "Arteta cần thay đổi chiến thuật ngay", likeCount: 80, publishedAt: "2026-11-08T22:00:00.000Z", url: "https://www.youtube.com/watch?v=abcdefghijk&lc=q2", matchId: "m1", match: null },
    { id: "q3", text: "Hàng thủ quá tệ", likeCount: 12, publishedAt: "2026-11-08T22:00:00.000Z", url: "https://www.youtube.com/watch?v=abcdefghijk&lc=q3", matchId: "m1", match: null },
  ],
  ...overrides,
});
const matchPulse = (slug: string, overrides: Partial<FanPulse> = {}): MatchFanPulse => ({ ...pulse(overrides), match: { id: slug, slug, status: "FINISHED", kickoffAt: "2026-11-08T20:00:00.000Z", homeScore: 2, awayScore: 1,
  home: { id: "h", name: "Real Madrid", fullName: "Real Madrid CF", crestUrl: "https://crests.football-data.org/86.png" }, away: { id: "a", name: "Arsenal", fullName: "Arsenal FC", crestUrl: "javascript:alert(1)" } } });

describe("fan pulse blocks", () => {
  it("shows up to three hot matches with counts, what fans name most and two quoted comments, all linked out safely", () => {
    const $ = load(renderToStaticMarkup(<FanTalkHome pulses={[matchPulse("a"), matchPulse("b", { total: null }), matchPulse("c"), matchPulse("d")]} />));
    expect($(".fan-section h2").text()).toBe("Fan đang nói gì");
    expect($(".fan-card")).toHaveLength(3);
    const first = $(".fan-card").first();
    expect(first.find(".fan-match").attr("href")).toBe("/match/a");
    expect(first.find(".fan-match").text()).toBe("Real Madrid2 – 1Arsenal");
    expect(first.find(".fan-match img")).toHaveLength(1);
    expect(first.find(".fan-count").text()).toBe("8.214 bình luận trên YouTube · đọc 100 bình luận nổi bật");
    expect($(".fan-card").eq(1).find(".fan-count").text()).toBe("đọc 100 bình luận nổi bật");
    expect(first.find(".fan-chip").map((_, node) => $(node).text()).get()).toEqual(["Kylian Mbappé 82 bình luận", "Trọng tài & VAR 35 bình luận"]);
    expect(first.find(".fan-quote")).toHaveLength(2);
    expect(first.find(".fan-quote blockquote").first().text()).toBe("Mbappé quá đỉnh, trọng tài bắt penalty sai rõ ràng");
    expect(first.find(".fan-likes").first().text()).toBe("♥ 1.520 lượt thích");
    expect(first.find(".fan-yt").attr("href")).toBe("https://www.youtube.com/watch?v=abcdefghijk");
    $("a[target=_blank]").each((_, node) => { expect($(node).attr("rel")).toBe("noopener noreferrer nofollow"); expect($(node).text()).toContain("(mở thẻ mới)"); });
    expect($(".fan-quote-link").first().attr("href")).toBe("https://www.youtube.com/watch?v=abcdefghijk&lc=q1");
    expect($(".fan-note").text()).toContain("không phải tin đã kiểm chứng");
    expect($.html()).not.toContain("javascript:");
  });
  it("renders nothing without comments", () => {
    expect(renderToStaticMarkup(<FanTalkHome pulses={[]} />)).toBe("");
    expect(renderToStaticMarkup(<FanTalkPanel title="Fan nói gì về trận này" pulse={null} />)).toBe("");
  });
  it("gives the match page all three quotes and the club page the match each quote is about", () => {
    const match = load(renderToStaticMarkup(<FanTalkPanel title="Fan nói gì về trận này" pulse={pulse()} />));
    expect(match("#fan-panel-title").text()).toBe("Fan nói gì về trận này");
    expect(match(".fan-panel").hasClass("wide")).toBe(false);
    expect(match(".fan-quote")).toHaveLength(3);
    const club = load(renderToStaticMarkup(<FanTalkPanel title="Fan nói gì về Arsenal" pulse={pulse({ quotes: [{ ...pulse().quotes[0], match: "Arsenal 2–1 Man City" }], chips: [] })} wide />));
    expect(club(".fan-panel").hasClass("wide")).toBe(true);
    expect(club(".fan-quote-match").text()).toBe("Arsenal 2–1 Man City");
    expect(club(".fan-chips")).toHaveLength(0);
  });
  it("is fed into the homepage through the overview data", () => {
    const data = { ribbon: [], quick: [], cover: null, followups: [], updates: [], updateTab: "tat-ca", deepReads: [], bites: [], transfers: [], standings: null, highlights: [], fans: [matchPulse("a")], hot: { matches: [], topics: [] }, scorers: null, mine: [], suggest: [], viewer: { signedIn: false, clubs: [], next: null }, briefReady: false } satisfies OverviewData;
    const $ = load(renderToStaticMarkup(<Overview data={data} now={new Date("2026-11-09T05:00:00Z")} />));
    expect($(".ov-main .fan-section .fan-card")).toHaveLength(1);
  });
});
