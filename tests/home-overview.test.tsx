import React from "react";
import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { SyncDatabase } from "../lib/sync-database";
import { Overview, type OverviewData } from "../components/home/overview";
import { parseUpdateTab, readRibbon, splitFront } from "../services/home-overview";
import type { FeedCardView, FeedGroupView } from "../types/feed-card";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
const now = new Date("2026-10-20T03:00:00Z");
const card = (title: string, overrides: Partial<FeedCardView> = {}): FeedCardView => ({
  slug: `bao-${title.replace(/\W+/g, "-")}`, articleId: title, title, description: `Mô tả ${title}`, publisher: "VnExpress Sport", publisherSlug: "vnexpress-sport", attribution: "VnExpress", url: null,
  publishedAt: "2026-10-20T01:00:00Z", label: "MEDIA", certainty: "REPORTED", storyType: "MATCH", transferStage: null, originHint: null, officialWording: false, image: null,
  entities: [], leagueSlugs: ["premier-league"], match: null, ...overrides,
});
const group = (key: string, lead: FeedCardView, others: FeedCardView[] = []): FeedGroupView => ({ key, lead, others, latestAt: lead.publishedAt });
const ranked = ["A", "B", "C", "D", "E", "F"].map((name) => group(name.toLowerCase(), card(`Tin ${name}`, name === "F" ? { image: "https://i.vnecdn.net/f.jpg" } : {})));
const data = (overrides: Partial<OverviewData> = {}): OverviewData => {
  const front = splitFront(ranked);
  return { ribbon: [], quick: front.quick, cover: front.cover, followups: front.followups, updates: [], updateTab: "tat-ca", deepReads: [], bites: [], transfers: [], standings: null, highlights: [], fans: { voz: [], reddit: [] }, hot: { matches: [], topics: [] }, scorers: null, mine: [], suggest: [],
    viewer: { signedIn: false, clubs: [], next: null }, briefReady: false, ...overrides };
};
const render = (value: OverviewData) => load(renderToStaticMarkup(<Overview data={value} now={now} />));

describe("homepage blocks", () => {
  it("takes three quick points, then a pictured cover and two follow-ups, never repeating a story", () => {
    const front = splitFront(ranked);
    expect(front.quick.map((item) => item.key)).toEqual(["a", "b", "c"]);
    expect(front.cover?.key).toBe("f"); expect(front.followups.map((item) => item.key)).toEqual(["d", "e"]);
    expect([...front.used].sort()).toEqual(["a", "b", "c", "d", "e", "f"]);
    expect(splitFront([]).cover).toBeNull();
    expect(parseUpdateTab("chuyen-nhuong")).toBe("chuyen-nhuong"); expect(parseUpdateTab("x")).toBe("tat-ca"); expect(parseUpdateTab(["hlv"])).toBe("tat-ca");
  });
  it("renders quick points and the cover with the publisher's picture and credit, and leaves out empty blocks", () => {
    const $ = render(data());
    expect($(".ov-quick-item").map((_, node) => $(node).attr("href")).get()).toEqual(["/news/bao-Tin-A", "/news/bao-Tin-B", "/news/bao-Tin-C"]);
    expect($(".focus-cover").attr("href")).toBe("/news/bao-Tin-F"); expect($(".focus-cover").text()).toContain("Ảnh: VnExpress Sport");
    for (const block of [".ov-read", ".discovery-cinema", ".bite-section", ".transfer-center", ".ov-table"]) expect($(block)).toHaveLength(0);
    expect($.html()).not.toContain("minh họa"); expect($.html()).not.toContain("bình luận");
  });
  it("filters the latest stories by type through links and shows transfer talk only as the press reports it", () => {
    const transfer = group("t", card("Arsenal hỏi mua tiền đạo", { storyType: "TRANSFER", transferStage: "NEGOTIATION", entities: [{ kind: "player", name: "Viktor Gyökeres", initials: "VG" }, { kind: "club", name: "Arsenal FC", initials: "ARS", crestUrl: "https://crests.football-data.org/57.png" }] }));
    const $ = render(data({ updates: [group("u", card("Tin mới"))], updateTab: "chuyen-nhuong", transfers: [transfer] }));
    expect($(".desk-filters a[aria-current]").text()).toBe("Chuyển nhượng"); expect($(".desk-filters a").first().attr("href")).toBe("/#vua-cap-nhat");
    expect($(".transfer-entry-main").text()).toContain("Viktor Gyökeres"); expect($(".transfer-status").text()).toBe("Đang đàm phán");
    expect($(".transfer-column-head span").map((_, node) => $(node).text()).get()).toEqual(["Cầu thủ", "CLB được nhắc tới", "Trạng thái"]);
    expect($.html()).not.toContain("Đã xác nhận"); expect($.html()).not.toContain("Phí");
  });
  it("lets a guest follow a club in one tap, and shows a follower's next match and latest story", () => {
    const guest = render(data({ suggest: [{ id: "c1", name: "Arsenal", crestUrl: null }, { id: "c2", name: "Chelsea", crestUrl: null }] }));
    expect(guest(".qf-grid button").map((_, node) => guest(node).attr("aria-label")).get()).toEqual(["Theo dõi Arsenal", "Theo dõi Chelsea"]);
    expect(guest(".followed-summary a.fb-button-ghost").attr("href")).toBe("/following/manage");
    const next = { slug: "m1", kickoffAt: "2026-10-25T14:00:00.000Z", status: "SCHEDULED", round: null, home: { name: "Arsenal", tla: "ARS", crestUrl: null }, away: { name: "Chelsea", tla: "CHE", crestUrl: null }, homeScore: null, awayScore: null };
    const $ = render(data({ viewer: { signedIn: true, clubs: [{ id: "c1", name: "Arsenal" }], next }, mine: [{ id: "c1", name: "Arsenal", next, story: { title: "Arsenal thắng đậm", href: "/news/bao-A" } }] }));
    expect($(".ms-club").text()).toBe("Arsenal"); expect($(".ms-next").text()).toContain("Arsenal – Chelsea"); expect($(".ms-next").attr("href")).toBe("/match/m1");
    expect($(".ms-story").attr("href")).toBe("/news/bao-A"); expect($(".qf-grid")).toHaveLength(0);
  });
  it("shows what is hot only when something is, and the top scorers beside the table", () => {
    expect(render(data())(".hot-strip")).toHaveLength(0);
    const $ = render(data({
      hot: { matches: [{ slug: "m9", home: "Como", away: "Man United", homeScore: 4, awayScore: 1, threads: 3 }], topics: [{ kind: "club", id: "c1", name: "Man United", crestUrl: null, stories: 9, threads: 2 }] },
      scorers: { leagueName: "Premier League", leagueHref: "/league/premier-league?tab=thong-ke", list: [{ name: "Erling Haaland", goals: 8, assists: 1, team: "Man City", crestUrl: null, photoUrl: null, href: "/player/player-1" }] },
    }));
    expect($(".hot-strip b").map((_, node) => $(node).text()).get()).toEqual(["Como 4–1 Man United", "Man United"]);
    expect($(".hot-strip small").map((_, node) => $(node).text()).get()).toEqual(["3 chủ đề fan", "9 tin · 2 chủ đề fan"]);
    expect($(".hot-strip a").first().attr("href")).toBe("/match/m9");
    expect($(".ov-scorers").text()).toContain("Erling Haaland"); expect($(".ov-scorers strong").text()).toBe("8");
  });
  it("links highlights to the match page and keeps unsafe crests out of the match ribbon", () => {
    const $ = render(data({
      highlights: [{ videoId: "abc123def45", title: "Highlights ARSENAL vs CHELSEA", channelName: "FPT Bóng Đá", publishedAt: "2026-10-19T20:00:00Z", matchSlug: "m0", leagueSlug: "premier-league", home: "Arsenal", away: "Chelsea", kickoffAt: "2026-10-19T14:00:00Z" }],
      ribbon: [{ slug: "m0", kickoffAt: "2026-10-19T14:00:00.000Z", status: "FINISHED", leagueSlug: "premier-league", home: { name: "Arsenal", crestUrl: "https://evil.example/x.png" }, away: { name: "Chelsea", crestUrl: null }, homeScore: 2, awayScore: 1 }],
    }));
    expect($(".cinema-card").attr("href")).toBe("/match/m0#match-highlight"); expect($(".cinema-card").text()).toContain("FPT Bóng Đá · YouTube");
    const pitch = $(".pitch-match");
    expect(pitch.attr("href")).toBe("/match/m0?tab=su-kien"); expect(pitch.find("strong").map((_, node) => $(node).text()).get()).toEqual(["2", "1"]);
    expect(pitch.find("img")).toHaveLength(0); expect(pitch.find(".ov-crest-fallback").first().text()).toBe("ARS");
  });
});

describe("match ribbon (SQL)", () => {
  let db: PGlite; let database: SyncDatabase;
  beforeAll(async () => {
    db = new PGlite();
    for (const entry of readdirSync("prisma/migrations", { withFileTypes: true }).filter((entry) => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) await db.exec(readFileSync(`prisma/migrations/${entry.name}/migration.sql`, "utf8"));
    database = { query: async <T,>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows, transaction: (work) => db.transaction((tx) => work({ query: async <T,>(sql: string, params: unknown[] = []) => (await tx.query<T>(sql, params)).rows })) };
    const [league, season, home, away] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
    await database.query(`INSERT INTO "League" (id,slug,name,country,"updatedAt") VALUES ($1::uuid,'premier-league','Premier League','England',now())`, [league]);
    await database.query(`INSERT INTO "Season" (id,"leagueId",name,"startsAt","endsAt","updatedAt") VALUES ($1::uuid,$2::uuid,'2026/2027','2026-08-01','2027-06-30',now())`, [season, league]);
    for (const [id, name, short] of [[home, "Arsenal FC", "Arsenal"], [away, "Chelsea FC", null]]) await database.query(`INSERT INTO "Club" (id,slug,name,"shortName","updatedAt") VALUES ($1::uuid,$2,$3,$4,now())`, [id, `club-${id}`, name, short]);
    const rows: [string, string, number | null][] = [["old", "2026-10-15T12:00:00Z", 1], ["recent", "2026-10-19T12:00:00Z", 2], ["latest", "2026-10-20T01:00:00Z", 0], ["next", "2026-10-21T12:00:00Z", null], ["far", "2026-10-30T12:00:00Z", null]];
    for (const [slug, kickoff, score] of rows) await database.query(`INSERT INTO "Match" (id,slug,provider,"externalId","leagueId","seasonId","homeClubId","awayClubId","kickoffAt",status,"homeScore","awayScore","updatedAt") VALUES ($1::uuid,$2,'FOOTBALL_DATA',$2,$3::uuid,$4::uuid,$5::uuid,$6::uuid,$7::timestamptz,$8::"MatchStatus",$9,$9,now())`,
      [randomUUID(), slug, league, season, home, away, kickoff, score === null ? "SCHEDULED" : "FINISHED", score]);
  }, 60000);
  afterAll(async () => { await db.close(); });
  it("lists the last three days of results newest first, then fixtures of the next five days, with short names", async () => {
    const ribbon = await readRibbon(database, now);
    expect(ribbon.map((match) => match.slug)).toEqual(["latest", "recent", "next"]);
    expect(ribbon[0]).toMatchObject({ status: "FINISHED", leagueSlug: "premier-league", home: { name: "Arsenal" }, away: { name: "Chelsea FC" }, homeScore: 0 });
  });
});
