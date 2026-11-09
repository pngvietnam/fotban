import React from "react";
import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { SyncDatabase } from "../lib/sync-database";
import { Overview, type OverviewData } from "../components/home/overview";
import { streamRows, type StoryRow } from "../components/home/overview-client";
import { dayMode, dramaTags, hotReasons, orderRibbon, parseUpdateTab, readNewsCollectedAt, readRibbon, readWatchMatch, splitToday, storyWindow, type DramaEvent, type RibbonMatch } from "../services/home-overview";
import { matchWhen, vnShortDate } from "../lib/home-dates";
import type { FeedCardView, FeedGroupView } from "../types/feed-card";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
const now = new Date("2026-10-20T03:00:00Z"); // Tuesday 20/10, 10:00 in Vietnam
const card = (title: string, overrides: Partial<FeedCardView> = {}): FeedCardView => ({
  slug: `bao-${title.replace(/\W+/g, "-")}`, articleId: title, title, description: `Mô tả ${title}`, publisher: "VnExpress Sport", publisherSlug: "vnexpress-sport", attribution: "VnExpress", url: null,
  publishedAt: "2026-10-20T01:00:00Z", label: "MEDIA", certainty: "REPORTED", storyType: "MATCH", transferStage: null, originHint: null, officialWording: false, image: null,
  entities: [], leagueSlugs: ["premier-league"], match: null, ...overrides,
});
const group = (key: string, lead: FeedCardView, others: FeedCardView[] = []): FeedGroupView => ({ key, lead, others, latestAt: lead.publishedAt });
const ranked = ["A", "B", "C", "D", "E", "F"].map((name) => group(name.toLowerCase(), card(`Tin ${name}`, name === "C" ? { image: "https://i.vnecdn.net/c.jpg" } : {})));
const empty: OverviewData = {
  mode: { kind: "between", text: "Giữa hai vòng đấu" }, collectedAt: null, ribbon: [], followedClubIds: [], watch: null, cover: null, stories: [], hot: { matches: [], topics: [] }, hotReasons: {},
  updates: [], updateTab: "tat-ca", transfers: [], bites: [], shortNames: {}, standings: null, highlights: [], fans: { voz: [], reddit: [] }, scorers: null, mine: [], suggest: [],
  viewer: { signedIn: false, clubs: [], next: null }, briefReady: false,
};
const data = (overrides: Partial<OverviewData> = {}): OverviewData => {
  const today = splitToday(ranked);
  return { ...empty, cover: today.cover, stories: today.stories, ...overrides };
};
const render = (value: OverviewData) => load(renderToStaticMarkup(<Overview data={value} now={now} />));
const match = (slug: string, overrides: Partial<RibbonMatch> = {}): RibbonMatch => ({ slug, kickoffAt: "2026-10-19T14:00:00.000Z", status: "FINISHED", leagueSlug: "premier-league", home: { id: `${slug}-h`, name: "Arsenal", crestUrl: null }, away: { id: `${slug}-a`, name: "Chelsea", crestUrl: null }, homeScore: 2, awayScore: 1, tags: [], ...overrides });

describe("homepage story blocks", () => {
  it("takes a pictured cover from the first five and four numbered stories, never repeating a story", () => {
    const today = splitToday(ranked);
    expect(today.cover?.key).toBe("c"); expect(today.stories.map((item) => item.key)).toEqual(["a", "b", "d", "e"]);
    expect([...today.used].sort()).toEqual(["a", "b", "c", "d", "e"]);
    expect(splitToday([]).cover).toBeNull();
    expect(splitToday(ranked.filter((item) => item.key !== "c")).cover?.key).toBe("a");
    expect(parseUpdateTab("chuyen-nhuong")).toBe("chuyen-nhuong"); expect(parseUpdateTab("x")).toBe("tat-ca"); expect(parseUpdateTab(["hlv"])).toBe("tat-ca");
  });
  it("keeps stories of the last 72 hours, and widens to the whole week when that leaves fewer than five", () => {
    const at = (key: string, hoursAgo: number) => group(key, card(key, { publishedAt: new Date(now.getTime() - hoursAgo * 3600000).toISOString() }));
    const fresh = ["a", "b", "c", "d", "e"].map((key, index) => at(key, index * 10));
    expect(storyWindow([...fresh, at("old", 100)], now).map((item) => item.key)).toEqual(["a", "b", "c", "d", "e"]);
    expect(storyWindow([at("a", 1), at("old", 100), at("older", 150)], now).map((item) => item.key)).toEqual(["a", "old", "older"]);
  });
  it("renders one cover with the headline as its picture's alt text and four numbered stories", () => {
    const $ = render(data());
    expect($(".ov-cover").attr("href")).toBe("/news/bao-Tin-C");
    expect($(".ov-cover img").attr("alt")).toBe("Tin C"); expect($(".ov-cover img").attr("fetchpriority")).toBe("high"); expect($(".ov-cover img").attr("loading")).toBe("eager");
    expect($(".ov-cover").text()).toContain("Ảnh: VnExpress Sport");
    expect($(".ov-today-list a").map((_, node) => $(node).attr("href")).get()).toEqual(["/news/bao-Tin-A", "/news/bao-Tin-B", "/news/bao-Tin-D", "/news/bao-Tin-E"]);
    expect($(".ov-num").map((_, node) => $(node).text()).get()).toEqual(["01", "02", "03", "04"]);
    for (const block of [".discovery-cinema", ".ov-explore", ".ov-table", ".hot-strip", ".pitch-ribbon", ".ov-stream", ".ov-empty"]) expect($(block)).toHaveLength(0);
    expect($.html()).not.toContain("minh họa");
  });
  it("names the time zone once, in the status line with the newest collection time", () => {
    const $ = render(data({ mode: { kind: "matchday", text: "Ngày thi đấu · 3 trận hôm nay" }, collectedAt: "2026-10-20T02:05:00.000Z", ribbon: [match("m0")] }));
    expect($(".ov-status").text()).toBe("Ngày thi đấu · 3 trận hôm nayCập nhật lúc 09:05 · Giờ Việt Nam");
    expect($.text().match(/Giờ Việt Nam|UTC\+7/g)).toHaveLength(1);
  });
  it("shows a single empty state, never two stacked, when there are no stories or matches", () => {
    const $ = render(empty);
    expect($(".ov-empty")).toHaveLength(1); expect($(".ov-empty-note")).toHaveLength(0);
    expect($.text().match(/Chưa có/g)).toHaveLength(1);
    expect($(".my-space a.fb-button").attr("href")).toBe("/following/manage");
  });
  it("lists the stream's rows and filters them by type on the client, ten at most", () => {
    const transfer = group("t", card("Arsenal hỏi mua tiền đạo", { storyType: "TRANSFER" }));
    const updates = [transfer, ...Array.from({ length: 12 }, (_, index) => group(`u${index}`, card(`Tin mới ${index}`)))];
    const $ = render(data({ updates, updateTab: "chuyen-nhuong" }));
    expect($(".desk-filters button[aria-pressed='true']").text()).toBe("Chuyển nhượng");
    expect($(".ov-stream-title").map((_, node) => $(node).text()).get()).toEqual(["Arsenal hỏi mua tiền đạo"]);
    const rows = $.html(); expect(rows).not.toContain("href=\"/?loai=");
    const all = render(data({ updates }));
    expect(all(".ov-stream-list > li")).toHaveLength(10); expect(all(".ov-row-extra")).toHaveLength(5);
    expect(all(".ov-more").text()).toBe("Xem thêm 5 tin");
    const row = (key: string, types: string[]): StoryRow => ({ key, href: `/news/${key}`, title: key, types, label: "", kind: "", publisher: "", papers: 0, time: "", ago: "", publishedAt: "", image: null, fresh: false, crests: [] });
    const many = [row("a", ["MATCH"]), row("b", ["MANAGER", "MATCH"]), row("c", ["TACTICAL"]), row("d", ["CONTRACT"])];
    expect(streamRows(many, "tran-dau").map((item) => item.key)).toEqual(["a", "b"]);
    expect(streamRows(many, "hlv").map((item) => item.key)).toEqual(["b"]);
    expect(streamRows(many, "chuyen-nhuong").map((item) => item.key)).toEqual(["d"]);
    expect(streamRows(many, "tat-ca")).toHaveLength(4);
  });
  it("shows transfer talk only as the press reports it, with the origin and short club names with crests", () => {
    const transfer = group("t", card("Arsenal hỏi mua tiền đạo", { storyType: "TRANSFER", transferStage: "NEGOTIATION", originHint: "Fabrizio Romano", entities: [{ kind: "player", name: "Viktor Gyökeres", initials: "VG" }, { id: "c57", kind: "club", name: "Arsenal FC", initials: "ARS", crestUrl: "https://crests.football-data.org/57.png" }] }));
    const $ = render(data({ transfers: [transfer], shortNames: { c57: "Arsenal" } }));
    expect($(".xp-transfer").text()).toContain("Viktor Gyökeres"); expect($(".xp-transfer .transfer-status").text()).toBe("Đang đàm phán");
    expect($(".xp-origin").text()).toBe("theo Fabrizio Romano");
    expect($(".xp-club").text()).toBe("Arsenal"); expect($(".xp-club img").attr("src")).toBe("https://crests.football-data.org/57.png");
    expect($.html()).not.toContain("Đã xác nhận"); expect($.html()).not.toContain("Phí");
  });
  it("lets a guest follow a club in one tap, and shows a follower's next match and latest story", () => {
    const guest = render(data({ suggest: [{ id: "c1", name: "Arsenal", crestUrl: null }, { id: "c2", name: "Chelsea", crestUrl: null }] }));
    expect(guest(".qf-grid button").map((_, node) => guest(node).attr("aria-label")).get()).toEqual(["Theo dõi Arsenal", "Theo dõi Chelsea"]);
    expect(guest(".followed-summary a.fb-button-ghost").attr("href")).toBe("/following/manage");
    const next = { slug: "m1", kickoffAt: "2026-10-25T14:00:00.000Z", status: "SCHEDULED", round: null, home: { name: "Arsenal", tla: "ARS", crestUrl: null }, away: { name: "Chelsea", tla: "CHE", crestUrl: null }, homeScore: null, awayScore: null };
    const $ = render(data({ viewer: { signedIn: true, clubs: [{ id: "c1", name: "Arsenal" }], next }, mine: [{ id: "c1", name: "Arsenal", next, story: { title: "Arsenal thắng đậm", href: "/news/bao-A" } }] }));
    expect($(".ms-club").text()).toBe("Arsenal"); expect($(".ms-next").text()).toContain("Arsenal – Chelsea"); expect($(".ms-next").text()).toContain("CN 25/10 · 21:00"); expect($(".ms-next").attr("href")).toBe("/match/m1");
    expect($(".ms-story").attr("href")).toBe("/news/bao-A"); expect($(".qf-grid")).toHaveLength(0);
  });
  it("splits what is hot into matches and clubs/players, each club with the headline of its most-covered story", () => {
    const mu = { kind: "club" as const, id: "c1", name: "Man United", crestUrl: null, stories: 9, threads: 2 };
    const mention = { id: "c1", kind: "club" as const, name: "Manchester United FC", initials: "MUN" };
    const groups = [group("x", card("MU thua đau", { entities: [mention] })), group("y", card("MU khủng hoảng", { entities: [mention] }), [card("MU khủng hoảng 2"), card("MU khủng hoảng 3")]), group("z", card("Chelsea thắng"))];
    const reasons = hotReasons([mu, { ...mu, id: "c9", name: "Leeds" }], groups);
    expect(reasons).toEqual({ "club-c1": { title: "MU khủng hoảng", href: "/news/bao-MU-kh-ng-ho-ng" } });
    expect(render(data())(".hot-strip")).toHaveLength(0);
    const $ = render(data({
      hot: { matches: [{ slug: "m9", home: "Como", away: "Man United", homeScore: 4, awayScore: 1, threads: 3 }], topics: [mu] }, hotReasons: reasons,
      scorers: { leagueName: "Premier League", leagueHref: "/league/premier-league?tab=thong-ke", list: [{ name: "Erling Haaland", goals: 8, assists: 1, team: "Man City", crestUrl: null, photoUrl: null, href: "/player/player-1" }] },
    }));
    expect($(".hot-group h3").map((_, node) => $(node).text()).get()).toEqual(["Trận", "Đội/Cầu thủ"]);
    expect($(".hot-strip b").map((_, node) => $(node).text()).get()).toEqual(["Como 4–1 Man United", "Man United"]);
    expect($(".hot-strip small").map((_, node) => $(node).text()).get()).toEqual(["3 chủ đề fan", "MU khủng hoảng"]);
    expect($(".hot-strip a").first().attr("href")).toBe("/match/m9");
    expect($(".ov-scorers").text()).toContain("Erling Haaland"); expect($(".ov-scorers strong").text()).toBe("8");
  });
  it("links highlights to the match page with a solid caption band and keeps unsafe crests out of the match strip", () => {
    const $ = render(data({
      highlights: [{ videoId: "abc123def45", title: "Highlights ARSENAL vs CHELSEA", channelName: "FPT Bóng Đá", publishedAt: "2026-10-19T20:00:00Z", matchSlug: "m0", leagueSlug: "premier-league", home: "Arsenal", away: "Chelsea", kickoffAt: "2026-10-19T14:00:00Z" }],
      ribbon: [match("m0", { home: { id: "h", name: "Arsenal", crestUrl: "https://evil.example/x.png" } })],
    }));
    expect($(".cinema-card").attr("href")).toBe("/match/m0#match-highlight"); expect($(".cinema-copy").text()).toContain("FPT Bóng Đá · YouTube");
    expect($(".cinema-copy b").text()).toBe("Arsenal – Chelsea"); expect($(".rail-dots")).toHaveLength(0);
    const pitch = $(".pitch-match");
    expect(pitch.attr("href")).toBe("/match/m0?tab=su-kien"); expect(pitch.find("strong").map((_, node) => $(node).text()).get()).toEqual(["2", "1"]);
    expect(pitch.find("img")).toHaveLength(0); expect(pitch.find(".ov-crest-fallback").first().text()).toBe("ARS");
    expect(pitch.find(".pitch-match-meta small").text()).toBe("Hôm qua");
  });
  it("puts the reader's matches first with drama tags shown, and leads with the match worth watching", () => {
    const plain = match("plain"); const drama = match("drama", { tags: ["comeback", "late"] }); const mine = match("mine", { home: { id: "c1", name: "Arsenal", crestUrl: null } });
    const ordered = orderRibbon([plain, drama, mine], ["c1"]);
    expect(ordered.map((item) => item.slug)).toEqual(["mine", "drama", "plain"]);
    const watch = { slug: "big", kickoffAt: "2026-10-20T19:00:00.000Z", leagueSlug: "premier-league", home: { name: "Arsenal", crestUrl: null, position: 1 }, away: { name: "Man City", crestUrl: null, position: 2 } };
    const $ = render(data({ ribbon: ordered, followedClubIds: ["c1"], watch }));
    expect($(".pitch-match").map((_, node) => $(node).attr("href")).get()).toEqual(["/match/big", "/match/mine?tab=su-kien", "/match/drama?tab=su-kien", "/match/plain?tab=su-kien"]);
    expect($(".pitch-watch .pitch-watch-label").text()).toBe("Trận đáng xem tiếp theo"); expect($(".pitch-watch [role='timer']")).toHaveLength(1);
    expect($(".pitch-watch .pitch-match-meta small").text()).toBe("Tối nay 02:00");
    expect($(".pitch-match.ours .pitch-tag-ours").text()).toBe("Đội của bạn");
    expect($(".pitch-tag-comeback").text()).toBe("Lội ngược dòng"); expect($(".pitch-tag-late").text()).toBe("Bàn phút 90+");
  });
});

describe("match dates and day mode", () => {
  it("says dates the Vietnamese way", () => {
    expect(matchWhen("2026-10-19T14:00:00Z", now, true)).toBe("Hôm qua");
    expect(matchWhen("2026-10-20T01:00:00Z", now, true)).toBe("Hôm nay");
    expect(matchWhen("2026-10-17T14:00:00Z", now, true)).toBe("T7 17/10");
    expect(matchWhen("2026-10-20T19:00:00Z", now, false)).toBe("Tối nay 02:00"); // 02:00 on Wednesday still belongs to tonight
    expect(matchWhen("2026-10-20T12:00:00Z", now, false)).toBe("Tối nay 19:00");
    expect(matchWhen("2026-10-20T08:00:00Z", now, false)).toBe("Hôm nay 15:00");
    expect(matchWhen("2026-10-21T08:00:00Z", now, false)).toBe("Ngày mai 15:00");
    expect(matchWhen("2026-10-25T14:00:00Z", now, false)).toBe("CN 25/10 · 21:00");
    expect(vnShortDate("2026-11-08T18:00:00Z")).toBe("T2 9/11"); expect(vnShortDate("2026-11-07T18:00:00Z")).toBe("CN 8/11");
  });
  it("derives live, match day or between rounds from the stored fixtures", () => {
    expect(dayMode([match("a", { status: "LIVE" }), match("b", { status: "HALFTIME" })], now)).toEqual({ kind: "live", text: "2 trận đang diễn ra" });
    expect(dayMode([match("a", { status: "SCHEDULED", kickoffAt: "2026-10-20T19:00:00.000Z" })], now).kind).toBe("matchday");
    expect(dayMode([match("a"), match("b", { status: "SCHEDULED", kickoffAt: "2026-10-25T14:00:00.000Z" })], now)).toEqual({ kind: "between", text: "Giữa hai vòng đấu · Trận tới CN 25/10" });
    expect(dayMode([], now)).toEqual({ kind: "between", text: "Giữa hai vòng đấu" });
  });
});

describe("drama tags", () => {
  const base = { status: "FINISHED", homeClubId: "H", awayClubId: "A", homeScore: 2, awayScore: 1 };
  const goal = (clubId: string, minute: number, playerName = "X", type = "GOAL", addedMinute: number | null = null): DramaEvent => ({ type, clubId, playerId: null, playerName, minute, addedMinute });
  it("finds a comeback, a late goal, a red card, a hat-trick and a goal fest from the events and score", () => {
    expect(dramaTags(base, [goal("A", 10), goal("H", 50), goal("H", 90, "Y", "GOAL", 3)])).toEqual(["comeback", "late"]);
    expect(dramaTags(base, [goal("H", 10, "Saka"), goal("A", 50, "Palmer"), goal("H", 70, "Rice"), { ...goal("A", 80, "Caicedo"), type: "RED_CARD" }])).toEqual(["red"]);
    expect(dramaTags({ ...base, homeScore: 4, awayScore: 2 }, [goal("A", 5, "Palmer"), goal("A", 8, "Jackson"), goal("H", 20, "Kane"), goal("H", 30, "Kane", "PENALTY"), goal("H", 60, "Kane"), goal("H", 70, "Saka")])).toEqual(["comeback", "hattrick", "goalfest"]);
  });
  it("derives nothing it cannot prove: missing minutes or goals, own goals for a hat-trick, unplayed matches", () => {
    expect(dramaTags(base, [goal("A", 10), goal("H", 50)])).toEqual([]); // one home goal missing: order unknown
    expect(dramaTags({ ...base, homeScore: 3, awayScore: 0 }, [goal("H", 10, "X"), goal("H", 20, "X", "OWN_GOAL"), goal("H", 30, "X")])).toEqual([]);
    expect(dramaTags({ ...base, status: "SCHEDULED", homeScore: null, awayScore: null }, [goal("H", 95)])).toEqual([]);
    expect(dramaTags({ ...base, homeScore: 1, awayScore: 1 }, [goal("A", 10), goal("H", 92)])).toEqual(["late"]);
  });
});

describe("match strip (SQL)", () => {
  let db: PGlite; let database: SyncDatabase;
  const ids = { league: randomUUID(), season: randomUUID(), home: randomUUID(), away: randomUUID(), third: randomUUID() };
  const insertMatch = (slug: string, kickoff: string, status: string, home = ids.home, away = ids.away, homeScore: number | null = null, awayScore: number | null = null) => database.query(`INSERT INTO "Match" (id,slug,provider,"externalId","leagueId","seasonId","homeClubId","awayClubId","kickoffAt",status,"homeScore","awayScore","updatedAt") VALUES ($1::uuid,$2,'FOOTBALL_DATA',$2,$3::uuid,$4::uuid,$5::uuid,$6::uuid,$7::timestamptz,$8::"MatchStatus",$9,$10,now()) RETURNING id`,
    [randomUUID(), slug, ids.league, ids.season, home, away, kickoff, status, homeScore, awayScore]);
  beforeAll(async () => {
    db = new PGlite();
    for (const entry of readdirSync("prisma/migrations", { withFileTypes: true }).filter((entry) => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) await db.exec(readFileSync(`prisma/migrations/${entry.name}/migration.sql`, "utf8"));
    database = { query: async <T,>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows, transaction: (work) => db.transaction((tx) => work({ query: async <T,>(sql: string, params: unknown[] = []) => (await tx.query<T>(sql, params)).rows })) };
    await database.query(`INSERT INTO "League" (id,slug,name,country,"updatedAt") VALUES ($1::uuid,'premier-league','Premier League','England',now())`, [ids.league]);
    await database.query(`INSERT INTO "Season" (id,"leagueId",name,"startsAt","endsAt","updatedAt") VALUES ($1::uuid,$2::uuid,'2026/2027','2026-08-01','2027-06-30',now())`, [ids.season, ids.league]);
    for (const [id, name, short] of [[ids.home, "Arsenal FC", "Arsenal"], [ids.away, "Chelsea FC", null], [ids.third, "Liverpool FC", "Liverpool"]] as const) await database.query(`INSERT INTO "Club" (id,slug,name,"shortName","updatedAt") VALUES ($1::uuid,$2,$3,$4,now())`, [id, `club-${id}`, name, short]);
  }, 60000);
  afterAll(async () => { await db.close(); });

  it("falls back to the next week of fixtures on a quiet stretch, then lists recent results and coming fixtures with drama tags", async () => {
    await insertMatch("far", "2026-10-30T12:00:00Z", "SCHEDULED");
    await insertMatch("farther", "2026-11-10T12:00:00Z", "SCHEDULED");
    expect((await readRibbon(database, now)).map((item) => item.slug)).toEqual(["far"]);
    await insertMatch("old", "2026-10-15T12:00:00Z", "FINISHED", ids.home, ids.away, 1, 1);
    const [{ id: recent }] = await insertMatch("recent", "2026-10-19T12:00:00Z", "FINISHED", ids.home, ids.away, 2, 1) as { id: string }[];
    await insertMatch("latest", "2026-10-20T01:00:00Z", "FINISHED", ids.home, ids.away, 0, 0);
    await insertMatch("next", "2026-10-21T12:00:00Z", "SCHEDULED");
    // Two providers stored events; the one with the most is read. The away side scored first, the home side won 2–1 late.
    for (const [index, [club, minute, provider, player]] of ([[ids.away, 10, "HIGHLIGHTLY", "Palmer"], [ids.home, 50, "HIGHLIGHTLY", "Saka"], [ids.home, 91, "HIGHLIGHTLY", "Saka"], [ids.home, 60, "OTHER", "Saka"]] as const).entries())
      await database.query(`INSERT INTO "MatchEvent" (id,"matchId",provider,"externalId","clubId",type,minute,"playerName","updatedAt") VALUES ($1::uuid,$2::uuid,$3,$4,$5::uuid,'GOAL',$6,$7,now())`, [randomUUID(), recent, provider, String(index), club, minute, player]);
    await database.query(`INSERT INTO "MatchEvent" (id,"matchId",provider,"externalId","clubId",type,minute,"playerName","updatedAt") VALUES ($1::uuid,$2::uuid,'HIGHLIGHTLY','9',$3::uuid,'RED_CARD',70,'Caicedo',now())`, [randomUUID(), recent, ids.away]);
    const ribbon = await readRibbon(database, now);
    expect(ribbon.map((item) => item.slug)).toEqual(["latest", "recent", "next"]);
    expect(ribbon[0]).toMatchObject({ status: "FINISHED", leagueSlug: "premier-league", home: { id: ids.home, name: "Arsenal" }, away: { name: "Chelsea FC" }, homeScore: 0, tags: [] });
    expect(ribbon[1].tags).toEqual(["comeback", "late", "red"]);
    expect(orderRibbon(ribbon, []).map((item) => item.slug)).toEqual(["recent", "latest", "next"]);
  });
  it("picks the coming match between the best-placed clubs as the one worth watching", async () => {
    expect(await readWatchMatch(database, now)).toBeNull();
    for (const [club, position] of [[ids.home, 1], [ids.away, 9], [ids.third, 2]] as const) await database.query(`INSERT INTO "Standing" (id,provider,"leagueId","seasonId","clubId",stage,"tableType",position,"fetchedAt","updatedAt") VALUES ($1::uuid,'FOOTBALL_DATA',$2::uuid,$3::uuid,$4::uuid,'REGULAR_SEASON','TOTAL',$5,now(),now())`, [randomUUID(), ids.league, ids.season, club, position]);
    await insertMatch("top", "2026-10-25T12:00:00Z", "SCHEDULED", ids.third, ids.home);
    const watch = await readWatchMatch(database, now);
    expect(watch).toMatchObject({ slug: "top", home: { name: "Liverpool", position: 2 }, away: { name: "Arsenal", position: 1 } });
    expect(await readNewsCollectedAt(database)).toBeNull();
  });
});
