import React from "react";
import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { SyncDatabase } from "../lib/sync-database";
import { FeedPost, SocialFeed, type SocialFeedData } from "../components/news/social-feed";
import { buzzOrder } from "../services/feed-card-query";
import { StoryLikeService, likeCounts, likedStories } from "../services/story-likes";
import { accountRequest } from "../services/account-http";
import type { FeedCardView, FeedGroupView } from "../types/feed-card";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn() }) }));
const now = new Date("2026-10-20T03:00:00Z");
const card = (title: string, overrides: Partial<FeedCardView> = {}): FeedCardView => ({
  slug: `bao-${title.replace(/\W+/g, "-")}`, articleId: randomUUID(), title, description: `Mô tả ${title}`, publisher: "VnExpress Sport", publisherSlug: "vnexpress-sport", attribution: "Theo VnExpress", url: "https://vnexpress.net/bai-viet.html",
  publishedAt: "2026-10-20T01:00:00Z", label: "MEDIA", certainty: "REPORTED", storyType: "MATCH", transferStage: null, originHint: null, officialWording: false, image: null,
  entities: [], leagueSlugs: ["premier-league"], match: null, ...overrides,
});
const group = (key: string, lead: FeedCardView, others: FeedCardView[] = []): FeedGroupView => ({ key, lead, others, latestAt: lead.publishedAt });
const noLikes = { signedIn: false, counts: {}, liked: {} };
const post = (value: FeedGroupView, likes = noLikes) => load(renderToStaticMarkup(<FeedPost group={value} likes={likes} now={now} />));

describe("feed posts", () => {
  it("shows the publisher's headline, picture with credit, source and a safe link to the original", () => {
    const $ = post(group("a", card("Arsenal thắng", { image: "https://i1-thethao.vnecdn.net/a.jpg", entities: [{ id: "c1", kind: "club", name: "Arsenal FC", initials: "ARS" }] })));
    expect($(".post-byline b").text()).toBe("VnExpress Sport"); expect($(".post-type").text()).toBe("Trận đấu");
    expect($("a.dp-feed-title").attr("href")).toBe("/news/bao-Arsenal-th-ng");
    expect($(".social-photo figcaption").text()).toBe("Ảnh: VnExpress Sport");
    const original = $(".post-source-line a");
    expect(original.attr("href")).toBe("https://vnexpress.net/bai-viet.html"); expect(original.attr("rel")).toBe("noopener noreferrer nofollow");
    expect($(".post-chips a").map((_, node) => $(node).attr("href")).get()).toEqual(["/club/club-c1", "/league/premier-league"]);
    // No stored likes and one publisher: no numbers at all, only the actions.
    expect($(".post-stats")).toHaveLength(0); expect($(".post-actions button").map((_, node) => $(node).text()).get()).toEqual(["Thích", "Chia sẻ"]);
    expect($.html()).not.toContain("bình luận"); expect($.html()).not.toContain("Bình luận");
  });
  it("counts only stored likes and the publishers carrying the story", () => {
    const value = group("b", card("Tin B"), [card("Tin B2", { publisher: "Dân trí" })]);
    const $ = post(value, { signedIn: true, counts: { b: 3 }, liked: { b: true } });
    expect($(".post-source-line").text()).toContain("2 báo cùng đưa"); expect($(".post-stats")).toHaveLength(0);
    expect($(".post-actions button").first().text()).toBe("Đã thích3"); expect($(".post-like-count").attr("aria-label")).toBe("3 lượt thích");
  });
  it("labels transfer talk as the press reports it and community posts as opinion", () => {
    const transfer = post(group("t", card("Arsenal hỏi mua", { storyType: "TRANSFER", transferStage: "NEGOTIATION" })));
    expect(transfer(".feed-transfer-status .fb-badge").text()).toBe("Đang đàm phán"); expect(transfer.html()).not.toContain("Đã xác nhận");
    const opinion = post(group("o", card("Fan nói", { storyType: "SOCIAL", publisher: "Cộng đồng" })));
    expect(opinion(".post-source-line").text()).toContain("Góc nhìn cộng đồng"); expect(opinion(".post-source-note").text()).toContain("Ý kiến cá nhân"); expect(opinion(".post-type").text()).toBe("Fan nói gì");
  });
});

describe("the news page", () => {
  const data = (overrides: Partial<SocialFeedData> = {}): SocialFeedData => ({
    view: { tab: "danh-cho-ban", kind: "tat-ca", league: "all", offset: 0 }, groups: [group("a", card("Tin A"))], nextOffset: 24, failed: false, likes: noLikes,
    personal: { names: [], fallback: false, signedIn: false }, buzz: [], fixtures: [], ...overrides,
  });
  const page = (value: SocialFeedData) => load(renderToStaticMarkup(<SocialFeed data={value} now={now} />));
  it("offers three tabs and two filter menus as links, and pages through the feed", () => {
    const $ = page(data());
    expect($(".social-tabs a").map((_, node) => `${$(node).text()} ${$(node).attr("href")}`).get()).toEqual(["Dành cho bạn /news", "Mới nhất /news?tab=moi-nhat", "Sôi nổi /news?tab=soi-noi"]);
    expect($(".feed-filter-field button").map((_, node) => $(node).text().replace("⌄", "")).get()).toEqual(["Loại tin", "Giải đấu"]);
    expect($(".load-feed").attr("href")).toBe("/news?bao=24"); expect($(".feed-result-count").text()).toBe("1+ câu chuyện");
    expect($(".feed-context-note").text()).toContain("Chưa theo dõi đội bóng?"); expect($(".feed-context-note a").attr("href")).toBe("/login");
  });
  it("explains each tab and filter, and offers to clear filters when nothing matches", () => {
    const followed = page(data({ personal: { names: ["Arsenal"], fallback: false, signedIn: true } }));
    expect(followed(".feed-context-note").text()).toBe("Vì bạn theo dõi Arsenal.");
    const buzz = page(data({ view: { tab: "soi-noi", kind: "chuyen-nhuong", league: "la-liga", offset: 0 }, groups: [], nextOffset: null, personal: null }));
    expect(buzz(".feed-context-note").text()).toContain("48 giờ qua"); expect(buzz(".feed-filter-field button").first().text()).toContain("Chuyển nhượng");
    expect(buzz(".feed-empty a").attr("href")).toBe("/news?tab=soi-noi"); expect(buzz(".load-feed")).toHaveLength(0);
    expect(page(data({ failed: true, groups: [] }))("[role=alert]").text()).toContain("Chưa thể tải tin tức");
  });
});

describe("Sôi nổi ordering", () => {
  it("keeps the last 48 hours and ranks by distinct publishers plus likes", async () => {
    const a = group("a", card("A"), [card("A2", { publisher: "Dân trí" })]);
    const b = group("b", card("B", { publishedAt: "2026-10-19T20:00:00Z" }));
    const old = group("old", card("Old", { publishedAt: "2026-10-17T00:00:00Z" }), [card("O2", { publisher: "X" }), card("O3", { publisher: "Y" })]);
    const tx = { query: vi.fn(async () => [{ articleId: b.lead.articleId, userId: "u1" }, { articleId: b.lead.articleId, userId: "u2" }]) };
    expect((await buzzOrder(tx as never, [a, b, old], now)).map((item) => item.key)).toEqual(["b", "a"]);
  });
});

describe("story likes (SQL)", () => {
  let db: PGlite; let database: SyncDatabase;
  const ids = { source: randomUUID(), a1: randomUUID(), a2: randomUUID(), draft: randomUUID(), u1: randomUUID(), u2: randomUUID() };
  beforeAll(async () => {
    db = new PGlite();
    for (const entry of readdirSync("prisma/migrations", { withFileTypes: true }).filter((entry) => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) await db.exec(readFileSync(`prisma/migrations/${entry.name}/migration.sql`, "utf8"));
    database = { query: async <T,>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows, transaction: (work) => db.transaction((tx) => work({ query: async <T,>(sql: string, params: unknown[] = []) => (await tx.query<T>(sql, params)).rows })) };
    await database.query(`INSERT INTO "NewsSource" (id,name,domain,type,"accessPolicy","updatedAt") VALUES ($1::uuid,'Fixture','fixture.example.test','PUBLICATION','test',now())`, [ids.source]);
    for (const [id, status] of [[ids.a1, "PUBLISHED"], [ids.a2, "PUBLISHED"], [ids.draft, "HELD"]]) {
      await database.query(`INSERT INTO "Article" (id,slug,"sourceId","sourceUrl","canonicalUrl","titleOriginal",language,"updatedAt") VALUES ($1::uuid,$1::text,$2::uuid,$3,$3,'Tin','vi',now())`, [id, ids.source, `https://fixture.example.test/${id}`]);
      await database.query(`INSERT INTO "FeedCard" ("articleId",status,"storyType",label,certainty,"updatedAt") VALUES ($1::uuid,$2,'MATCH','MEDIA','REPORTED',now())`, [id, status]);
    }
    for (const id of [ids.u1, ids.u2]) await database.query(`INSERT INTO "User" (id,"authSubject",email,"displayName","updatedAt") VALUES ($1::uuid,$1::text,$2,'Reader',now())`, [id, `${id}@example.test`]);
  }, 60000);
  beforeEach(async () => { await database.query('DELETE FROM "StoryLike"'); });
  afterAll(async () => { await db.close(); });
  const as = (id: string | null) => new StoryLikeService(database, async () => id ? { id } : null);

  it("needs an account, accepts only published stories and counts each reader once per story", async () => {
    await expect(as(null).set({ articleId: ids.a1 }, true)).rejects.toMatchObject({ status: 401 });
    await expect(as(ids.u1).set({ articleId: ids.draft }, true)).rejects.toMatchObject({ status: 404 });
    await expect(as(ids.u1).set({ articleId: "x" }, true)).rejects.toMatchObject({ status: 400 });
    expect(await as(ids.u1).set({ articleId: ids.a1 }, true)).toMatchObject({ liked: true, count: 1 });
    await as(ids.u1).set({ articleId: ids.a1 }, true); await as(ids.u1).set({ articleId: ids.a2 }, true); await as(ids.u2).set({ articleId: ids.a2 }, true);
    expect(await likeCounts(database, [[ids.a1, ids.a2], [ids.a1], [ids.draft]])).toEqual([2, 1, 0]);
    expect(await likedStories(database, ids.u2, [[ids.a1], [ids.a1, ids.a2]])).toEqual([false, true]);
    expect(await as(ids.u1).set({ articleId: ids.a1 }, false)).toMatchObject({ liked: false, count: 0 });
  });
  it("is served by /api/likes for same-origin requests only", async () => {
    const request = (origin: string) => new Request("https://fotban.test/api/likes", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ articleId: ids.a2 }) });
    const deps = { database, session: async () => ({ id: ids.u1 }), appUrl: "https://fotban.test" };
    expect((await accountRequest(request("https://evil.test"), deps)).status).toBe(403);
    const response = await accountRequest(request("https://fotban.test"), deps);
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ articleId: ids.a2, liked: true, count: 1 });
  });
});
