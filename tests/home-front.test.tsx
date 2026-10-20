import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { describe, expect, it } from "vitest";
import { HomeFront, parseHomeFlowTab, type HomeFrontData } from "../components/home/home-front";
import type { FeedCardView, FeedGroupView } from "../types/feed-card";

const now = new Date("2026-10-20T03:00:00Z");
const card = (title: string, overrides: Partial<FeedCardView> = {}): FeedCardView => ({
  slug: `bao-${title.replace(/\W+/g, "-")}`, articleId: title, title, description: `Mô tả ${title}`, publisher: "VnExpress Sport", publisherSlug: "vnexpress-sport", attribution: "VnExpress", url: null,
  publishedAt: "2026-10-20T01:00:00Z", label: "MEDIA", certainty: "REPORTED", storyType: "MATCH", transferStage: null, originHint: null, officialWording: false, image: null,
  entities: [], leagueSlugs: ["premier-league"], match: null, ...overrides,
});
const group = (key: string, lead: FeedCardView, others: FeedCardView[] = []): FeedGroupView => ({ key, lead, others, latestAt: lead.publishedAt });
const data = (overrides: Partial<HomeFrontData> = {}): HomeFrontData => {
  const ranked = [group("a", card("Tin A")), group("b", card("Tin B", { image: "https://i.vnecdn.net/b.jpg" })), group("c", card("Tin C")), group("d", card("Tin D")), group("e", card("Tin E"))];
  return { ranked, flow: ranked, transfers: [], standings: null, tab: "danh-cho-ban", personal: false, briefReady: false, ...overrides };
};
const render = (value: HomeFrontData) => load(renderToStaticMarkup(<HomeFront data={value} now={now} />));

describe("homepage front", () => {
  it("leads with the top-ranked story that has a picture and never repeats it in the quick points or flow", () => {
    const $ = render(data());
    expect($("section[aria-labelledby=home-hot] > a").attr("href")).toBe("/news/bao-Tin-B");
    expect($("#home-quick").parent().parent().find("ol a").map((_, node) => $(node).attr("href")).get()).toEqual(["/news/bao-Tin-A", "/news/bao-Tin-C", "/news/bao-Tin-D"]);
    expect($("#dong-chay li a").map((_, node) => $(node).attr("href")).get()).toEqual(["/news/bao-Tin-E"]);
    expect($("h1").text()).toBe("Bóng đá hôm nay");
  });
  it("labels the hero as automatic, links the brief only when it is out, and keeps the flow tab in the URL", () => {
    let $ = render(data());
    expect($.text()).toContain("Nhiều báo cùng đưa tin"); expect($.text()).not.toContain("Lựa chọn của biên tập");
    expect($("a[href='#ban-tin-sang']")).toHaveLength(0);
    $ = render(data({ briefReady: true, tab: "moi-nhat" }));
    expect($("a[href='#ban-tin-sang']")).toHaveLength(1); expect($("h1")).toHaveLength(0);
    expect($("nav[aria-label='Cách xếp tin'] a[aria-current=page]").attr("href")).toBe("/?dong=moi-nhat#dong-chay");
    expect(parseHomeFlowTab("moi-nhat")).toBe("moi-nhat"); expect(parseHomeFlowTab("x")).toBe("danh-cho-ban");
  });
  it("shows transfer talk with the reported stage, never as confirmed, and the league race", () => {
    const transfer = group("t", card("Arsenal hỏi mua Gyökeres", { storyType: "TRANSFER", transferStage: "NEGOTIATION", entities: [{ id: "p1", kind: "player", name: "Viktor Gyökeres", initials: "VG", photoUrl: null }] }));
    const $ = render(data({ transfers: [transfer], standings: { league: { slug: "premier-league", name: "Premier League", country: "England", seasonName: "2026/2027" }, rows: [
      { position: 1, clubId: "c1", name: "Arsenal FC", shortName: "Arsenal", tla: "ARS", crestUrl: null, played: 7, won: 7, drawn: 0, lost: 0, goalsFor: 15, goalsAgainst: 3, goalDifference: 12, points: 21, form: [] },
    ] } }));
    const transfers = $("#home-transfers").parent();
    expect(transfers.text()).toContain("Viktor Gyökeres"); expect(transfers.text()).toContain("Đang đàm phán"); expect(transfers.text()).not.toContain("Đã xác nhận");
    expect($("#bxh tbody tr").text()).toContain("Arsenal"); expect($("#bxh tbody tr").text()).toContain("21");
    expect($("nav[aria-label='Chọn giải'] a[aria-current=page]").text()).toBe("Ngoại hạng Anh");
  });
});
