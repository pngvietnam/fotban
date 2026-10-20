import React from "react";
import { renderToStaticMarkup as render } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { load } from "cheerio";
import { NewsCard } from "../components/news/news-card";
import { NewsDetailView, SourceEntry } from "../components/news/news-detail";
import { NewsList } from "../components/news/news-list";
import { newsSections } from "../services/news-sections";
import { NewsShell } from "../components/news/news-shell";
import { NewsState } from "../components/news/news-state";
import { NewsLoading } from "../components/news/news-loading";
import { ReliabilityBadge } from "../components/news/reliability-badge";
import { clusterIdFromSlug, newsAbsoluteTime, newsHref, newsMetadata, newsRelativeTime, parseNewsFilters, safeNewsUrl } from "../lib/news-presentation";
import { loadNewsDetail, loadNewsList } from "../services/news-ui-data";
import { newsNow, newsStory } from "./fixtures/news-ui";

const filters = { league: "all", offset: 0 } as const;
describe("Vietnamese canonical news UI", () => {
  it("renders one card per cluster across mutually exclusive sections", () => {
    const story = newsStory(); const html = render(<NewsList filters={filters} now={newsNow} result={{ kind: "ready", data: { stories: [story, story], nextOffset: null } }} />);
    expect(html.match(/<article /g)).toHaveLength(1);
    for (const text of [story.titleVi, story.summaryVi, "ARS", "Player X", "Fixture newsroom", "25 phút trước", "Đang quan tâm"]) expect(html).toContain(text);
    expect(html).not.toContain("Arsenal interested in Player X"); expect(html).not.toContain("<img");
    expect(html).toContain(`href="/news/${story.slug}#sources"`);
  });
  it("has all data-backed sections and never repeats a story", () => {
    const stories = Array.from({ length: 8 }, (_, index) => newsStory({ slug: `story-${index}`, storyType: ["MATCH", "MATCH", "MATCH", "MATCH", "CLUB", "PLAYER", "TRANSFER", "OFF_FIELD"][index], entities: index === 4 ? [{ kind: "club", name: "Arsenal", initials: "ARS" }] : [] }));
    const sections = newsSections(stories, true);
    expect(sections).toHaveLength(6); expect(sections.flatMap((section) => section.stories)).toHaveLength(8);
    expect(new Set(sections.flatMap((section) => section.stories.map((story) => story.slug))).size).toBe(8);
  });
  it("shows at most three source names plus a remainder and trusts the independent count", () => {
    const story = newsStory(); story.sources = Array.from({ length: 5 }, (_, index) => ({ ...story.sources[0], key: `source-${index}`, name: `Newsroom ${index}` })); story.sourceCount = 5; story.independentSourceCount = 2;
    const html = render(<NewsCard story={story} now={newsNow} />);
    expect(html).toContain("Newsroom 0 · Newsroom 1 · Newsroom 2 · +2 nguồn"); expect(html).toContain("2 nguồn độc lập"); expect(html).not.toContain("5 nguồn độc lập");
    story.independentSourceCount = 1;
    expect(render(<NewsCard story={story} now={newsNow} />)).not.toContain("nguồn độc lập");
  });
  it.each([
    ["OFFICIAL", "Chính thức / Đã xác nhận", "emerald"], ["RELIABLE", "Nguồn tin đáng tin cậy", "blue"],
    ["RUMOR", "Tin đồn / Chưa xác nhận", "amber"], ["SOCIAL", "Cộng đồng", "violet"],
  ] as const)("presents %s using the backend badge without a truth score", (label, labelVi, color) => {
    const reliability = { ...newsStory().reliability, label, badge: { labelVi, certaintyVi: "Được đưa tin", disputedVi: null } };
    const html = render(<ReliabilityBadge reliability={reliability} />);
    expect(html).toContain(labelVi); expect(html).toContain(color); expect(html).not.toContain("%");
  });
  it("shows disputed state and community opinion with an explicit warning", () => {
    const story = newsStory(); story.reliability.disputed = true; story.reliability.badge.disputedVi = "Thông tin mâu thuẫn";
    const html = render(<NewsDetailView story={story} now={newsNow} />);
    expect(html).toContain("Thông tin mâu thuẫn"); expect(html).toContain("không xem nội dung này là kết luận"); expect(html).toContain("rose");
    story.reliability.disputed = false; story.reliability.label = "SOCIAL";
    expect(render(<NewsDetailView story={story} now={newsNow} />)).toContain("ý kiến cộng đồng, không phải xác nhận sự kiện");
  });
  it("keeps transfer interest visibly uncertain and omits unavailable club roles", () => {
    const html = render(<NewsDetailView story={newsStory()} now={newsNow} />);
    expect(html).toContain("Đang quan tâm"); expect(html).toContain("Chưa xác nhận hoàn tất"); expect(html).not.toContain("CLB hiện tại:"); expect(html).not.toContain("/transfers");
  });
  it("does not substitute foreign originals when Vietnamese content is missing", () => {
    for (const story of [newsStory({ titleVi: "" }), newsStory({ summaryVi: "" })]) {
      const html = render(<NewsDetailView story={story} now={newsNow} />);
      expect(html).toContain("Nội dung tiếng Việt chưa sẵn sàng"); expect(html).not.toContain("Arsenal interested"); expect(html).not.toContain(story.sources[0].url!);
    }
  });
  it("provides every permitted source with original-language metadata, attribution and safe links", () => {
    const html = render(<NewsDetailView story={newsStory()} now={newsNow} />);
    for (const text of ["Nguồn &amp; căn cứ", "Arsenal interested in Player X", 'lang="en"', "Tiếng Anh", "Nguồn uy tín cao", "CC BY 4.0", "Fixture authors", 'target="_blank"', 'rel="noopener noreferrer"', "mở thẻ mới", "AI hỗ trợ · Đã kiểm duyệt"]) expect(html).toContain(text);
    expect(html).not.toContain("contentOriginal"); expect(html).not.toContain("<img"); expect(html).not.toContain("undefined");
  });
  it("handles absent and unsafe source links without emitting a dangerous href", () => {
    for (const url of [null, "javascript:alert(1)", "https://user:password@example.test"]) {
      const html = render(<SourceEntry source={{ ...newsStory().sources[0], url }} index={0} />);
      expect(html).toContain("Liên kết nguồn chưa khả dụng"); expect(html).not.toContain("javascript:"); expect(html).not.toContain("password@");
    }
    expect(safeNewsUrl("https://news.example.test/story")).toBe("https://news.example.test/story");
  });
  it("supports league filters, resets pagination and rejects unknown/multi-valued input", () => {
    for (const league of ["premier-league", "la-liga"] as const) {
      expect(parseNewsFilters({ league })).toEqual({ league, offset: 0 });
    }
    expect(parseNewsFilters({ league: "unknown" })).toBeNull(); expect(parseNewsFilters({ league: ["premier-league", "la-liga"] })).toBeNull();
    expect(parseNewsFilters({ after: "-1" })).toBeNull(); expect(parseNewsFilters({ after: ["1", "2"] })).toBeNull();
    expect(newsHref({ league: "la-liga", offset: 12 })).toBe("/news?league=la-liga&after=12");
  });
  it("displays UTC timestamps in Vietnam and respects day-only source precision", () => {
    expect(newsAbsoluteTime("2026-10-16T19:00:00Z")).toContain("02:00"); expect(newsAbsoluteTime("2026-10-16T19:00:00Z")).toContain("17/10/2026");
    expect(newsAbsoluteTime("2026-10-16T00:00:00Z", true)).toBe("16/10/2026");
    expect(newsRelativeTime("2026-10-15T19:00:00Z", newsNow)).toBe("Hôm qua, 02:00");
    expect(newsRelativeTime("2026-10-17T07:35:00Z", newsNow)).toBe("25 phút trước"); expect(newsAbsoluteTime(null)).toBe("Chưa rõ thời điểm");
  });
  it("handles empty, pending, loading and service errors without private diagnostics", async () => {
    const result = await loadNewsList(async () => { throw new Error("private-key-stack"); });
    const html = render(<NewsList filters={filters} result={result} now={newsNow} />);
    expect(html).toContain("Chưa thể tải tin tức"); expect(html).toContain('role="alert"'); expect(html).not.toContain("private-key-stack");
    expect(render(<NewsList filters={filters} result={{ kind: "ready", data: { stories: [], nextOffset: null } }} now={newsNow} />)).toContain("Chưa có tin được xuất bản");
    expect(render(<NewsLoading />)).toContain('aria-busy="true"'); expect(render(<NewsState kind="invalid" />)).toContain("Bộ lọc chưa hợp lệ");
  });
  it("rejects invalid or private slugs before rendering and distinguishes database failures", async () => {
    const read = vi.fn().mockResolvedValue(null);
    expect(await loadNewsDetail("../secret", read)).toEqual({ kind: "not-found" }); expect(read).not.toHaveBeenCalled();
    expect(clusterIdFromSlug(newsStory().slug)).not.toBeNull();
    expect(await loadNewsDetail(newsStory().slug, read)).toEqual({ kind: "not-found" });
    expect(await loadNewsDetail(newsStory().slug, async () => { throw new Error("private"); })).toEqual({ kind: "error" });
  });
  it("only emits indexable canonical metadata from a public Vietnamese story", () => {
    const story = newsStory(); const metadata = newsMetadata(story, "https://brief.example.test");
    expect(metadata.alternates?.canonical).toBe(`https://brief.example.test/news/${story.slug}`); expect(metadata.description).toBe(story.summaryVi);
    expect(metadata.openGraph).toMatchObject({ type: "article", locale: "vi_VN", title: story.titleVi });
    expect(newsMetadata(null, "https://brief.example.test")).toMatchObject({ robots: { index: false, follow: false } });
  });
  it("uses semantic mobile-first cards, focusable navigation, skip link and pagination", () => {
    const story = newsStory();
    const html = render(<NewsShell><h1>Tin bóng đá</h1><NewsList filters={filters} now={newsNow} result={{ kind: "ready", data: { stories: [story], nextOffset: 12 } }} /></NewsShell>);
    for (const value of ['href="#news-content"', 'id="news-content"', '<h1>', '<h2 ', '<h3 ', 'aria-label="Điều hướng chính"', "min-w-0", "md:grid-cols-2", 'href="/news?after=12"']) expect(html).toContain(value);
    expect(load(html)('nav[aria-label="Điều hướng chính"] a[href="/news"]').attr("aria-current")).toBe("page");
  });
  it("labels already-Vietnamese deterministic output as extractive, not AI translation", () => {
    const html = render(<NewsDetailView story={newsStory({ summaryMethod: "EXTRACTIVE", transfer: null, storyType: "OFF_FIELD", entities: [] })} now={newsNow} />);
    expect(html).toContain("Trích lược · Đã kiểm duyệt"); expect(html).toContain("Ngoài sân cỏ"); expect(html).not.toContain("AI hỗ trợ");
  });
});
