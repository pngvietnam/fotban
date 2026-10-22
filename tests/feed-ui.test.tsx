import React from "react";
import { renderToStaticMarkup as render } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { load } from "cheerio";
import { FeedGroupCard } from "../components/news/feed-card";
import { FeedDetailView } from "../components/news/feed-detail";
import { FeedSection } from "../components/news/feed-section";
import { feedArticleIdFromSlug, feedMetadata, parseFeedOffset } from "../lib/feed-card-presentation";
import type { FeedCardView } from "../types/feed-card";

vi.mock("next/navigation", () => ({ useRouter: () => ({ back: vi.fn(), push: vi.fn() }) }));
const now = new Date("2026-10-19T03:00:00Z");
const card = (overrides: Partial<FeedCardView> = {}): FeedCardView => ({
  slug: "bao-2f1c5a8e-7c43-4d36-9a7e-1f2d3c4b5a69", articleId: "2f1c5a8e-7c43-4d36-9a7e-1f2d3c4b5a69",
  title: "CHÍNH THỨC: MU hoàn tất chiêu mộ tân binh", description: "MU đã hoàn tất thương vụ, theo tờ báo.",
  publisher: "Thể Thao 247", publisherSlug: "thethao247", attribution: "Theo Thethao247.vn", url: "https://thethao247.vn/mu-tan-binh.html",
  publishedAt: "2026-10-19T01:00:00.000Z", label: "COMMUNITY", certainty: "REPORTED", storyType: "TRANSFER", transferStage: "RUMOR",
  originHint: "Fabrizio Romano", officialWording: true, image: null, entities: [{ id: "c1", kind: "club", name: "Manchester United FC", initials: "MUN" }], leagueSlugs: ["premier-league"], match: null, ...overrides,
});
const other = card({ slug: "bao-3f1c5a8e-7c43-4d36-9a7e-1f2d3c4b5a69", articleId: "3f1c5a8e-7c43-4d36-9a7e-1f2d3c4b5a69", publisher: "VnExpress Sport", attribution: "Theo VnExpress", label: "MEDIA", title: "MU chiêu mộ tân binh", officialWording: false });

describe("publisher card UI", () => {
  it("shows media/community and wording labels, never an official or confirmed badge", () => {
    const $ = load(render(<FeedGroupCard group={{ key: "k", lead: card(), others: [other], latestAt: card().publishedAt }} now={now} />));
    const text = $.text();
    expect(text).toContain("Cộng đồng"); expect(text).toContain("Đang đưa tin"); expect(text).toContain("Chưa xác nhận");
    expect(text).not.toContain("Đã xác nhận"); expect(text).toContain("chưa đối chiếu với thông báo chính thức");
    expect(text).toContain("Theo Thethao247.vn"); expect(text).toContain("dẫn lại Fabrizio Romano"); expect(text).toContain("Cùng đưa tin: VnExpress Sport");
  });
  it("keeps readers on FotBan: card links are internal; the detail page has one prominent link to the original", () => {
    const list = load(render(<FeedGroupCard group={{ key: "k", lead: card(), others: [], latestAt: card().publishedAt }} now={now} />));
    const hrefs = list("a").map((_, a) => list(a).attr("href")).get();
    expect(hrefs.every((href) => href.startsWith("/news/bao-") || href.startsWith("/club/club-"))).toBe(true);
    expect(hrefs).toContain("/club/club-c1");
    const detail = load(render(<FeedDetailView card={card()} others={[other]} now={now} />));
    const external = detail("a[target=_blank]");
    expect(external).toHaveLength(1); expect(external.attr("rel")).toBe("noopener noreferrer nofollow"); expect(external.hasClass("fd-cta")).toBe(true); expect(external.text()).toContain("Đọc bài đầy đủ trên Thể Thao 247");
    expect(detail("h2").text()).toContain("Các báo khác cùng đưa tin (1)");
    expect(detail("blockquote").text()).toBe(card().description);
  });
  it("shows the match strip, other papers as rows and only this story's own tags", () => {
    const matchCard = { slug: "match-1", status: "FINISHED", kickoffAt: "2026-10-18T19:00:00.000Z", leagueSlug: "premier-league", home: { name: "Arsenal", crestUrl: null, score: 2 }, away: { name: "Bayern", crestUrl: null, score: 2 } };
    const side = card({ slug: "bao-4f1c5a8e-7c43-4d36-9a7e-1f2d3c4b5a69", articleId: "4f1c5a8e-7c43-4d36-9a7e-1f2d3c4b5a69", publisher: "VnExpress Sport", entities: [{ id: "c9", kind: "club", name: "Chelsea FC", initials: "CHE" }] });
    const detail = load(render(<FeedDetailView card={card({ match: { slug: "match-1", home: "Arsenal", away: "Bayern", kickoffAt: matchCard.kickoffAt } })} others={[side]} matchCard={matchCard} now={now} />));
    expect(detail(".fd-match .fd-score").text()).toBe("2–2"); expect(detail(".fd-match a[href='/match/match-1?tab=doi-dau']")).toHaveLength(1);
    expect(detail(".fd-sources li")).toHaveLength(1); expect(detail(".fd-sources").text()).toContain("VnExpress Sport");
    expect(detail(".fd-chip").text()).toContain("Manchester United FC"); expect(detail(".fd-chip").text()).not.toContain("Chelsea");
    expect(detail("a[href='#other-coverage']").text()).toBe("2 báo cùng đưa tin");
  });
  it("renders an error state and nothing when there are no cards", () => {
    expect(render(<FeedSection result={{ kind: "ready", data: { groups: [], nextOffset: null } }} filters={{ league: "all", offset: 0 }} now={now} />)).toBe("");
    expect(load(render(<FeedSection result={{ kind: "error" }} filters={{ league: "all", offset: 0 }} now={now} />))("[role=alert]")).toHaveLength(1);
  });
  it("parses card slugs/offsets strictly and never indexes card pages", () => {
    expect(feedArticleIdFromSlug(card().slug)).toBe(card().articleId);
    expect(feedArticleIdFromSlug("bao-not-a-uuid")).toBeNull(); expect(feedArticleIdFromSlug(`tin-${card().articleId}`)).toBeNull();
    expect(parseFeedOffset(undefined)).toBe(0); expect(parseFeedOffset("24")).toBe(24); expect(parseFeedOffset("-1")).toBeNull(); expect(parseFeedOffset(["1", "2"])).toBeNull();
    expect(feedMetadata(card()).robots).toMatchObject({ index: false }); expect(feedMetadata(card()).alternates?.canonical).toBe(card().url);
  });
});
