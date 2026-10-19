import React from "react";
import { renderToStaticMarkup as render } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { load } from "cheerio";
import { MyTeamsSection } from "../components/home/my-teams";
import type { MyTeams } from "../services/my-teams";
import type { FeedGroupView } from "../types/feed-card";

const now = new Date("2026-10-19T03:00:00Z");
const group = (title: string): FeedGroupView => {
  const lead = { slug: "bao-2f1c5a8e-7c43-4d36-9a7e-1f2d3c4b5a69", articleId: "2f1c5a8e-7c43-4d36-9a7e-1f2d3c4b5a69", title, description: null, publisher: "VnExpress Sport", publisherSlug: "vnexpress-sport", attribution: "Theo VnExpress", url: null, publishedAt: "2026-10-19T01:00:00.000Z", label: "MEDIA" as const, certainty: "REPORTED" as const, storyType: "MATCH", transferStage: null, originHint: null, officialWording: false, entities: [], leagueSlugs: [], match: null };
  return { key: "k", lead, others: [], latestAt: lead.publishedAt };
};
const ready = (overrides: Partial<Extract<MyTeams, { kind: "ready" }>> = {}): MyTeams => ({ kind: "ready", summary: { clubs: [{ id: "c1", name: "Man City" }], players: [], leagues: [{ id: "l1", slug: "premier-league", name: "Premier League" }], entityIds: ["c1"], leagueSlugs: ["premier-league"] },
  upcoming: [{ slug: "m1", kickoffAt: "2026-10-25T19:00:00.000Z", status: "SCHEDULED", round: null, home: { name: "Man City", tla: "MCI", crestUrl: null }, away: { name: "Arsenal", tla: "ARS", crestUrl: null }, homeScore: null, awayScore: null }], groups: [group("Man City thắng đậm")], ...overrides });

describe("homepage 'Đội của tôi' block", () => {
  it("links followed clubs and leagues, upcoming matches and the newest stories to the full feed", () => {
    const $ = load(render(<MyTeamsSection data={ready()} now={now} />));
    expect($("h2").text()).toBe("Đội của tôi");
    expect($("a[href='/club/club-c1']").text()).toBe("Man City"); expect($("a[href='/league/premier-league']").text()).toBe("Premier League");
    expect($("a[href='/match/m1']").length).toBe(1); expect($("a[href='/news/bao-2f1c5a8e-7c43-4d36-9a7e-1f2d3c4b5a69']").text()).toBe("Man City thắng đậm");
    expect($("a[href='/following']").text()).toContain("bảng tin đầy đủ");
  });
  it("shows an honest empty message and an invitation when nothing is followed or new", () => {
    expect(load(render(<MyTeamsSection data={{ kind: "empty" }} now={now} />))("a[href='/account#following']").length).toBe(1);
    expect(load(render(<MyTeamsSection data={ready({ upcoming: [], groups: [] })} now={now} />)).text()).toContain("Chưa có trận hay tin mới");
  });
});
