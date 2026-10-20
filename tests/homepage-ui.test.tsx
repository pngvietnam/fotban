import React from "react";
import { renderToStaticMarkup as render } from "react-dom/server";
import { load } from "cheerio";
import { describe, expect, it, vi } from "vitest";
import { MorningHomepage, HomeStoryCard } from "../components/home/morning-homepage";
import { composeHomepage, loadHomepage } from "../services/morning-homepage";
import { developmentPreview, homeDate, homeTime, homepageMetadata, homeReliabilityLabels } from "../lib/homepage-presentation";
import { homeBrief, homeEnrichment, homeMatch, homepageFixture } from "./fixtures/homepage";
import { briefNow, briefStory } from "./fixtures/briefs";
import { vidId } from "./fixtures/videos";
import { emptyTransferFacts } from "../types/transfers";

const page = (view = homepageFixture()) => render(<MorningHomepage result={{ kind: "ready", view }} now={briefNow} />);
describe("Vietnamese morning experience", () => {
  it("renders published brief summary/header with a compact active navigation", () => {
    const html = page(); const $ = load(html);
    expect($("h1").text()).toBe("Bản tin sáng"); expect(html).toContain("Chủ Nhật, 18/10/2026"); expect(html).toContain("08:04"); expect($("nav a[aria-current='page']").text()).toBe("Bảng tin"); expect($("section[aria-labelledby='morning-summary'] ol li")).toHaveLength(1);
    expect($("a[href='#morning-content']")).toHaveLength(1); expect(html).not.toContain("Trạng thái thiết lập"); expect(html).not.toContain("API_KEY");
  });
  it("links summary points to rendered cards without repeating full cards", () => { const $ = load(page()); const href = $("section[aria-labelledby='morning-summary'] ol a").attr("href")!; expect($(href)).toHaveLength(1); expect($("article")).toHaveLength(1); });
  it("renders completed scores and a clear missing verified-highlight fallback", () => {
    const html = page(homepageFixture([homeMatch()])); const $ = load(html); expect($("#home-results")).toHaveLength(1); expect(html).toContain("2 – 1"); expect(html).toContain("Kết thúc"); expect(html).toContain("Chưa có highlight từ nguồn được xác minh."); expect($("#home-highlights")).toHaveLength(0); expect($("a[href='/match/test-match-1']")).toHaveLength(1);
  });
  it("renders verified highlight source, type, time and safe external watch link", () => {
    const match = homeMatch(); const brief = homeBrief([match]); brief.highlights[match.key] = { url: "https://www.youtube.com/watch?v=test-only", title: "Original video title", channelName: "Verified fixture channel", videoType: "HIGHLIGHT", publishedAt: "2026-10-17T21:00:00Z", checkedAt: "2026-10-18T01:00:00Z", language: "vi", vietnamAvailability: "UNKNOWN" };
    const html = page(composeHomepage(brief, new Map(), { partial: false, staleInputs: false }, briefNow)); const $ = load(html);
    expect($("#home-highlights")).toHaveLength(1); for (const link of $("a[href*='youtube.com']").toArray()) { expect($(link).attr("target")).toBe("_blank"); expect($(link).attr("rel")).toContain("noopener"); expect($(link).attr("aria-label")).toContain("Verified fixture channel"); }
    expect(html).not.toContain("<iframe"); expect(html).not.toContain("playable");
  });
  it.each(Object.entries(homeReliabilityLabels))("renders backend %s label in Vietnamese", (label, text) => {
    const view = homepageFixture(); view.sections[0].items[0].item.reliability.label = label as keyof typeof homeReliabilityLabels;
    expect(page(view)).toContain(text);
  });
  it.each(["CONFIRMED", "NEGOTIATION", "INTEREST", "RUMOR"] as const)("renders %s transfer status, roles and uncertainty unchanged", (status) => {
    const candidate = briefStory(5, { section: "TRANSFERS", transferId: vidId(50), transferStatus: status, titleVi: status === "CONFIRMED" ? "Arsenal xác nhận chiêu mộ Player X" : "Player X được cho là có thể tới Arsenal" });
    const view = homepageFixture([candidate]); const html = page(view); expect(html).toContain("Player X"); expect(html).toContain("Origin"); expect(html).toContain("Arsenal"); expect(html).toContain(["CONFIRMED"].includes(status) ? "Đã xác nhận" : status === "NEGOTIATION" ? "Đang đàm phán" : status === "INTEREST" ? "Đang quan tâm" : "Tin đồn"); expect(html).not.toContain(">RUMOR<"); if (status === "RUMOR") { expect(html).toContain("có thể"); expect(html).toContain("amber"); }
  });
  it("preserves reported fee distinction and omits missing fee", () => {
    const candidate = briefStory(7, { section: "TRANSFERS", transferId: vidId(70), transferStatus: "RUMOR" }); const view = homepageFixture([candidate]);
    expect(page(view)).not.toContain("Phí đã xác nhận"); const entry = view.sections[0].items[0]; entry.transfer!.facts = { ...emptyTransferFacts(), reportedFee: { value: "€40m", currency: "EUR", evidenceId: vidId(71), articleId: vidId(72) } };
    const html = render(<HomeStoryCard entry={entry} now={briefNow} />); expect(html).toContain("Phí được đưa tin"); expect(html).toContain("€40m (EUR)"); expect(html).not.toContain("Phí đã xác nhận");
  });
  it("deduplicates canonical clusters across sections and prioritizes transfer placement", () => {
    const story = briefStory(); const transfer = briefStory(2, { clusterId: story.clusterId, section: "TRANSFERS", transferId: vidId(90), transferStatus: "INTEREST" }); const brief = homeBrief([story, transfer]);
    brief.document.sections.push({ type: "TOP_STORIES", labelVi: "Tin", items: [brief.document.sections.flatMap((s) => s.items).find((i) => i.key === story.key)!] });
    const view = composeHomepage(brief, homeEnrichment([story, transfer]), { partial: false, staleInputs: false }, briefNow); expect(view.sections.flatMap((s) => s.items)).toHaveLength(1); expect(view.sections[0].type).toBe("TRANSFERS");
  });
  it("omits empty/off-field/community sections rather than fabricating reactions", () => { const $ = load(page(homepageFixture([homeMatch(2, true)]))); expect($("#home-upcoming")).toHaveLength(1); for (const id of ["home-off_field", "home-community", "home-results", "home-transfers", "home-club_player"]) expect($(`#${id}`)).toHaveLength(0); expect($.text()).not.toContain("Fan Pulse"); });
  it("supports meaningful off-field and approved future community data without changing factual status", () => {
    const off = briefStory(3, { section: "OFF_FIELD" }); const community = briefStory(4, { section: "COMMUNITY", titleVi: "Cộng đồng chia sẻ cảm nhận" }); const brief = homeBrief([off]);
    const extra = homeEnrichment([off, community]); brief.document.sections.push({ type: "COMMUNITY", labelVi: "Cộng đồng", items: [{ ...brief.document.sections[0].items[0], ...community, reliability: { ...community.reliability, label: "SOCIAL" }, components: brief.document.sections[0].items[0].components, importanceScore: 1 }] });
    const html = page(composeHomepage(brief, extra, { partial: false, staleInputs: false }, briefNow)); expect(html).toContain("Ngoài sân cỏ"); expect(html).toContain("Fan đang nói gì?"); expect(html).toContain("không phải xác nhận sự kiện");
  });
  it("displays upcoming fixtures in Vietnam timezone across UTC date boundaries", () => { const html = page(homepageFixture([homeMatch(2, true)])); expect(html).toContain("01:00 19/10/2026"); expect(html).toContain("Sắp diễn ra"); expect(html).not.toContain("null"); expect(homeTime("2026-10-18T18:00:00Z", true)).toContain("19/10/2026"); });
  it("shows stale and partial notices without exposing internal error details", () => { const view = homepageFixture(); view.stale = true; view.partial = true; const html = page(view); expect(html).toContain("Cập nhật gần nhất:"); expect(html).toContain("Đây là bản tin ngày"); expect(html).toContain("Một số nguồn đang cập nhật."); expect(html).not.toContain("PARTIAL"); });
  it.each(["empty", "error"] as const)("provides safe %s fallback and all route navigation", (kind) => { const html = render(<MorningHomepage result={{ kind }} now={briefNow} />); const $ = load(html); for (const route of ["/", "/matches", "/news", "/transfers"]) expect($(`a[href='${route}']`).length).toBeGreaterThan(0); expect(html).not.toContain("stack"); expect(html).not.toContain("undefined"); });
  it("uses intentional no-image cards and flexible mobile structure", () => { const html = page(homepageFixture([homeMatch(), briefStory()])); const $ = load(html); expect($("img,iframe,table")).toHaveLength(0); expect(html).toContain("minmax(0,1fr)"); expect(html).toContain("min-w-0"); expect($("nav[aria-label='Điều hướng chính'] a.fb-nav-item")).toHaveLength(5); expect(html).not.toContain("w-screen"); });
  it("keeps source transparency and independent counts separate from copies", () => { const view = homepageFixture(); const item = view.sections[0].items[0].item; item.citations = Array.from({ length: 5 }, (_, n) => ({ ...item.citations[0], evidenceId: vidId(100 + n), sourceName: `Source ${n}` })); item.reliability.independentSourceCount = 2; const html = page(view); expect(html).toContain("+2 nguồn"); expect(html).toContain("2 nguồn độc lập"); expect(html).not.toContain("5 nguồn độc lập"); const $ = load(html); expect($("details a[target='_blank']")).toHaveLength(5); });
  it("rejects unavailable enrichment and missing Vietnamese text without exposing original content", () => { const candidate = briefStory(); const brief = homeBrief([candidate]); expect(composeHomepage(brief, new Map(), { partial: false, staleInputs: false }, briefNow).sections).toHaveLength(0); brief.document.sections[0].items[0].titleVi = ""; expect(composeHomepage(brief, homeEnrichment([candidate]), { partial: false, staleInputs: false }, briefNow).sections).toHaveLength(0); });
  it("keeps metadata generic, canonical and Vietnamese with noindex for previews", () => { const meta = homepageMetadata("https://football.example.test", false); expect(meta.title).toContain("Bản tin sáng"); expect(meta.alternates?.canonical).toBe("https://football.example.test/"); expect(homepageMetadata("https://football.example.test", true).robots).toEqual({ index: false, follow: false }); expect(homeDate("2026-10-18")).toContain("18/10/2026"); });
  it("only enables an exact server-side development preview request", () => { expect(developmentPreview("1", "development")).toBe(true); for (const env of ["production", "test", undefined]) expect(developmentPreview("1", env)).toBe(false); for (const query of [undefined, "true", ["1"]]) expect(developmentPreview(query, "development")).toBe(false); });
  it("contains failures and never returns raw errors", async () => { const log = vi.fn(); expect(await loadHomepage(async () => { throw new Error("private-db-key"); }, log)).toEqual({ kind: "error" }); expect(log).toHaveBeenCalledOnce(); });
});
