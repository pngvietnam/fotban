import React from "react";
import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { SyncDatabase } from "../lib/sync-database";
import { defaultTimeline, fixtureState, parseTimeline, shortSeason, sideScores, timelineHref, type TimelineView } from "../lib/match-timeline";
import { readTimeline, readTimelineSidebar, timelineScope, type TimelineData } from "../services/match-timeline";
import { MatchTimeline } from "../components/matches/match-timeline";
import type { MatchSummary } from "../types/match-ui";
import { uiMatch, uiNow } from "./fixtures/match-ui";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
const view = (overrides: Partial<TimelineView> = {}): TimelineView => ({ ...defaultTimeline(uiNow), ...overrides });

describe("timeline parameters", () => {
  it("defaults to today in Vietnam, every league and status, nothing extra opened", () => {
    expect(parseTimeline({}, uiNow)).toEqual({ success: true, data: { league: "all", status: "all", ngay: "2026-10-16", truoc: 0, sau: 0, doi: false, today: "2026-10-16" } });
    const parsed = parseTimeline({ ngay: "2026-10-21", league: "champions-league", status: "live", truoc: "2", sau: "4", doi: "theo-doi" }, uiNow);
    expect(parsed.success && parsed.data).toMatchObject({ ngay: "2026-10-21", league: "champions-league", status: "live", truoc: 2, sau: 4, doi: true });
    // Older range links open on their first day.
    expect(parseTimeline({ from: "2026-10-01", to: "2026-10-20" }, uiNow)).toMatchObject({ data: { ngay: "2026-10-01" } });
  });
  it("rejects unknown leagues, impossible dates, repeated or out-of-range values", () => {
    for (const params of [{ league: "serie-a" }, { ngay: "2026-02-30" }, { league: ["premier-league", "la-liga"] }, { doi: "1" }, { truoc: "-1" }, { sau: "99" }, { status: "postponed" }]) expect(parseTimeline(params, uiNow).success).toBe(false);
  });
  it("builds canonical links without defaults", () => {
    expect(timelineHref(view())).toBe("/matches");
    expect(timelineHref(view(), { ngay: "2026-10-21", league: "la-liga", status: "live", doi: true, truoc: 2 })).toBe("/matches?ngay=2026-10-21&league=la-liga&status=live&doi=theo-doi&truoc=2");
    expect(timelineHref(view({ sau: 2 }), { sau: 4 }, "#md-date-2026-10-16")).toBe("/matches?sau=4#md-date-2026-10-16");
  });
  it("shows scores after extra time, short seasons and card states", () => {
    expect(sideScores(uiMatch({ homeScore: 1, awayScore: 1, homeExtraTimeScore: 1, awayExtraTimeScore: 0, scoreDuration: "EXTRA_TIME" }))).toEqual({ home: 2, away: 1 });
    expect(sideScores(uiMatch({ homeScore: 2, awayScore: null }))).toBeNull();
    expect(shortSeason("2026/2027")).toBe("2026/27"); expect(shortSeason(null)).toBeNull();
    expect(["FINISHED", "SCHEDULED", "POSTPONED", "CANCELLED", "HALFTIME"].map((status) => fixtureState(status as MatchSummary["status"]))).toEqual(["finished", "upcoming", "postponed", "postponed", "live"]);
  });
});

describe("timeline rendering", () => {
  const finished = uiMatch();
  const upcoming = uiMatch({ id: "fixture-upcoming", slug: "fixture-cl", status: "SCHEDULED", homeScore: null, awayScore: null, kickoffAt: "2026-10-16T12:00:00Z", round: "3", league: { slug: "champions-league", name: "UEFA Champions League" } });
  const stale = uiMatch({ id: "fixture-live", slug: "fixture-live", status: "LIVE", homeScore: 0, awayScore: 0, kickoffAt: "2026-10-15T20:00:00Z", lastUpdatedAt: "2026-10-14T00:00:00Z", homeClub: null, awayClub: { name: "Fixture United" } });
  const data: TimelineData = { days: ["2026-10-16"], matches: [upcoming, finished, stale], earlierDays: 3, nextUpcoming: "2026-10-18", highlighted: [finished.id] };
  const page = (overrides: Partial<Parameters<typeof MatchTimeline>[0]> = {}) => load(renderToStaticMarkup(<MatchTimeline view={view()} data={data} sidebar={null} follow={{ signedIn: false, clubs: [] }} now={uiNow} {...overrides} />));

  it("groups a day by competition and rounds, with real links and no invented scores", () => {
    const $ = page();
    expect($(".md-league-group .md-group-heading b").map((_, node) => $(node).text()).get()).toEqual(["Premier League", "Champions League"]);
    expect($(".md-round-title b").map((_, node) => $(node).text()).get()).toEqual(["Vòng 8 / 38", "Lượt trận 3 / 8"]);
    const card = $(`a.md-fixture-main[href="/match/fixture-alpha-beta"]`);
    expect(card.find("strong").map((_, node) => $(node).text()).get()).toEqual(["2", "1"]); expect(card.text()).toContain("FT");
    const next = $(`a.md-fixture-main[href="/match/fixture-cl"]`);
    expect(next.find("strong")).toHaveLength(0); expect(next.text()).toContain("19:00"); expect(next.text()).toContain("Sắp diễn ra");
    expect($(".md-group-heading small").first().text()).toBe("Anh · 38 vòng · Mùa 2026/27");
  });
  it("links a validated highlight, says when none exists, and flags stale live scores", () => {
    const $ = page();
    expect($(`a[href="/match/fixture-alpha-beta#match-highlight"]`).text()).toContain("Xem highlight");
    const missing = page({ data: { ...data, highlighted: [] } });
    expect(missing(".md-fixture-extras").text()).toContain("Chờ highlight hợp lệ");
    const live = $(`a.md-fixture-main[href="/match/fixture-live"]`);
    expect(live.text()).toContain("Có thể đã cũ"); expect(live.text()).toContain("Đội chủ nhà"); expect(live.find(".md-crest-fallback").last().text()).toBe("FU");
    expect($("img")).toHaveLength(0); expect($.html()).not.toContain("undefined");
  });
  it("opens earlier and later match days through links and counts each status", () => {
    const $ = page();
    expect($(".md-load-earlier a").attr("href")).toBe("/matches?truoc=2#md-date-2026-10-16"); expect($(".md-load-earlier").text()).toContain("3 ngày có lịch");
    expect($(".md-upcoming-more a").attr("href")).toBe("/matches?sau=2"); expect($(".md-upcoming-more").text()).toContain("Từ 18/10/2026");
    expect($(".md-statusbar a").map((_, node) => $(node).text()).get()).toEqual(["Tất cả3", "Đang diễn ra1", "Sắp đá1", "Đã kết thúc1"]);
    const done = page({ view: view({ status: "finished" }), data: { ...data, earlierDays: 0, nextUpcoming: null } });
    expect(done(".md-fixture-card")).toHaveLength(1);
    expect(done(".md-load-earlier").text()).toContain("Đã hiển thị hết"); expect(done(".md-upcoming-more").text()).toContain("Đã hiển thị hết");
    expect($(".md-competition-tabs a").map((_, node) => $(node).attr("href")).get()).toEqual(["/matches", "/matches?league=premier-league", "/matches?league=la-liga", "/matches?league=champions-league"]);
  });
  it("explains the club filter to guests and shows a generic error without details", () => {
    const guest = page({ view: view({ doi: true }) });
    expect(guest(".md-follow-note").text()).toContain("Đăng nhập và chọn đội bóng"); expect(guest(".md-follow-note a").last().attr("href")).toBe("/matches");
    const signed = page({ view: view({ doi: true }), follow: { signedIn: true, clubs: [{ id: "c1", name: "Arsenal FC" }] } });
    expect(signed(".md-follow-note").text()).toContain("Đang lọc theo Arsenal FC.");
    const failed = page({ data: null });
    expect(failed("[role=alert]").text()).toContain("Chưa thể tải dữ liệu trận đấu");
  });
});

describe("timeline data (SQL)", () => {
  let db: PGlite; let database: SyncDatabase;
  const ids = { pl: randomUUID(), cl: randomUUID(), sPl: randomUUID(), sCl: randomUUID(), a: randomUUID(), b: randomUUID(), c: randomUUID() };
  const now = new Date("2026-10-16T00:00:00Z");
  const loader = () => vi.fn(async (days: string[]) => (await database.query<MatchSummary>(`SELECT id FROM "Match" WHERE to_char("kickoffAt" AT TIME ZONE 'Asia/Ho_Chi_Minh','YYYY-MM-DD')=ANY($1::text[])`, [days])));
  beforeAll(async () => {
    db = new PGlite();
    for (const entry of readdirSync("prisma/migrations", { withFileTypes: true }).filter((entry) => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) await db.exec(readFileSync(`prisma/migrations/${entry.name}/migration.sql`, "utf8"));
    database = {
      query: async <T,>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows,
      transaction: (work) => db.transaction((tx) => work({ query: async <T,>(sql: string, params: unknown[] = []) => (await tx.query<T>(sql, params)).rows })),
    };
  }, 60000);
  beforeEach(async () => {
    await db.exec('TRUNCATE "Standing","Match","ClubSeason","Season","Club","League" CASCADE');
    for (const [id, slug, name] of [[ids.pl, "premier-league", "Premier League"], [ids.cl, "champions-league", "UEFA Champions League"]]) await database.query('INSERT INTO "League" (id,slug,name,country,"updatedAt") VALUES ($1::uuid,$2,$3,\'X\',now())', [id, slug, name]);
    for (const [id, league] of [[ids.sPl, ids.pl], [ids.sCl, ids.cl]]) await database.query('INSERT INTO "Season" (id,"leagueId",name,"startsAt","endsAt","updatedAt") VALUES ($1::uuid,$2::uuid,\'2026/2027\',\'2026-08-01\',\'2027-06-30\',now())', [id, league]);
    for (const [id, name] of [[ids.a, "Alpha"], [ids.b, "Beta"], [ids.c, "Gamma"]]) await database.query('INSERT INTO "Club" (id,slug,name,"updatedAt") VALUES ($1::uuid,$2,$3,now())', [id, `club-${name}`, name]);
    const matches: [string, string, string, string, string, number | null, number | null][] = [
      ["pl", "2026-10-11T12:00:00Z", "FINISHED", "a", "b", 2, 0], ["pl", "2026-10-13T12:00:00Z", "FINISHED", "b", "c", 1, 1],
      ["cl", "2026-10-14T19:00:00Z", "FINISHED", "a", "c", 3, 1], ["pl", "2026-10-16T12:00:00Z", "SCHEDULED", "a", "b", null, null],
      ["pl", "2026-10-17T12:00:00Z", "POSTPONED", "a", "c", null, null], ["pl", "2026-10-18T12:00:00Z", "SCHEDULED", "c", "b", null, null],
      ["cl", "2026-10-20T19:00:00Z", "SCHEDULED", "a", "c", null, null],
    ];
    for (const [index, [league, kickoff, status, home, away, hs, as]] of matches.entries()) await database.query(`INSERT INTO "Match" (id,slug,provider,"externalId","leagueId","seasonId","homeClubId","awayClubId","kickoffAt",status,"homeScore","awayScore","updatedAt") VALUES ($1::uuid,$2,'FOOTBALL_DATA',$3,$4::uuid,$5::uuid,$6::uuid,$7::uuid,$8::timestamptz,$9::"MatchStatus",$10,$11,now())`,
      [randomUUID(), `m${index}`, String(index), league === "pl" ? ids.pl : ids.cl, league === "pl" ? ids.sPl : ids.sCl, ids[home as "a"], ids[away as "a"], kickoff, status, hs, as]);
    for (const [club, position] of [[ids.a, 1], [ids.b, 2], [ids.c, 10]] as const) await database.query(`INSERT INTO "Standing" (id,provider,"leagueId","seasonId","clubId",stage,"tableType",position,"playedGames",points,"fetchedAt","updatedAt") VALUES ($1::uuid,'FOOTBALL_DATA',$2::uuid,$3::uuid,$4::uuid,'REGULAR_SEASON','TOTAL',$5,2,3,now(),now())`, [randomUUID(), ids.pl, ids.sPl, club, position]);
  });
  afterAll(async () => { await db.close(); });
  const read = (overrides: Partial<TimelineView>, clubs: string[] | null = null, load = loader()) => { const v = view({ ...overrides, today: "2026-10-16" }); return readTimeline(database, v, timelineScope(v, clubs), now, load); };

  it("opens the anchor day and counts earlier match days; the next upcoming day skips postponed matches", async () => {
    const load = loader();
    const data = await read({}, null, load);
    expect(data).toMatchObject({ days: ["2026-10-16"], earlierDays: 3, nextUpcoming: "2026-10-18", highlighted: [] });
    expect(load).toHaveBeenCalledWith(["2026-10-16"], expect.objectContaining({ leagueSlugs: ["premier-league", "la-liga", "champions-league"], clubIds: null }));
    expect(data.matches).toHaveLength(1);
  });
  it("adds earlier match days and later upcoming days on request, within the league and status chosen", async () => {
    expect(await read({ truoc: 2 })).toMatchObject({ days: ["2026-10-13", "2026-10-15", "2026-10-16"], earlierDays: 1 });
    expect(await read({ sau: 2 })).toMatchObject({ days: ["2026-10-16", "2026-10-18", "2026-10-21"], nextUpcoming: null });
    expect(await read({ league: "premier-league", truoc: 5 })).toMatchObject({ days: ["2026-10-11", "2026-10-13", "2026-10-16"], earlierDays: 0 });
    expect(await read({ status: "upcoming", truoc: 3 })).toMatchObject({ days: ["2026-10-16"], earlierDays: 0 });
  });
  it("limits the timeline to followed clubs and reads nothing when none are followed", async () => {
    expect(await read({ doi: true, truoc: 5 }, [ids.c])).toMatchObject({ days: ["2026-10-13", "2026-10-15", "2026-10-16"], nextUpcoming: "2026-10-18" });
    const load = loader();
    expect(await read({ doi: true }, [], load)).toMatchObject({ matches: [] }); expect(load).not.toHaveBeenCalled();
  });
  it("puts the best-placed meeting in the spotlight unless a followed club plays soon", async () => {
    const v = view({ today: "2026-10-16" });
    const sidebar = await readTimelineSidebar(database, v, timelineScope(v, null), [], now);
    expect(sidebar).toMatchObject({ leagueSlug: "premier-league", spotlight: { slug: "m3", home: { name: "Alpha", position: 1 }, away: { name: "Beta", position: 2 } }, archive: [] });
    expect(sidebar.standings.map((row) => row.name)).toEqual(["Alpha", "Beta", "Gamma"]);
    expect(sidebar.spotlight?.home.form).toEqual(["W"]);
    expect((await readTimelineSidebar(database, v, timelineScope(v, null), [ids.c], now)).spotlight?.slug).toBe("m5");
  });
});
