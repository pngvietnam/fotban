import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SyncDatabase } from "../lib/sync-database";
import { StorySaveService } from "../services/story-saves";
import { accountRequest } from "../services/account-http";

describe("saved stories and guest merge (SQL)", () => {
  let db: PGlite; let database: SyncDatabase;
  const ids = { source: randomUUID(), a1: randomUUID(), a2: randomUUID(), draft: randomUUID(), u1: randomUUID(), u2: randomUUID() };
  const slug = (id: string) => `bao-${id}`;
  beforeAll(async () => {
    db = new PGlite();
    for (const entry of readdirSync("prisma/migrations", { withFileTypes: true }).filter((entry) => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) await db.exec(readFileSync(`prisma/migrations/${entry.name}/migration.sql`, "utf8"));
    database = { query: async <T,>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows, transaction: (work) => db.transaction((tx) => work({ query: async <T,>(sql: string, params: unknown[] = []) => (await tx.query<T>(sql, params)).rows })) };
    await database.query(`INSERT INTO "NewsSource" (id,name,domain,type,"accessPolicy","updatedAt") VALUES ($1::uuid,'Báo thử','fixture.example.test','PUBLICATION','test',now())`, [ids.source]);
    for (const [id, status] of [[ids.a1, "PUBLISHED"], [ids.a2, "PUBLISHED"], [ids.draft, "HELD"]]) {
      await database.query(`INSERT INTO "Article" (id,slug,"sourceId","sourceUrl","canonicalUrl","titleOriginal",language,"updatedAt") VALUES ($1::uuid,$1::text,$2::uuid,$3,$3,'Tin ' || left($1::text,4),'vi',now())`, [id, ids.source, `https://fixture.example.test/${id}`]);
      await database.query(`INSERT INTO "FeedCard" ("articleId",status,"storyType",label,certainty,"updatedAt") VALUES ($1::uuid,$2,'MATCH','MEDIA','REPORTED',now())`, [id, status]);
    }
    for (const id of [ids.u1, ids.u2]) await database.query(`INSERT INTO "User" (id,"authSubject",email,"displayName","updatedAt") VALUES ($1::uuid,$1::text,$2,'Reader',now())`, [id, `${id}@example.test`]);
  }, 60000);
  beforeEach(async () => { await database.query('DELETE FROM "StorySave"'); await database.query('DELETE FROM "StoryLike"'); });
  afterAll(async () => { await db.close(); });
  const as = (id: string | null) => new StorySaveService(database, async () => id ? { id } : null);

  it("needs an account, saves only published stories and lists them newest first with the publisher", async () => {
    await expect(as(null).list()).rejects.toMatchObject({ status: 401 });
    await expect(as(ids.u1).set({ slug: slug(ids.draft) }, true)).rejects.toMatchObject({ status: 404 });
    await expect(as(ids.u1).set({ slug: "not-a-story" }, true)).rejects.toMatchObject({ status: 400 });
    await as(ids.u1).set({ slug: slug(ids.a1) }, true); await as(ids.u1).set({ slug: slug(ids.a1) }, true); await as(ids.u1).set({ slug: slug(ids.a2) }, true);
    const list = await as(ids.u1).list();
    expect(list.map((item) => item.slug)).toEqual([slug(ids.a2), slug(ids.a1)]);
    expect(list[0]).toMatchObject({ publisher: "Báo thử" });
    expect(await as(ids.u2).list()).toEqual([]);
    await as(ids.u1).set({ slug: slug(ids.a2) }, false);
    expect((await as(ids.u1).list()).map((item) => item.slug)).toEqual([slug(ids.a1)]);
  });
  it("merges a guest's saved stories and likes once, skipping unpublished or unknown ones", async () => {
    const guest = { saved: [slug(ids.a1), slug(ids.draft), slug(randomUUID()), "junk"], liked: [ids.a2, ids.draft, randomUUID()] };
    expect(await as(ids.u1).merge(guest)).toEqual({ saved: 1, liked: 1 });
    expect(await as(ids.u1).merge(guest)).toEqual({ saved: 0, liked: 0 });
    expect((await as(ids.u1).list()).map((item) => item.slug)).toEqual([slug(ids.a1)]);
    expect((await database.query<{ articleId: string }>('SELECT "articleId" FROM "StoryLike" WHERE "userId"=$1::uuid', [ids.u1])).map((row) => row.articleId)).toEqual([ids.a2]);
    await expect(as(ids.u1).merge({ saved: "x", liked: [] })).rejects.toMatchObject({ status: 400 });
  });
  it("is served by /api/saved and /api/sync for same-origin requests only", async () => {
    const deps = { database, session: async () => ({ id: ids.u1 }), appUrl: "https://fotban.test" };
    const post = (path: string, origin: string, body: unknown) => accountRequest(new Request(`https://fotban.test${path}`, { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) }), deps);
    expect((await post("/api/saved", "https://evil.test", { slug: slug(ids.a1) })).status).toBe(403);
    expect((await post("/api/saved", "https://fotban.test", { slug: slug(ids.a1) })).status).toBe(200);
    expect((await post("/api/sync", "https://fotban.test", { saved: [slug(ids.a2)], liked: [] })).status).toBe(200);
    const listed = await accountRequest(new Request("https://fotban.test/api/saved"), deps);
    expect(((await listed.json()) as { saved: unknown[] }).saved).toHaveLength(2);
  });
});
