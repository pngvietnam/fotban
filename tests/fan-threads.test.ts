import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SyncDatabase } from "../lib/sync-database";
import { crudeWords, fanKind, notTalk, parseRedditAtom, parseVozRss, sensitiveEnglish } from "../lib/fan-feeds";
import { hotNow } from "../services/hot-now";
import { fanThreadsForClub, fanThreadsForMatch, syncFanThreads, trendingFanThreads, type FanReader } from "../services/fan-threads";

const voz = (items: { title: string; id: string; at: string; comments: number }[]) => `<?xml version="1.0"?><rss xmlns:slash="http://purl.org/rss/1.0/modules/slash/" version="2.0"><channel><title>Thể dục thể thao</title>${items.map((item) => `<item><title>${item.title}</title><pubDate>${item.at}</pubDate><link>https://voz.vn/t/x.${item.id}/?utm_source=rss&amp;utm_medium=rss</link><guid isPermaLink="false">${item.id}</guid><dc:creator xmlns:dc="http://purl.org/dc/elements/1.1/">someone</dc:creator><content:encoded xmlns:content="http://purl.org/rss/1.0/modules/content/"><![CDATA[<div>post text that must never be stored</div>]]></content:encoded><slash:comments>${item.comments}</slash:comments></item>`).join("")}</channel></rss>`;
const reddit = (items: { title: string; id: string; at: string }[]) => `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">${items.map((item) => `<entry><id>t3_${item.id}</id><title>${item.title}</title><link href="https://www.reddit.com/r/soccer/comments/${item.id}/x/?ref=rss"/><updated>${item.at}</updated><author><name>/u/someone</name></author><content type="html">&lt;p&gt;text&lt;/p&gt;</content></entry>`).join("")}</feed>`;

describe("community feeds", () => {
  it("reads Voz threads with their reply counts and drops tracking parameters, authors and post text", () => {
    const [item] = parseVozRss(voz([{ title: "Arsenal FC Official VOZ: Mùa giải 2026-2027", id: "1010", at: "Thu, 22 Oct 2026 04:39:01 +0000", comments: 32082 }]));
    expect(item).toEqual({ source: "VOZ", externalId: "1010", url: "https://voz.vn/t/x.1010/", title: "Arsenal FC Official VOZ: Mùa giải 2026-2027", community: "Voz · Thể dục thể thao", replies: 32082, lastActivityAt: "2026-10-22T04:39:01.000Z" });
    expect(JSON.stringify(item)).not.toContain("someone"); expect(JSON.stringify(item)).not.toContain("post text");
  });
  it("reads Reddit posts and rejects links to other hosts", () => {
    const xml = reddit([{ title: "Post Match Thread: Como 4 - 1 Manchester United", id: "1abc2d", at: "2026-10-21T21:00:00+00:00" }]).replace("</feed>", '<entry><id>t3_zzz999</id><title>Other</title><link href="https://evil.example/x"/><updated>2026-10-21T21:00:00+00:00</updated></entry></feed>');
    const items = parseRedditAtom(xml);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ source: "REDDIT", externalId: "1abc2d", url: "https://www.reddit.com/r/soccer/comments/1abc2d/x/", replies: null });
  });
  it("classifies match threads and club rooms, drops score ticks and crude titles", () => {
    expect(fanKind({ source: "REDDIT", title: "Post Match Thread: Como 4 - 1 Manchester United | UEFA Champions League" }, 2)).toBe("MATCH");
    expect(fanKind({ source: "VOZ", title: "Arsenal FC Official VOZ: Mùa giải 2026-2027" }, 1)).toBe("CLUB");
    expect(fanKind({ source: "VOZ", title: "Ballon d'Or 2026 gọi tên ai?" }, 0)).toBe("TOPIC");
    expect(notTalk.test("Como [4] - 0 Manchester Utd - Jacobo Ramón 76'")).toBe(true);
    expect(notTalk.test("Daily Discussion | October 21, 2026")).toBe(true);
    expect(notTalk.test("Harry Kane is one game away from matching Ronaldo's record")).toBe(false);
    expect(sensitiveEnglish.test("[Bild] Kimmich will not be in the squad due to a death in his close family")).toBe(true);
    expect(sensitiveEnglish.test("Kane scores twice as Bayern beat Arsenal")).toBe(false);
    expect(crudeWords.test("thằng này vcl thật")).toBe(true); expect(crudeWords.test("Arsenal thắng đậm")).toBe(false);
  });
});

describe("fan threads (SQL)", () => {
  let db: PGlite; let database: SyncDatabase;
  const ids = { league: randomUUID(), season: randomUUID(), arsenal: randomUUID(), bayern: randomUUID(), match: randomUUID() };
  const now = new Date("2026-10-22T05:00:00Z");
  const reader = (v: string | null, r: string | null): FanReader => ({ voz: async () => v, reddit: async () => r });
  beforeAll(async () => {
    db = new PGlite();
    for (const entry of readdirSync("prisma/migrations", { withFileTypes: true }).filter((entry) => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) await db.exec(readFileSync(`prisma/migrations/${entry.name}/migration.sql`, "utf8"));
    database = {
      query: async <T>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows,
      transaction: (work) => db.transaction((tx) => work({ query: async <T>(sql: string, params: unknown[] = []) => (await tx.query<T>(sql, params)).rows })),
    };
  }, 60000);
  beforeEach(async () => {
    await db.exec('TRUNCATE "FanThread","Match","ClubSeason","Season","Club","League" CASCADE');
    await database.query('INSERT INTO "League" (id,slug,name,country,"updatedAt") VALUES ($1::uuid,\'champions-league\',\'Champions League\',\'Europe\',now())', [ids.league]);
    await database.query('INSERT INTO "Season" (id,"leagueId",name,"startsAt","endsAt","updatedAt") VALUES ($1::uuid,$2::uuid,\'2026/2027\',\'2026-08-01\',\'2027-06-30\',now())', [ids.season, ids.league]);
    for (const [id, name, alias] of [[ids.arsenal, "Arsenal FC", "Arsenal"], [ids.bayern, "FC Bayern München", "Bayern Munich"]]) {
      await database.query('INSERT INTO "Club" (id,slug,name,aliases,"updatedAt") VALUES ($1::uuid,$2,$3,ARRAY[$4],now())', [id, `club-${id}`, name, alias]);
      await database.query('INSERT INTO "ClubSeason" (id,"clubId","seasonId","leagueId","updatedAt") VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,now())', [randomUUID(), id, ids.season, ids.league]);
    }
    await database.query('INSERT INTO "Match" (id,slug,provider,"externalId","leagueId","seasonId","homeClubId","awayClubId","kickoffAt",status,"updatedAt") VALUES ($1::uuid,\'match-test\',\'FOOTBALL_DATA\',\'1\',$2::uuid,$3::uuid,$4::uuid,$5::uuid,\'2026-10-21T19:00:00Z\',\'FINISHED\',now())', [ids.match, ids.league, ids.season, ids.bayern, ids.arsenal]);
  });
  afterAll(async () => { await db.close(); });

  it("keeps football threads, links clubs and the match, holds crude titles and skips score ticks and other sports", async () => {
    const v = voz([
      { title: "Arsenal FC Official VOZ: Mùa giải 2026-2027", id: "1", at: "Thu, 22 Oct 2026 04:30:00 +0000", comments: 1000 },
      { title: "MotoGP - Cathedral of Speed", id: "2", at: "Thu, 22 Oct 2026 04:30:00 +0000", comments: 50 },
      { title: "Arsenal vcl thật sự", id: "3", at: "Thu, 22 Oct 2026 04:30:00 +0000", comments: 5 },
    ]);
    const r = reddit([
      { title: "Post Match Thread: Bayern Munich 2 - 2 Arsenal | UEFA Champions League", id: "abc123", at: "2026-10-21T21:00:00+00:00" },
      { title: "Bayern Munich [2] - 1 Arsenal - Harry Kane penalty 61'", id: "abc124", at: "2026-10-21T20:30:00+00:00" },
    ]);
    expect(await syncFanThreads(database, reader(v, r), now)).toMatchObject({ seen: 5, kept: 3 });
    const rows = await database.query<{ title: string; kind: string; held: boolean; matchId: string | null; clubIds: string[] }>('SELECT title,kind,held,"matchId","clubIds" FROM "FanThread" ORDER BY title');
    expect(rows.map((row) => row.title)).toEqual(["Arsenal FC Official VOZ: Mùa giải 2026-2027", "Arsenal vcl thật sự", "Post Match Thread: Bayern Munich 2 - 2 Arsenal | UEFA Champions League"]);
    expect(rows.find((row) => row.kind === "CLUB")?.clubIds).toEqual([ids.arsenal]);
    expect(rows.find((row) => row.kind === "MATCH")).toMatchObject({ matchId: ids.match });
    expect(rows.find((row) => row.title.includes("vcl"))?.held).toBe(true);
  });

  it("measures how lively a thread is from hourly readings and serves club, match and trending lists", async () => {
    const thread = (comments: number, at = "Thu, 22 Oct 2026 04:30:00 +0000") => voz([{ title: "Arsenal FC Official VOZ: Mùa giải 2026-2027", id: "1", at, comments }]);
    await syncFanThreads(database, reader(thread(1000), null), new Date("2026-10-21T04:00:00Z"));
    await syncFanThreads(database, reader(thread(1400), null), now);
    const trending = await trendingFanThreads(database, now);
    expect(trending.voz[0]).toMatchObject({ replies: 1400, delta: 400, deltaHours: 24 });
    expect(trending.reddit).toEqual([]);
    const club = await fanThreadsForClub(database, ids.arsenal, now);
    expect(club.map((item) => item.kind)).toEqual(["CLUB"]);
    await syncFanThreads(database, reader(null, reddit([{ title: "Post Match Thread: Bayern Munich 2 - 2 Arsenal", id: "abc123", at: "2026-10-21T21:00:00+00:00" }])), now);
    const forMatch = await fanThreadsForMatch(database, ids.match, ids.bayern, ids.arsenal, now);
    expect(forMatch.map((item) => item.source)).toContain("REDDIT");
    expect(await fanThreadsForClub(database, ids.bayern, now)).toHaveLength(1);
  });

  it("calls a day hot only from counted stories and threads, and a match only when fans opened threads about it", async () => {
    await database.query('UPDATE "Match" SET "homeScore"=2,"awayScore"=2,"kickoffAt"=$2::timestamptz WHERE id=$1::uuid', [ids.match, new Date(now.getTime() - 8 * 3_600_000)]);
    const r = reddit([
      { title: "Post Match Thread: Bayern Munich 2 - 2 Arsenal | UEFA Champions League", id: "abc123", at: "2026-10-22T02:00:00+00:00" },
      { title: "Arsenal fans react to the draw in Munich", id: "abc125", at: "2026-10-22T03:00:00+00:00" },
      { title: "Arsenal captain speaks after the draw", id: "abc126", at: "2026-10-22T03:30:00+00:00" },
    ]);
    await syncFanThreads(database, reader(null, r), now);
    const hot = await hotNow(database, now);
    expect(hot.matches).toEqual([expect.objectContaining({ slug: "match-test", home: "FC Bayern München", away: "Arsenal FC", homeScore: 2, awayScore: 2, threads: 1 })]);
    expect(hot.topics.map((topic) => [topic.name, topic.threads])).toEqual([["Arsenal FC", 3]]);
    // Fewer than three mentions in a day is not hot.
    expect((await hotNow(database, new Date(now.getTime() + 3 * 24 * 3_600_000))).topics).toEqual([]);
  });

  it("never stores post text, user names or tracking parameters", async () => {
    await syncFanThreads(database, reader(voz([{ title: "Arsenal FC Official VOZ", id: "1", at: "Thu, 22 Oct 2026 04:30:00 +0000", comments: 10 }]), null), now);
    const [row] = await database.query<Record<string, unknown>>('SELECT * FROM "FanThread"');
    expect(JSON.stringify(row)).not.toMatch(/someone|post text|utm_/);
  });
});
