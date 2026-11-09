import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { SyncDatabase } from "../lib/sync-database";
import { cleanCommentText, coachName, commentApiErrorCode, commentRejection, commentTopics, parseCommentThreads, parseVideoStatistics, summarizeComments, type ApiComment, type StoredComment } from "../lib/fan-comments";
import { CommentApiError, youTubeCommentApi, type FanCommentApi, type HttpReader } from "../providers/youtube/comments";
import { dueCommentVideos, fanCommentRules, fanPulseForClub, fanPulseForMatch, hotFanPulses, purgeOldFanComments, syncFanComments } from "../services/fan-pulse";
import { hotNow } from "../services/hot-now";

const hour = 3_600_000;
/** A commentThreads.list item as YouTube sends it, author fields included: the parser must drop them. */
const apiThread = (id: string, text: string, likeCount = 0, publishedAt = "2026-11-08T22:00:00Z") => ({
  kind: "youtube#commentThread", id, snippet: { channelId: "UCchannelOfTheVideo00000", videoId: "abcdefghijk", canReply: true, totalReplyCount: 2, isPublic: true,
    topLevelComment: { kind: "youtube#comment", id, snippet: { channelId: "UCchannelOfTheVideo00000", videoId: "abcdefghijk", textDisplay: text, textOriginal: text, authorDisplayName: "@nguoi-xem-bi-mat", authorProfileImageUrl: "https://yt3.ggpht.com/secret-avatar", authorChannelUrl: "http://www.youtube.com/@nguoi-xem-bi-mat", authorChannelId: { value: "UCsecretAuthorChannel000" }, canRate: true, viewerRating: "none", likeCount, publishedAt, updatedAt: publishedAt } } },
});

describe("YouTube comment answers", () => {
  it("keeps the comment id, text, likes and time only, never the commenter", () => {
    const comments = parseCommentThreads({ kind: "youtube#commentThreadListResponse", items: [apiThread("UgzAAAAAAAAA1", "  Mbappé   đá quá hay\n\nhôm nay  ", 120), { broken: true }, apiThread("bad id!", "Không hợp lệ")] });
    expect(comments).toEqual([{ id: "UgzAAAAAAAAA1", text: "Mbappé đá quá hay hôm nay", likeCount: 120, publishedAt: "2026-11-08T22:00:00.000Z" }]);
    expect(JSON.stringify(comments)).not.toMatch(/nguoi-xem|avatar|UCsecret/);
    expect(parseCommentThreads({ error: "x" })).toBeNull();
    expect(cleanCommentText("a".repeat(800))).toHaveLength(500);
  });
  it("reads each video's public comment count", () => {
    expect(parseVideoStatistics({ items: [{ id: "abcdefghijk", statistics: { viewCount: "9", commentCount: "8214" } }, { id: "bcdefghijkl", statistics: { viewCount: "3" } }] }))
      .toEqual(new Map([["abcdefghijk", 8214], ["bcdefghijkl", null]]));
    expect(parseVideoStatistics({ items: [{ id: "short" }] })).toBeNull();
  });
  it("tells a refused key and a spent quota (stop everything) from comments turned off on one video", () => {
    expect(commentApiErrorCode(403, '{"error":{"code":403,"errors":[{"reason":"forbidden"}],"details":[{"reason":"API_KEY_IP_ADDRESS_BLOCKED"}]}}')).toBe("FORBIDDEN");
    expect(commentApiErrorCode(400, '{"error":{"code":400,"details":[{"reason":"API_KEY_INVALID"}]}}')).toBe("FORBIDDEN");
    expect(commentApiErrorCode(403, '{"error":{"errors":[{"reason":"quotaExceeded"}]}}')).toBe("QUOTA");
    expect(commentApiErrorCode(403, '{"error":{"errors":[{"reason":"commentsDisabled"}]}}')).toBe("DISABLED");
    expect(commentApiErrorCode(404, '{"error":{"errors":[{"reason":"videoNotFound"}]}}')).toBe("NOT_FOUND");
    expect(commentApiErrorCode(503, "")).toBe("UPSTREAM");
  });
  it("asks for the most relevant 100 plain-text comments with the key in a header, and never puts the key in errors", async () => {
    const seen: { url: URL; headers: Record<string, string> }[] = [];
    const http: HttpReader = async (url, init) => { seen.push({ url, headers: init.headers });
      if (url.pathname.endsWith("/videos")) return { status: 200, ok: true, text: async () => JSON.stringify({ items: [{ id: "abcdefghijk", statistics: { commentCount: "12" } }] }) };
      return { status: 403, ok: false, text: async () => '{"error":{"code":403,"details":[{"reason":"API_KEY_IP_ADDRESS_BLOCKED"}]}}' };
    };
    const api = youTubeCommentApi("secret-key-123", http);
    expect(await api.statistics(["abcdefghijk"])).toEqual(new Map([["abcdefghijk", 12]]));
    const error = await api.comments("abcdefghijk").catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(CommentApiError); expect((error as CommentApiError).code).toBe("FORBIDDEN");
    expect(String((error as Error).message)).not.toContain("secret");
    const call = seen[1];
    expect(Object.fromEntries(call.url.searchParams)).toEqual({ part: "snippet", videoId: "abcdefghijk", order: "relevance", textFormat: "plainText", maxResults: "100" });
    expect(call.url.href).not.toContain("secret"); expect(call.headers["X-Goog-Api-Key"]).toBe("secret-key-123");
    const offline = youTubeCommentApi("k", async () => { throw new Error("socket hang up"); });
    await expect(offline.comments("abcdefghijk")).rejects.toMatchObject({ code: "NETWORK" });
  });
});

describe("which comments count", () => {
  it("leaves out short, emoji-only, link, betting, crude, heavy and non-Vietnamese comments", () => {
    expect(commentRejection("Hay quá")).toBe("SHORT");
    expect(commentRejection("😂😂😂🔥🔥🔥⚽⚽")).toBe("NOISE");
    expect(commentRejection("Xem full trận tại https://example.com/xem")).toBe("LINK");
    expect(commentRejection("Vào bit.ly ngay nhé anh em ơi")).toBe("LINK");
    expect(commentRejection("Soi kèo nhà cái uy tín, inbox mình nhé")).toBe("SPAM");
    expect(commentRejection("Thủ môn đá như đcm, tệ thật sự")).toBe("CRUDE");
    expect(commentRejection("Trọng tài này vcl thật")).toBe("CRUDE");
    expect(commentRejection("Mong cầu thủ ấy vượt qua trầm cảm sớm")).toBe("HEAVY");
    expect(commentRejection("What a game, Mbappe was unreal tonight")).toBe("LANGUAGE");
    expect(commentRejection("Mbappé đá quá hay, xứng đáng cầu thủ hay nhất trận")).toBeNull();
    expect(commentRejection("tran nay doi nha da qua hay")).toBeNull();
  });
  it("sorts comments into topics, accents or not", () => {
    expect(commentTopics("trong tai bat penalty kieu gi vay")).toEqual(["referee"]);
    expect(commentTopics("Thủ môn cứu thua xuất sắc, hàng thủ thì quá tệ")).toEqual(["keeper", "defence"]);
    expect(commentTopics("HLV đổi chiến thuật hiệp 2 quá hay")).toEqual(["coach"]);
    expect(commentTopics("Tiền đạo dứt điểm quá kém")).toEqual(["attack"]);
    expect(commentTopics("Một trận đấu đẹp")).toEqual([]);
  });
  it("counts mentions once per comment, needs two comments for a chip and quotes the most-liked comments", () => {
    const comment = (id: string, text: string, likeCount: number, extra: Partial<StoredComment> = {}): StoredComment => ({ id, text, likeCount, publishedAt: "2026-11-08T22:00:00.000Z", videoId: "abcdefghijk", matchId: "m1", clubIds: [], playerIds: [], ...extra });
    const names = new Map([["p1", { name: "Kylian Mbappé", kind: "player" as const }], ["c1", { name: "Real Madrid", kind: "club" as const }], ["c2", { name: "Arsenal", kind: "club" as const }]]);
    const { chips, quotes } = summarizeComments([
      comment("a", "Mbappé quá đỉnh, Mbappé xứng đáng", 50, { playerIds: ["p1"], clubIds: ["c1"] }),
      comment("b", "Mbappe hay nhưng trọng tài thiên vị", 300, { playerIds: ["p1"], clubIds: ["c1"] }),
      comment("c", "Arteta cần thay đổi chiến thuật", 10, { clubIds: ["c2"] }),
      comment("d", "Arteta phải ra đi, VAR cũng sai", 10),
      comment("e", "Mbappe hay nhưng trọng tài thiên vị", 1),
    ], { names, coaches: [coachName("Mikel Arteta")], exclude: new Set(["c1"]) });
    expect(chips.map((chip) => [chip.label, chip.count])).toEqual([["Trọng tài & VAR", 3], ["Kylian Mbappé", 2], ["Mikel Arteta", 2]]);
    expect(chips.find((chip) => chip.label === "Real Madrid")).toBeUndefined();
    expect(chips.find((chip) => chip.label === "Arsenal")).toBeUndefined();
    expect(quotes.map((quote) => quote.id)).toEqual(["b", "a", "c"]);
    expect(quotes[0].url).toBe("https://www.youtube.com/watch?v=abcdefghijk&lc=b");
  });
});

describe("fan pulse (SQL)", () => {
  let db: PGlite; let database: SyncDatabase;
  const now = new Date("2026-11-09T05:00:00Z");
  const ids = { league: randomUUID(), season: randomUUID(), arsenal: randomUUID(), real: randomUUID(), city: randomUUID(), match: randomUUID(), other: randomUUID(), mbappe: randomUUID(), saka: randomUUID(), haaland: randomUUID(), vi: randomUUID(), en: randomUUID() };
  const insertVideo = async (ext: string, options: { matchId?: string | null; hoursAgo?: number; source?: string; language?: string | null } = {}) => {
    const id = randomUUID();
    await database.query(`INSERT INTO "Video" (id,provider,"externalId",title,"channelId","channelName",url,"publishedAt","validationStatus","matchId","videoSourceId",language,"updatedAt") VALUES ($1::uuid,'YOUTUBE',$2,'Highlight','UCaaaaaaaaaaaaaaaaaaaaaa','FPT Bóng Đá',$3,$4::timestamptz,'VALIDATED',$5::uuid,$6::uuid,$7,now())`,
      [id, ext, `https://www.youtube.com/watch?v=${ext}`, new Date(now.getTime() - (options.hoursAgo ?? 5) * hour), options.matchId === undefined ? ids.match : options.matchId, options.source ?? ids.vi, options.language === undefined ? "vi" : options.language]);
    return id;
  };
  /** A fake API: answers from a table of comments per video and counts every call. */
  const fakeApi = (byVideo: Record<string, ApiComment[] | CommentApiError>, totals: Record<string, number> = {}) => {
    const calls: string[] = [];
    const api: FanCommentApi & { calls: string[] } = {
      calls,
      async statistics(videoIds) { calls.push(`stats:${videoIds.length}`); return new Map(videoIds.map((id) => [id, totals[id] ?? null])); },
      async comments(videoId) { calls.push(`comments:${videoId}`); const answer = byVideo[videoId] ?? []; if (answer instanceof CommentApiError) throw answer; return answer; },
    };
    return api;
  };
  const c = (id: string, text: string, likeCount = 0, publishedAt = "2026-11-09T01:00:00.000Z"): ApiComment => ({ id, text, likeCount, publishedAt });
  const matchComments = [
    c("Ugz000000001", "Mbappé quá đỉnh, trọng tài bắt penalty sai rõ ràng", 300),
    c("Ugz000000002", "Mbappe hay nhất trận, Saka mờ nhạt", 120),
    c("Ugz000000003", "Arteta cần thay đổi chiến thuật ngay, hàng thủ quá tệ", 80),
    c("Ugz000000004", "Haaland mà đá trận này thì khác, Arsenal thua xứng đáng", 40),
    c("Ugz000000005", "Trọng tài quá tệ, VAR để làm gì vậy", 20),
    c("Ugz000000006", "Soi kèo nhà cái uy tín inbox ngay", 999),
    c("Ugz000000007", "Đẹp", 5),
    c("Ugz000000008", "Thủ môn đá như đcm luôn", 500),
  ];

  beforeAll(async () => {
    db = new PGlite();
    for (const entry of readdirSync("prisma/migrations", { withFileTypes: true }).filter((entry) => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) await db.exec(readFileSync(`prisma/migrations/${entry.name}/migration.sql`, "utf8"));
    database = {
      query: async <T>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows,
      transaction: (work) => db.transaction((tx) => work({ query: async <T>(sql: string, params: unknown[] = []) => (await tx.query<T>(sql, params)).rows })),
    };
  }, 60000);
  beforeEach(async () => {
    await db.exec('TRUNCATE "VideoComment","VideoCommentFetch","Video","VideoSource","JobRun","PlayerClub","Player","Match","ClubSeason","Season","Club","League" CASCADE');
    await database.query(`INSERT INTO "League" (id,slug,name,country,"updatedAt") VALUES ($1::uuid,'champions-league','Champions League','Europe',now())`, [ids.league]);
    await database.query(`INSERT INTO "Season" (id,"leagueId",name,"startsAt","endsAt","updatedAt") VALUES ($1::uuid,$2::uuid,'2020/2035','2020-01-01','2035-06-30',now())`, [ids.season, ids.league]);
    for (const [id, name, alias, short] of [[ids.arsenal, "Arsenal FC", "Arsenal", "Arsenal"], [ids.real, "Real Madrid CF", "Real Madrid", "Real Madrid"], [ids.city, "Manchester City FC", "Man City", "Man City"]]) {
      await database.query(`INSERT INTO "Club" (id,slug,name,"shortName",aliases,"updatedAt") VALUES ($1::uuid,$2,$3,$4,ARRAY[$5],now())`, [id, `club-${id}`, name, short, alias]);
      await database.query(`INSERT INTO "ClubSeason" (id,"clubId","seasonId","leagueId","updatedAt") VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,now())`, [randomUUID(), id, ids.season, ids.league]);
    }
    for (const [id, name, alias, club] of [[ids.mbappe, "Kylian Mbappé", "Mbappé", ids.real], [ids.saka, "Bukayo Saka", "Saka", ids.arsenal], [ids.haaland, "Erling Haaland", "Haaland", ids.city]]) {
      await database.query(`INSERT INTO "Player" (id,slug,name,aliases,"updatedAt") VALUES ($1::uuid,$2,$3,ARRAY[$4],now())`, [id, `player-${id}`, name, alias]);
      await database.query(`INSERT INTO "PlayerClub" (id,"playerId","clubId","startsAt","sourceUrl","updatedAt") VALUES ($1::uuid,$2::uuid,$3::uuid,'2020-01-01','https://example.test',now())`, [randomUUID(), id, club]);
    }
    for (const [id, slug, home, away, kickoff] of [[ids.match, "real-madrid-arsenal", ids.real, ids.arsenal, "2026-11-08T20:00:00Z"], [ids.other, "arsenal-man-city", ids.arsenal, ids.city, "2026-11-02T20:00:00Z"]]) {
      await database.query(`INSERT INTO "Match" (id,slug,provider,"externalId","leagueId","seasonId","homeClubId","awayClubId","kickoffAt",status,"homeScore","awayScore","updatedAt") VALUES ($1::uuid,$2,'FOOTBALL_DATA',$2,$3::uuid,$4::uuid,$5::uuid,$6::uuid,$7::timestamptz,'FINISHED',2,1,now())`, [id, slug, ids.league, ids.season, home, away, kickoff]);
    }
    for (const [id, handle, language] of [[ids.vi, "@vi-channel", "vi"], [ids.en, "@en-channel", "en"]]) {
      await database.query(`INSERT INTO "VideoSource" (id,"channelHandle",name,country,language,"sourceType","reviewReference","updatedAt") VALUES ($1::uuid,$2,$2,'VN',$3,'RIGHTS_HOLDER','https://example.test',now())`, [id, handle, language]);
    }
  });
  afterAll(async () => { await db.close(); });

  it("reads only recent Vietnamese match videos, keeps fit comments without commenters and links clubs and squad players", async () => {
    await insertVideo("vidVietnam1");
    await insertVideo("vidEnglish1", { source: ids.en, language: "en" });
    await insertVideo("vidTooOld01", { hoursAgo: 80 });
    await insertVideo("vidNoMatch1", { matchId: null });
    const api = fakeApi({ vidVietnam1: matchComments }, { vidVietnam1: 8214 });
    const report = await syncFanComments(database, api, { now });
    expect(api.calls).toEqual(["stats:1", "comments:vidVietnam1"]);
    expect(report).toMatchObject({ videos: 1, calls: 2, read: 8, kept: 5, stopped: null });
    const rows = await database.query<Record<string, unknown> & { externalId: string; clubIds: string[]; playerIds: string[] }>('SELECT * FROM "VideoComment" ORDER BY "externalId"');
    expect(rows.map((row) => row.externalId)).toEqual(["Ugz000000001", "Ugz000000002", "Ugz000000003", "Ugz000000004", "Ugz000000005"]);
    expect(Object.keys(rows[0]).sort()).toEqual(["clubIds", "externalId", "fetchedAt", "id", "likeCount", "playerIds", "publishedAt", "text", "videoId"]);
    expect(rows[1].playerIds.sort()).toEqual([ids.mbappe, ids.saka].sort());
    // Haaland plays for neither club: not counted. Arsenal is.
    expect(rows[3].playerIds).toEqual([]); expect(rows[3].clubIds).toEqual([ids.arsenal]);
    const [fetch] = await database.query<{ commentCount: number; readCount: number; keptCount: number; status: string }>('SELECT * FROM "VideoCommentFetch"');
    expect(fetch).toMatchObject({ commentCount: 8214, readCount: 8, keptCount: 5, status: "OK" });
  });

  it("reads a video again only after two hours and drops comments YouTube no longer lists", async () => {
    await insertVideo("vidVietnam1");
    await syncFanComments(database, fakeApi({ vidVietnam1: matchComments }), { now });
    const soon = fakeApi({ vidVietnam1: matchComments });
    expect(await syncFanComments(database, soon, { now: new Date(now.getTime() + hour) })).toMatchObject({ calls: 0 });
    expect(soon.calls).toEqual([]);
    const later = fakeApi({ vidVietnam1: [matchComments[0], c("Ugz000000009", "Bàn thắng của Mbappé đẹp nhất mùa giải", 10)] });
    await syncFanComments(database, later, { now: new Date(now.getTime() + 2 * hour) });
    expect(later.calls).toHaveLength(2);
    expect((await database.query<{ externalId: string }>('SELECT "externalId" FROM "VideoComment" ORDER BY "externalId"')).map((row) => row.externalId)).toEqual(["Ugz000000001", "Ugz000000009"]);
  });

  it("spends at most 20 calls a pass, newest unread videos first, and stops for the day at the daily allowance", async () => {
    for (let index = 0; index < 30; index++) await insertVideo(`vid${String(index).padStart(8, "0")}`, { hoursAgo: 1 + index });
    const api = fakeApi({});
    const report = await syncFanComments(database, api, { now });
    expect(report.calls).toBe(fanCommentRules.callsPerPass);
    expect(api.calls[0]).toBe("stats:19"); expect(api.calls[1]).toBe("comments:vid00000000"); expect(api.calls).toHaveLength(20);
    expect((await dueCommentVideos(database, now, 50)).map((video) => video.externalId)).toHaveLength(11);
    await database.query(`UPDATE "JobRun" SET checkpoint=jsonb_build_object('day','2026-11-09','calls',1499) WHERE "jobName"='fan-comments'`);
    const spent = fakeApi({});
    expect(await syncFanComments(database, spent, { now })).toMatchObject({ calls: 0, stopped: "DAILY_BUDGET" });
    expect(spent.calls).toEqual([]);
    // A new day starts a new allowance.
    expect((await syncFanComments(database, fakeApi({}), { now: new Date("2026-11-10T00:30:00Z") })).calls).toBeGreaterThan(0);
  });

  it("logs a refused key once with its code only, pauses for hours, and notes comments turned off on a video", async () => {
    await insertVideo("vidVietnam1"); await insertVideo("vidClosed01", { hoursAgo: 6 });
    const log = { warn: vi.fn() };
    const refused: FanCommentApi = { statistics: async () => { throw new CommentApiError("FORBIDDEN"); }, comments: async () => [] };
    expect(await syncFanComments(database, refused, { now, log })).toMatchObject({ stopped: "FORBIDDEN", calls: 1 });
    expect(log.warn).toHaveBeenCalledTimes(1); expect(log.warn).toHaveBeenCalledWith({ code: "FORBIDDEN" }, "fan_comments.api_refused");
    const paused = fakeApi({});
    expect(await syncFanComments(database, paused, { now: new Date(now.getTime() + 5 * hour), log })).toMatchObject({ stopped: "PAUSED", calls: 0 });
    expect(paused.calls).toEqual([]); expect(log.warn).toHaveBeenCalledTimes(1);
    const later = new Date(now.getTime() + 6 * hour + 60_000);
    const api = fakeApi({ vidVietnam1: matchComments, vidClosed01: new CommentApiError("DISABLED") });
    expect(await syncFanComments(database, api, { now: later, log })).toMatchObject({ videos: 1, closed: 1, stopped: null });
    expect((await database.query<{ status: string }>('SELECT status FROM "VideoCommentFetch" ORDER BY status')).map((row) => row.status)).toEqual(["DISABLED", "OK"]);
    // Comments turned off are asked again only a day later.
    expect((await dueCommentVideos(database, new Date(later.getTime() + 3 * hour), 10)).map((video) => video.externalId)).toEqual(["vidVietnam1"]);
    const quota: FanCommentApi = { statistics: async () => new Map(), comments: async () => { throw new CommentApiError("QUOTA"); } };
    expect(await syncFanComments(database, quota, { now: new Date(later.getTime() + 3 * hour), log })).toMatchObject({ stopped: "QUOTA" });
    expect(log.warn).toHaveBeenLastCalledWith({ code: "QUOTA" }, "fan_comments.api_refused");
  });

  it("deletes comments read more than 30 days ago", async () => {
    const video = await insertVideo("vidVietnam1");
    await database.query(`INSERT INTO "VideoComment" (id,"videoId","externalId",text,"likeCount","publishedAt","fetchedAt") VALUES ($1::uuid,$2::uuid,'UgzOLD000001','Bình luận cũ của tháng trước',3,$3::timestamptz,$3::timestamptz),($4::uuid,$2::uuid,'UgzNEW000001','Bình luận mới hôm qua',3,$5::timestamptz,$5::timestamptz)`,
      [randomUUID(), video, new Date(now.getTime() - 31 * 24 * hour), randomUUID(), new Date(now.getTime() - 24 * hour)]);
    await database.query(`INSERT INTO "VideoCommentFetch" ("videoId","fetchedAt",status) VALUES ($1::uuid,$2::timestamptz,'OK')`, [video, new Date(now.getTime() - 31 * 24 * hour)]);
    expect(await purgeOldFanComments(database, now)).toBe(1);
    expect((await database.query<{ externalId: string }>('SELECT "externalId" FROM "VideoComment"')).map((row) => row.externalId)).toEqual(["UgzNEW000001"]);
    expect(await database.query('SELECT * FROM "VideoCommentFetch"')).toEqual([]);
  });

  it("sums up a match, a club and the homepage from the stored comments only", async () => {
    await insertVideo("vidVietnam1"); await insertVideo("vidVietnam2", { hoursAgo: 4 });
    await insertVideo("vidOther001", { matchId: ids.other, hoursAgo: 2 });
    const second = [c("Ugz000000011", "Mbappé ghi bàn đẹp quá, Real Madrid thắng xứng đáng", 60), c("Ugz000000012", "Mourinho đọc trận quá hay", 15)];
    const thin = [c("Ugz000000021", "Saka đá quá hay trận này", 900)];
    await syncFanComments(database, fakeApi({ vidVietnam1: matchComments, vidVietnam2: second, vidOther001: thin }, { vidVietnam1: 8000, vidVietnam2: 214, vidOther001: 50 }), { now });
    const pulse = await fanPulseForMatch(database, ids.match, now);
    expect(pulse).toMatchObject({ total: 8214, read: 10, kept: 7, videos: 2, videoUrl: "https://www.youtube.com/watch?v=vidVietnam1", match: { slug: "real-madrid-arsenal", homeScore: 2, awayScore: 1, home: { name: "Real Madrid" }, away: { name: "Arsenal" } } });
    expect(pulse!.chips.map((chip) => [chip.label, chip.count])).toEqual([["Kylian Mbappé", 3], ["Trọng tài & VAR", 2]]);
    expect(pulse!.chips.some((chip) => chip.kind === "club")).toBe(false);
    expect(pulse!.quotes.map((quote) => [quote.text, quote.likeCount])).toEqual([["Mbappé quá đỉnh, trọng tài bắt penalty sai rõ ràng", 300], ["Mbappe hay nhất trận, Saka mờ nhạt", 120], ["Arteta cần thay đổi chiến thuật ngay, hàng thủ quá tệ", 80]]);
    expect(pulse!.quotes[0]).toMatchObject({ url: "https://www.youtube.com/watch?v=vidVietnam1&lc=Ugz000000001", match: null });
    const club = await fanPulseForClub(database, ids.arsenal, now);
    expect(club).toMatchObject({ kept: 8, total: 8264 });
    expect(club!.quotes[0]).toMatchObject({ text: "Saka đá quá hay trận này", match: "Arsenal 2–1 Man City" });
    expect(club!.chips.find((chip) => chip.label === "Arsenal")).toBeUndefined();
    expect(club!.chips.find((chip) => chip.label === "Bukayo Saka")?.count).toBe(2);
    // The homepage needs five kept comments per match: the thin match stays off.
    expect((await hotFanPulses(database, now)).map((item) => item.match.slug)).toEqual(["real-madrid-arsenal"]);
    expect(await hotFanPulses(database, new Date(now.getTime() + 37 * hour))).toEqual([]);
    expect(await fanPulseForMatch(database, randomUUID(), now)).toBeNull();
  });

  it("counts fan comments for what is hot: per match, and per club or player named in the last day", async () => {
    const video = await insertVideo("vidVietnam1");
    const rows = Array.from({ length: 15 }, (_, index) => [randomUUID(), video, `UgzHOT${String(index).padStart(6, "0")}`, `Arsenal hôm nay chơi quá hay số ${index}`, new Date(now.getTime() - 2 * hour)]);
    for (const [id, videoId, ext, text, at] of rows) await database.query(`INSERT INTO "VideoComment" (id,"videoId","externalId",text,"publishedAt","fetchedAt","clubIds","playerIds") VALUES ($1::uuid,$2::uuid,$3,$4,$5::timestamptz,$5::timestamptz,ARRAY[$6::uuid],ARRAY[$7::uuid])`, [id, videoId, ext, text, at, ids.arsenal, ids.saka]);
    await database.query(`UPDATE "Match" SET "kickoffAt"=$2::timestamptz WHERE id=$1::uuid`, [ids.match, new Date(now.getTime() - 8 * hour)]);
    const hot = await hotNow(database, now);
    expect(hot.matches).toEqual([expect.objectContaining({ slug: "real-madrid-arsenal", home: "Real Madrid", away: "Arsenal", comments: 15, threads: 15 })]);
    // Fifteen comments weigh as three stories: just hot.
    expect(hot.topics.map((topic) => [topic.kind, topic.name, topic.comments])).toEqual([["club", "Arsenal", 15], ["player", "Bukayo Saka", 15]]);
    // A day later the comments are no longer from the last day.
    expect((await hotNow(database, new Date(now.getTime() + 24 * hour))).topics).toEqual([]);
  });
});
