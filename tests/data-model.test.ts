import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

// Executes the exact checked-in migration in disposable PostgreSQL WASM.
// No test fixtures can reach DATABASE_URL or the application database.
describe("database integrity", () => {
  let db: PGlite;
  beforeAll(async () => {
    db = new PGlite();
    for (const entry of readdirSync("prisma/migrations", { withFileTypes: true }).filter((entry) => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
      await db.exec(readFileSync(`prisma/migrations/${entry.name}/migration.sql`, "utf8"));
    }
  }, 30000);
  beforeEach(async () => { await db.exec("BEGIN"); });
  afterEach(async () => { await db.exec("ROLLBACK"); });
  afterAll(async () => { await db.close(); });

  async function insert(table: string, fields: Record<string, unknown> = {}) {
    const data = { id: randomUUID(), updatedAt: new Date(), ...fields };
    const keys = Object.keys(data);
    await db.query(`INSERT INTO "${table}" (${keys.map((key) => `"${key}"`).join(",")}) VALUES (${keys.map((_, index) => `$${index + 1}`).join(",")})`, Object.values(data));
    return data.id;
  }
  async function league() {
    return insert("League", { slug: randomUUID(), name: "Test league", country: "Test" });
  }
  async function article(sourceId?: string) {
    const source = sourceId ?? await insert("NewsSource", { name: "Test source", domain: randomUUID(), type: "RSS", accessPolicy: "test-only" });
    return insert("Article", { sourceId: source, slug: randomUUID(), sourceUrl: `https://example.test/${randomUUID()}`, canonicalUrl: `https://example.test/${randomUUID()}`, titleOriginal: "Test article", language: "en", publishedAt: new Date() });
  }
  async function match() {
    const leagueId = await league();
    const seasonId = await insert("Season", { leagueId, name: "test-season" });
    const homeClubId = await insert("Club", { slug: randomUUID(), name: "Home" });
    const awayClubId = await insert("Club", { slug: randomUUID(), name: "Away" });
    const matchId = await insert("Match", { slug: randomUUID(), provider: "test-provider", externalId: randomUUID(), leagueId, seasonId, homeClubId, awayClubId, kickoffAt: new Date() });
    return { matchId, homeClubId, awayClubId, leagueId, seasonId };
  }
  async function evidence() {
    const articleId = await article();
    const id = await insert("ClaimEvidence", { articleId, sourceArticleId: articleId, claim: "Test claim", locator: "test paragraph" });
    return { articleId, evidenceId: id };
  }
  async function brief() {
    const briefId = await insert("DailyBrief", { date: "2026-10-16" });
    const revisionId = await insert("BriefRevision", { briefId, revision: 1, windowStart: "2026-10-15T00:00:00Z", windowEnd: "2026-10-16T00:00:00Z", cutoffAt: "2026-10-16T00:00:00Z", inputHash: "test-hash", rankingVersion: "test-v1" });
    return { briefId, revisionId };
  }
  async function reject(sql: string, params: unknown[], code: string) {
    await expect(db.query(sql, params)).rejects.toMatchObject({ code });
  }

  it("enforces one Brief identity per date and locale", async () => {
    await brief();
    await expect(insert("DailyBrief", { date: "2026-10-16" })).rejects.toMatchObject({ code: "23505" });
  });
  it("rejects duplicate canonical URLs across different source URLs", async () => {
    const id = await article();
    const other = await article();
    await reject('UPDATE "Article" SET "canonicalUrl" = (SELECT "canonicalUrl" FROM "Article" WHERE id = $1) WHERE id = $2', [id, other], "23505");
  });
  it("rejects duplicate raw source URLs", async () => {
    const id = await article();
    const other = await article();
    await reject('UPDATE "Article" SET "sourceUrl" = (SELECT "sourceUrl" FROM "Article" WHERE id = $1) WHERE id = $2', [id, other], "23505");
  });
  it("enforces provider/external match identity", async () => {
    const a = await match();
    const b = await match();
    await reject('UPDATE "Match" SET "externalId" = (SELECT "externalId" FROM "Match" WHERE id = $1) WHERE id = $2', [a.matchId, b.matchId], "23505");
  });
  it("enforces exactly one entity target", async () => {
    await expect(insert("ArticleEntity", { articleId: await article() })).rejects.toMatchObject({ code: "23514" });
  });
  it("keeps article entities unique per target", async () => {
    const data = { articleId: await article(), leagueId: await league() };
    await insert("ArticleEntity", data);
    await expect(insert("ArticleEntity", data)).rejects.toMatchObject({ code: "23505" });
  });
  it("rejects duplicate entity external IDs in the same provider namespace", async () => {
    const data = { provider: "test", entityType: "LEAGUE", externalId: "same-id" };
    await insert("ExternalIdentity", { ...data, leagueId: await league() });
    await expect(insert("ExternalIdentity", { ...data, leagueId: await league() })).rejects.toMatchObject({ code: "23505" });
  });
  it("rejects duplicate relational follows", async () => {
    const userId = await insert("User", { authProvider: "test", authSubject: randomUUID() });
    const preferenceId = await insert("UserPreference", { userId });
    const leagueId = await league();
    await insert("UserFollow", { preferenceId, leagueId });
    await expect(insert("UserFollow", { preferenceId, leagueId })).rejects.toMatchObject({ code: "23505" });
  });
  it("rejects follows targeting multiple entity types", async () => {
    const userId = await insert("User", { authProvider: "test", authSubject: randomUUID() });
    const preferenceId = await insert("UserPreference", { userId });
    const clubId = await insert("Club", { slug: randomUUID(), name: "Test" });
    await expect(insert("UserFollow", { preferenceId, clubId, leagueId: await league() })).rejects.toMatchObject({ code: "23514" });
  });
  it("rejects a match with a season from another league", async () => {
    const m = await match();
    await reject('UPDATE "Match" SET "leagueId" = $1 WHERE id = $2', [await league(), m.matchId], "23503");
  });
  it("leaves unknown scores null and rejects negative scores", async () => {
    const m = await match();
    const result = await db.query('SELECT "homeScore", "awayScore" FROM "Match" WHERE id = $1', [m.matchId]);
    expect(result.rows[0]).toEqual({ homeScore: null, awayScore: null });
    await reject('UPDATE "Match" SET "homeScore" = -1, "awayScore" = 0 WHERE id = $1', [m.matchId], "23514");
  });
  it("prevents duplicate club statistics even with a null player", async () => {
    const m = await match();
    const stat = { matchId: m.matchId, clubId: m.homeClubId, provider: "test", metric: "shots", value: 2 };
    await insert("MatchStat", stat);
    await expect(insert("MatchStat", stat)).rejects.toMatchObject({ code: "23505" });
  });
  it("restricts deletion of a source with provenance records", async () => {
    const articleId = await article();
    await reject('DELETE FROM "NewsSource" WHERE id = (SELECT "sourceId" FROM "Article" WHERE id = $1)', [articleId], "23503");
  });
  it("restricts deletion of evidence attached to a BriefItem", async () => {
    const b = await brief();
    const e = await evidence();
    const briefItemId = await insert("BriefItem", { ...b, section: "MORE_NEWS", position: 0, headline: "Test", summary: "Test", inputSnapshot: "{}" });
    await db.query('INSERT INTO "BriefItemEvidence" ("briefItemId", "evidenceId", "updatedAt") VALUES ($1,$2,now())', [briefItemId, e.evidenceId]);
    await reject('DELETE FROM "ClaimEvidence" WHERE id = $1', [e.evidenceId], "23503");
  });
  it("blocks publishing an article without claim evidence", async () => {
    const articleId = await article();
    await db.query('UPDATE "Article" SET "publicationStatus" = \'PUBLISHED\', "processingStatus" = \'READY\', "titleVi" = \'test\', "summaryVi" = \'test\', "reliabilityClass" = \'RELIABLE\', "storyType" = \'CLUB\' WHERE id = $1', [articleId]);
    await expect(db.exec("SET CONSTRAINTS ALL IMMEDIATE")).rejects.toMatchObject({ code: "23514" });
  });
  it("blocks a ready empty brief", async () => {
    const b = await brief();
    await db.query('UPDATE "BriefRevision" SET status = \'READY\' WHERE id = $1', [b.revisionId]);
    await expect(db.exec("SET CONSTRAINTS ALL IMMEDIATE")).rejects.toMatchObject({ code: "23514" });
  });
  it("rejects a published Brief identity without a published revision", async () => {
    const b = await brief();
    await db.query('UPDATE "DailyBrief" SET status = \'PUBLISHED\', "generatedAt" = now(), "publishedAt" = now() WHERE id = $1', [b.briefId]);
    await expect(db.exec("SET CONSTRAINTS ALL IMMEDIATE")).rejects.toMatchObject({ code: "23514" });
  });
  it("accepts match-field evidence without manufacturing an article", async () => {
    const m = await match();
    await insert("ClaimEvidence", { matchId: m.matchId, fieldPath: "homeScore", claim: "test field provenance" });
    await db.exec("SET CONSTRAINTS ALL IMMEDIATE");
  });
  it("rejects a BriefItem whose brief differs from its revision", async () => {
    const b = await brief();
    const otherBrief = await insert("DailyBrief", { date: "2026-10-17" });
    await expect(insert("BriefItem", { briefId: otherBrief, revisionId: b.revisionId, section: "MORE_NEWS", position: 0, headline: "Test", summary: "Test", inputSnapshot: "{}" })).rejects.toMatchObject({ code: "23503" });
  });
  it("rejects ready Brief items without evidence", async () => {
    const b = await brief();
    await insert("BriefItem", { ...b, section: "MORE_NEWS", position: 0, headline: "Test", summary: "Test", inputSnapshot: "{}" });
    await db.query('UPDATE "BriefRevision" SET status = \'READY\' WHERE id = $1', [b.revisionId]);
    await expect(db.exec("SET CONSTRAINTS ALL IMMEDIATE")).rejects.toMatchObject({ code: "23514" });
  });
  it("allows citation changes within a draft transaction but prevents orphaning published evidence", async () => {
    const e = await evidence();
    await db.query('UPDATE "Article" SET "publicationStatus" = \'PUBLISHED\', "processingStatus" = \'READY\', "titleVi" = \'test\', "summaryVi" = \'test\', "reliabilityClass" = \'RELIABLE\', "storyType" = \'CLUB\' WHERE id = $1', [e.articleId]);
    await db.exec("SET CONSTRAINTS ALL IMMEDIATE");
    await reject('DELETE FROM "ClaimEvidence" WHERE id = $1', [e.evidenceId], "23514");
  });
  it("enforces idempotent logical job keys", async () => {
    await insert("JobRun", { jobName: "test-job", logicalKey: "2026-10-16", correlationId: randomUUID() });
    await expect(insert("JobRun", { jobName: "test-job", logicalKey: "2026-10-16", correlationId: randomUUID() })).rejects.toMatchObject({ code: "23505" });
  });
  it("makes published Brief content immutable", async () => {
    const b = await brief();
    const e = await evidence();
    const briefItemId = await insert("BriefItem", { ...b, section: "MORE_NEWS", position: 0, headline: "Test", summary: "Test", inputSnapshot: "{}" });
    await db.query('INSERT INTO "BriefItemEvidence" ("briefItemId", "evidenceId", "updatedAt") VALUES ($1,$2,now())', [briefItemId, e.evidenceId]);
    await db.query('UPDATE "BriefRevision" SET status = \'PUBLISHED\', "generatedAt" = now(), "publishedAt" = now() WHERE id = $1', [b.revisionId]);
    await db.exec("SET CONSTRAINTS ALL IMMEDIATE");
    await reject('UPDATE "BriefItem" SET headline = \'changed\' WHERE id = $1', [briefItemId], "23514");
  });
  it("prevents changing the meaning of cited evidence after publication", async () => {
    const b = await brief();
    const e = await evidence();
    const briefItemId = await insert("BriefItem", { ...b, section: "MORE_NEWS", position: 0, headline: "Test", summary: "Test", inputSnapshot: "{}" });
    await db.query('INSERT INTO "BriefItemEvidence" ("briefItemId", "evidenceId", "updatedAt") VALUES ($1,$2,now())', [briefItemId, e.evidenceId]);
    await db.query('UPDATE "BriefRevision" SET status = \'PUBLISHED\', "generatedAt" = now(), "publishedAt" = now() WHERE id = $1', [b.revisionId]);
    await db.exec("SET CONSTRAINTS ALL IMMEDIATE");
    await reject('UPDATE "ClaimEvidence" SET claim = \'changed\' WHERE id = $1', [e.evidenceId], "23514");
  });
  it("accepts a complete evidenced publication and preserves its identity across revisions", async () => {
    const b = await brief();
    const e = await evidence();
    const briefItemId = await insert("BriefItem", { ...b, section: "MORE_NEWS", position: 0, headline: "Test", summary: "Test", inputSnapshot: "{}" });
    await db.query('INSERT INTO "BriefItemEvidence" ("briefItemId", "evidenceId", "updatedAt") VALUES ($1,$2,now())', [briefItemId, e.evidenceId]);
    await db.query('UPDATE "BriefRevision" SET status = \'PUBLISHED\', "generatedAt" = now(), "publishedAt" = now() WHERE id = $1', [b.revisionId]);
    await db.query('UPDATE "DailyBrief" SET status = \'PUBLISHED\', "generatedAt" = now(), "publishedAt" = now() WHERE id = $1', [b.briefId]);
    await db.exec("SET CONSTRAINTS ALL IMMEDIATE");
    await insert("BriefRevision", { briefId: b.briefId, revision: 2, windowStart: "2026-10-15T00:00:00Z", windowEnd: "2026-10-16T00:00:00Z", cutoffAt: "2026-10-16T00:00:00Z", inputHash: "next-hash", rankingVersion: "test-v1", correctionReason: "test correction" });
    const count = await db.query<{ count: number }>('SELECT count(*)::int AS count FROM "DailyBrief" WHERE id = $1', [b.briefId]);
    expect(count.rows[0].count).toBe(1);
  });
});
