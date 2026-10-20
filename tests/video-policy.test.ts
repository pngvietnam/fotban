import { describe, expect, it } from "vitest";
import { classifyVideo, primaryVideo, sourceAllowed, statedDates, validateVideo } from "../services/video-policy";
import { videoCandidate, videoMapping, videoMatch, videoNow, videoSource } from "./fixtures/videos";

const entry = () => ({ video: videoCandidate(), source: videoSource(), mapping: videoMapping() });
describe("reviewed match highlights policy", () => {
  it("prefers a verified VN rights-holder over international official highlights", () => {
    const vn = entry(); const official = { ...entry(), source: videoSource({ sourceType: "OFFICIAL_LEAGUE", country: "GB", language: "en" }), mapping: videoMapping({ language: "en", rightsType: "OFFICIAL_LINK" }) };
    expect(primaryVideo([official, vn], videoMatch, videoNow)).toEqual(vn);
  });
  it("other approved Vietnamese channels beat international broadcasters", () => {
    const vn = { ...entry(), source: videoSource({ sourceType: "TRUSTED_MEDIA" }) };
    const other = { ...entry(), source: videoSource({ country: "GB", sourceType: "BROADCASTER" }), mapping: videoMapping({ language: "en", rightsType: "REVIEWED_FALLBACK" }) };
    expect(primaryVideo([other, vn], videoMatch, videoNow)).toEqual(vn);
  });
  it("official league beats an unverified reupload regardless of priority", () => {
    const random = { ...entry(), source: videoSource({ verified: false, priority: 0 }) };
    const official = { ...entry(), source: videoSource({ country: "GB", sourceType: "OFFICIAL_LEAGUE" }), mapping: videoMapping({ rightsType: "OFFICIAL_LINK" }) };
    expect(primaryVideo([random, official], videoMatch, videoNow)).toEqual(official);
    expect(primaryVideo([random], videoMatch, videoNow)).toBeNull();
  });
  it.each(["HIGHLIGHTS: Arsenal vs Liverpool | Premier League", "HIGHLIGHTS: Arsenal news | Premier League", "HIGHLIGHTS: Arsenal Chelsea | La Liga", "HIGHLIGHTS: Arsenal Chelsea Women | Premier League", "HIGHLIGHTS: Arsenal Chelsea U21 | Premier League", "HIGHLIGHTS: Arsenal Chelsea Classic 2024 | Premier League", "HIGHLIGHTS: Arsenal Chelsea | Premier League 10/10/2026"])("rejects weak/wrong events: %s", (title) => {
    expect(validateVideo(videoCandidate({ title, description: null }), videoSource(), videoMapping(), videoMatch, videoNow).valid).toBe(false);
  });
  it.each(["REACTION: Arsenal Chelsea highlights | Premier League", "WATCH ALONG: Arsenal Chelsea highlights | Premier League", "ANALYSIS: Arsenal Chelsea highlights | Premier League", "PRESS CONFERENCE: Arsenal Chelsea | Premier League"])("never selects ancillary content: %s", (title) => {
    expect(primaryVideo([{ ...entry(), video: videoCandidate({ title }) }], videoMatch, videoNow)).toBeNull();
  });
  it("prefers standard highlight over extended/goals in the same source tier", () => {
    const standard = entry(); const extended = { ...entry(), video: videoCandidate({ externalId: "fixture0002", title: "Extended highlights Arsenal Chelsea Premier League" }) };
    expect(primaryVideo([extended, standard], videoMatch, videoNow)).toEqual(standard);
    expect(classifyVideo("Tổng hợp bàn thắng Arsenal Chelsea")).toBe("GOALS");
    expect(classifyVideo("Goals: Arsenal Chelsea Premier League")).toBe("GOALS");
    expect(classifyVideo("Highlights mở rộng: Arsenal Chelsea Premier League")).toBe("EXTENDED_HIGHLIGHT");
  });
  it("rejects disabled, expired, wrong-market and stale-review mappings", () => {
    expect(sourceAllowed(videoSource({ enabled: false }), videoMapping(), videoMatch, videoNow)).toBe(false);
    expect(sourceAllowed(videoSource(), videoMapping({ validTo: "2026-10-17T00:00:00Z" }), videoMatch, videoNow)).toBe(false);
    expect(sourceAllowed(videoSource(), videoMapping({ season: "2025/2026" }), videoMatch, videoNow)).toBe(false);
    expect(sourceAllowed(videoSource(), videoMapping({ market: "GB" }), videoMatch, videoNow)).toBe(false);
    expect(sourceAllowed(videoSource({ lastVerifiedAt: "2025-10-17T00:00:00Z" }), videoMapping(), videoMatch, videoNow)).toBe(false);
  });
  it.each(["PRIVATE", "REMOVED", "UNKNOWN", "UNAVAILABLE"] as const)("rejects unavailable state %s", (availability) => {
    expect(primaryVideo([{ ...entry(), video: videoCandidate({ availability }) }], videoMatch, videoNow)).toBeNull();
  });
  it("rejects geo-blocks, another channel, prematch and late uploads", () => {
    for (const change of [{ vietnamAvailability: "UNAVAILABLE" as const }, { channelId: `UC${"z".repeat(22)}` }, { publishedAt: "2026-10-16T18:00:00Z" }, { publishedAt: "2026-10-20T21:00:00Z" }]) expect(primaryVideo([{ ...entry(), video: videoCandidate(change) }], videoMatch, videoNow)).toBeNull();
  });
});

describe("titles used by Vietnamese rights holders (verified 2026-10-20 on their public feeds)", () => {
  const at = (title: string, publishedAt = "2026-10-17T00:30:00Z", match = videoMatch) => {
    const result = validateVideo(videoCandidate({ title, description: null, publishedAt }), videoSource(), videoMapping(), match, videoNow);
    return result.valid && ["HIGHLIGHT", "EXTENDED_HIGHLIGHT", "GOALS"].includes(classifyVideo(title));
  };
  it("reads a season such as 26/27 as a season, not as a date", () => {
    expect(at("HIGHLIGHTS: ARSENAL - CHELSEA | KỊCH TÍNH ĐẾN PHÚT CUỐI | NGOẠI HẠNG ANH 26/27")).toBe(true);
    expect(at("HIGHLIGHTS: ARSENAL - CHELSEA | NGOẠI HẠNG ANH 2026/27")).toBe(true);
    expect(statedDates("NGOẠI HẠNG ANH 26/27")).toEqual([]);
    expect(statedDates("THẾ GIỚI NGOẠI HẠNG (19/10): ...")).toEqual(["19/10"]);
    expect(statedDates("Arsenal Chelsea 19.10.2026")).toEqual(["19/10"]);
    // A real date that is not the match day still rules the video out.
    expect(at("HIGHLIGHTS: ARSENAL - CHELSEA (20/10) | NGOẠI HẠNG ANH 26/27")).toBe(false);
  });
  it("accepts SCTV-style 'HOME - AWAY | headline | COMPETITION' titles without the word highlight", () => {
    expect(classifyVideo("REAL MADRID - SEVILLA | BƯỚC CHẠY ĐÀ QUAN TRỌNG CHO EL CLASICO | LALIGA EA SPORTS 26/27")).toBe("HIGHLIGHT");
    expect(at("ARSENAL - CHELSEA | CHIẾN THẮNG NHẸ NHÀNG | NGOẠI HẠNG ANH 26/27")).toBe(true);
  });
  it("leaves out half-time clips, single moments and round-ups", () => {
    expect(at("ARSENAL - CHELSEA | THẾ TRẬN GIẰNG CO | ĐIỂM NHẤN HIỆP 1 | NGOẠI HẠNG ANH 26/27", "2026-10-16T19:30:00Z")).toBe(false);
    expect(at("SAKA \"NỔ\" SIÊU PHẨM SÚT XA | NGOẠI HẠNG ANH 26/27")).toBe(false);
    expect(at("THẾ GIỚI NGOẠI HẠNG (17/10): ARSENAL NHỌC NHẰN")).toBe(false);
  });
  it("recognises Champions League highlights", () => {
    const cl = { ...videoMatch, leagueSlug: "champions-league" };
    expect(at("HIGHLIGHTS: ARSENAL - CHELSEA | UEFA CHAMPIONS LEAGUE 26/27", undefined, cl)).toBe(true);
    expect(at("HIGHLIGHTS: ARSENAL - CHELSEA | CÚP C1 CHÂU ÂU", undefined, cl)).toBe(true);
  });
});
