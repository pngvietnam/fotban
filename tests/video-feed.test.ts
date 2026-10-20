import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SyncDatabase } from "../lib/sync-database";
import { YouTubeFeedReader, type ChannelFeed } from "../providers/youtube/rss";
import { VideoFeedSync } from "../services/video-feed-sync";
import { VideoStore } from "../services/video-store";

const fpt = "UC4LvrpNXujjbGOS4RDvr41g";
const feedXml = (channel = fpt, author = "FPT Bóng Đá") => `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/" xmlns="http://www.w3.org/2005/Atom">
 <yt:channelId>${channel.slice(2)}</yt:channelId><title>${author}</title>
 <author><name>${author}</name><uri>https://www.youtube.com/channel/${channel}</uri></author>
 <entry><id>yt:video:2cDvQymAgaE</id><yt:videoId>2cDvQymAgaE</yt:videoId><yt:channelId>${channel.slice(2)}</yt:channelId>
  <title>HIGHLIGHTS: TOTTENHAM - COVENTRY | MÃN NHÃN &amp; ĐẦU TAY | NGOẠI HẠNG ANH 26/27</title><published>2026-10-20T01:00:00+00:00</published>
  <media:group><media:description>Ngoại hạng Anh 2026/27</media:description></media:group></entry>
 <entry><id>yt:video:abcdefghijk</id><yt:videoId>abcdefghijk</yt:videoId><yt:channelId>${channel.slice(2)}</yt:channelId>
  <title>Ben Davies &quot;bắn xa&quot; vừa nhanh vừa chuẩn</title><published>2026-10-19T21:05:00+00:00</published></entry>
</feed>`;
const respond = (status: number, body = "") => new Response(body, { status, headers: { "content-type": "text/xml" } });

describe("YouTubeFeedReader", () => {
  it("reads the public feed, restores the UC prefix and decodes titles", async () => {
    const feed = await new YouTubeFeedReader({ fetch: (async () => respond(200, feedXml())) as unknown as typeof fetch }).feed(fpt);
    expect(feed.author).toBe("FPT Bóng Đá");
    expect(feed.videos.map((video) => [video.externalId, video.channelId, video.availability, video.vietnamAvailability])).toEqual([["2cDvQymAgaE", fpt, "AVAILABLE", "UNKNOWN"], ["abcdefghijk", fpt, "AVAILABLE", "UNKNOWN"]]);
    expect(feed.videos[0].title).toContain("MÃN NHÃN & ĐẦU TAY");
    expect(feed.videos[1].title).toBe("Ben Davies \"bắn xa\" vừa nhanh vừa chuẩn");
  });
  it("retries the feed's occasional 404/5xx, sends no cache headers, and rejects another channel's feed", async () => {
    const seen: RequestInit[] = []; let calls = 0;
    const flaky = (async (_url: string, init: RequestInit) => { seen.push(init); calls++; return calls < 3 ? respond(calls === 1 ? 404 : 500) : respond(200, feedXml()); }) as unknown as typeof fetch;
    expect((await new YouTubeFeedReader({ fetch: flaky, sleep: async () => {} }).feed(fpt)).videos).toHaveLength(2);
    expect(seen.every((init) => init.cache === undefined && !JSON.stringify(init.headers ?? {}).toLowerCase().includes("cache"))).toBe(true);
    await expect(new YouTubeFeedReader({ fetch: (async () => respond(404)) as unknown as typeof fetch, sleep: async () => {} }).feed(fpt)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(new YouTubeFeedReader({ fetch: (async () => respond(200, feedXml("UCiWyQp2HgKX2-WQUq11V8FA"))) as unknown as typeof fetch }).feed(fpt)).rejects.toMatchObject({ code: "MALFORMED" });
  });
  it("reads oEmbed as embeddable, embedding turned off (still on YouTube), or gone", async () => {
    const reader = (status: number, author = "FPT Bóng Đá") => new YouTubeFeedReader({ fetch: (async () => new Response(JSON.stringify({ author_name: author }), { status })) as unknown as typeof fetch });
    expect(await reader(200).embedStatus("2cDvQymAgaE", "FPT Bóng Đá")).toBe("EMBEDDABLE");
    expect(await reader(401).embedStatus("2cDvQymAgaE", "FPT Bóng Đá")).toBe("NOT_EMBEDDABLE");
    expect(await reader(200, "Someone Else").embedStatus("2cDvQymAgaE", "FPT Bóng Đá")).toBe("GONE");
    expect(await reader(404).embedStatus("2cDvQymAgaE", "FPT Bóng Đá")).toBe("GONE");
  });
});

describe("VideoFeedSync (SQL)", () => {
  let db: PGlite; let database: SyncDatabase;
  const ids = { pl: randomUUID(), laliga: randomUUID(), cl: randomUUID(), season: randomUUID(), spurs: randomUUID(), coventry: randomUUID(), match: randomUUID() };
  const now = new Date("2026-10-20T06:00:00Z");
  beforeAll(async () => {
    db = new PGlite();
    for (const entry of readdirSync("prisma/migrations", { withFileTypes: true }).filter((entry) => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) await db.exec(readFileSync(`prisma/migrations/${entry.name}/migration.sql`, "utf8"));
    database = {
      query: async <T>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows,
      transaction: (work) => db.transaction((tx) => work({ query: async <T>(sql: string, params: unknown[] = []) => (await tx.query<T>(sql, params)).rows })),
    };
  }, 60000);
  beforeEach(async () => {
    await db.exec('TRUNCATE "Video","VideoSyncState","VideoSourceCompetition","VideoSource","JobRun","Match","ClubSeason","Season","Club","League" CASCADE');
    for (const [id, slug, name] of [[ids.pl, "premier-league", "Premier League"], [ids.laliga, "la-liga", "La Liga"], [ids.cl, "champions-league", "UEFA Champions League"]]) await database.query(`INSERT INTO "League" (id,slug,name,country,"updatedAt") VALUES ($1::uuid,$2,$3,'X',now())`, [id, slug, name]);
    await database.query(`INSERT INTO "Season" (id,"leagueId",name,"startsAt","endsAt","updatedAt") VALUES ($1::uuid,$2::uuid,'2026/2027','2026-08-01','2027-06-30',now())`, [ids.season, ids.pl]);
    for (const [id, name, short, aliases] of [[ids.spurs, "Tottenham Hotspur FC", "Tottenham", ["Tottenham", "Spurs"]], [ids.coventry, "Coventry City FC", "Coventry City", ["Coventry"]]] as const) await database.query(`INSERT INTO "Club" (id,slug,name,"shortName",aliases,"updatedAt") VALUES ($1::uuid,$2,$3,$4,$5::text[],now())`, [id, `club-${id}`, name, short, aliases]);
    await database.query(`INSERT INTO "Match" (id,slug,provider,"externalId","leagueId","seasonId","homeClubId","awayClubId","kickoffAt",status,"homeScore","awayScore","updatedAt") VALUES ($1::uuid,'m1','FOOTBALL_DATA','1',$2::uuid,$3::uuid,$4::uuid,$5::uuid,'2026-10-19T19:00:00Z','FINISHED',3,1,now())`, [ids.match, ids.pl, ids.season, ids.spurs, ids.coventry]);
  });
  afterAll(async () => { await db.close(); });
  const reader = (feeds: Record<string, ChannelFeed | Error>, embed: "EMBEDDABLE" | "NOT_EMBEDDABLE" | "GONE" = "EMBEDDABLE") => ({
    feed: async (channelId: string) => { const feed = feeds[channelId]; if (!feed || feed instanceof Error) throw feed ?? new Error("no feed"); return feed; },
    embedStatus: async () => embed,
  });
  const realFeed = async () => new YouTubeFeedReader({ fetch: (async () => respond(200, feedXml())) as unknown as typeof fetch }).feed(fpt);

  it("registers the three reviewed channels and stores only the match highlight from the feed", async () => {
    const report = await new VideoFeedSync(reader({ [fpt]: await realFeed() }), new VideoStore(database)).run(now);
    expect(report).toMatchObject({ sources: 3, feeds: 1, matches: 1, stored: 1, primary: 1 });
    const sources = await database.query<{ name: string; channelId: string | null }>(`SELECT name,"channelId" FROM "VideoSource" ORDER BY name`);
    expect(sources.map((source) => source.name)).toEqual(["FPT Bóng Đá", "SCTV Thể Thao Official", "TV360 Thể Thao"]);
    expect(sources.find((source) => source.name === "FPT Bóng Đá")?.channelId).toBe(fpt);
    const videos = await database.query<{ externalId: string; selectedAsPrimary: boolean; videoType: string; embedAllowed: boolean }>(`SELECT "externalId","selectedAsPrimary","videoType","embedAllowed" FROM "Video"`);
    expect(videos).toEqual([{ externalId: "2cDvQymAgaE", selectedAsPrimary: true, videoType: "HIGHLIGHT", embedAllowed: true }]);
  });
  it("skips a feed whose author is not the reviewed channel", async () => {
    const feed = { ...(await realFeed()), author: "Kênh Lạ" };
    const report = await new VideoFeedSync(reader({ [fpt]: feed }), new VideoStore(database)).run(now);
    expect(report).toMatchObject({ feeds: 0, stored: 0 });
    expect(await database.query(`SELECT id FROM "Video"`)).toHaveLength(0);
  });
  it("keeps a highlight whose owner turned embedding off as a link only", async () => {
    await new VideoFeedSync(reader({ [fpt]: await realFeed() }, "NOT_EMBEDDABLE"), new VideoStore(database)).run(now);
    expect((await database.query<{ embedAllowed: boolean; selectedAsPrimary: boolean }>(`SELECT "embedAllowed","selectedAsPrimary" FROM "Video"`))[0]).toEqual({ embedAllowed: false, selectedAsPrimary: true });
  });
  it("re-checks stored links daily and drops one that is no longer public", async () => {
    await new VideoFeedSync(reader({ [fpt]: await realFeed() }), new VideoStore(database)).run(now);
    const later = new Date(now.getTime() + 26 * 3600_000);
    const report = await new VideoFeedSync(reader({}, "GONE"), new VideoStore(database)).run(later);
    expect(report.removed).toBe(1);
    expect((await database.query<{ selectedAsPrimary: boolean; validationStatus: string }>(`SELECT "selectedAsPrimary","validationStatus" FROM "Video"`))[0]).toEqual({ selectedAsPrimary: false, validationStatus: "UNAVAILABLE" });
  });
});

