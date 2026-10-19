import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SyncDatabase } from "../lib/sync-database";
import { transferIdFromSlug } from "../lib/transfer-presentation";
import { TransferTrackingService } from "../services/transfer-service";
import { TransferQueryService } from "../services/transfer-query";
import { clusterId } from "./fixtures/clustering";
import { relNow } from "./fixtures/reliability";
import { resetTransferDatabase, seedTransferArticle, transferDatabase, transferIds } from "./fixtures/transfer-store";

describe("evidence-aware transfer persistence and public queries", () => {
  let db: PGlite; let database: SyncDatabase; let tracking: TransferTrackingService; let queries: TransferQueryService;
  const all = { league: "all", status: "all", page: 1 } as const;
  beforeAll(async () => { ({ db, database } = await transferDatabase()); tracking = new TransferTrackingService(database); queries = new TransferQueryService(database); }, 30000);
  beforeEach(async () => { await resetTransferDatabase(db); });
  afterAll(async () => { await db.close(); });
  const list = () => queries.list(all, relNow);
  it.each(["RUMOR", "INTEREST", "NEGOTIATION", "CONFIRMED"] as const)("persists and projects %s only from reviewed evidence", async (status) => {
    await seedTransferArticle(db, database, 1, { status }); const report = await tracking.sync(relNow); expect(report.created).toBe(1);
    const result = await list(); expect(result.transfers).toHaveLength(1); expect(result.transfers[0]).toMatchObject({ status, story: { transfer: { player: "Player X", currentClub: "Origin", targetClub: "Arsenal" } } });
    expect(await queries.detail(result.transfers[0].slug!, relNow)).not.toBeNull();
  });
  it("preserves chronological evolution and upgrades only with new official proof", async () => {
    await seedTransferArticle(db, database, 1, { status: "RUMOR", date: "2026-10-14T06:00:00Z" }); await tracking.sync(relNow);
    await seedTransferArticle(db, database, 2, { status: "NEGOTIATION", date: "2026-10-15T06:00:00Z" }); await tracking.sync(relNow);
    await seedTransferArticle(db, database, 3, { status: "CONFIRMED" }); await tracking.sync(relNow);
    const view = (await list()).transfers[0]; expect((await list()).transfers).toHaveLength(1); expect(view.status).toBe("CONFIRMED");
    expect(view.timeline.map((entry) => entry.status)).toEqual(["RUMOR", "NEGOTIATION", "CONFIRMED"]);
    expect((await db.query('SELECT count(*)::int AS count FROM "TransferUpdate"')).rows[0]).toEqual({ count: 3 });
  });
  it("repeated sync does not duplicate relationships, history or updates", async () => {
    await seedTransferArticle(db, database, 1); await tracking.sync(relNow); const second = await tracking.sync(relNow);
    expect(second).toMatchObject({ created: 0, cached: 1 }); expect((await db.query('SELECT count(*)::int AS count FROM "Transfer"')).rows[0]).toEqual({ count: 1 });
    expect((await db.query('SELECT count(*)::int AS count FROM "TransferUpdate"')).rows[0]).toEqual({ count: 1 });
    await expect(db.exec('UPDATE "TransferUpdate" SET summary=\'overwritten\'')).rejects.toThrow("append-only");
    await expect(db.exec('DELETE FROM "TransferUpdate"')).rejects.toThrow("append-only");
  });
  it("multiple destinations for the same player remain separate relationships", async () => {
    await seedTransferArticle(db, database, 1); await seedTransferArticle(db, database, 2, { destination: "Chelsea" }); await tracking.sync(relNow);
    expect((await list()).transfers.map((view) => view.story.transfer?.targetClub).sort()).toEqual(["Arsenal", "Chelsea"]);
    expect((await db.query('SELECT count(*)::int AS count FROM "Transfer"')).rows[0]).toEqual({ count: 2 });
  });
  it("copied reports increase provenance without manufacturing independence or confirmation", async () => {
    await seedTransferArticle(db, database, 1, { status: "RUMOR" }); await seedTransferArticle(db, database, 2, { status: "RUMOR" }); await db.exec('UPDATE "ClaimEvidence" SET "lineageKey"=\'same-primary-report\''); await tracking.sync(relNow);
    const view = (await list()).transfers[0]; expect(view).toMatchObject({ status: "RUMOR", story: { sourceCount: 2, independentSourceCount: 1 } });
  });
  it("does not trust a forged cached Transfer.status or legacy fee", async () => {
    await seedTransferArticle(db, database, 1, { status: "RUMOR" }); await tracking.sync(relNow);
    await db.exec('UPDATE "Transfer" SET status=\'CONFIRMED\',fee=40000000,currency=\'EUR\'');
    expect((await list()).transfers[0]).toMatchObject({ status: "RUMOR", facts: { confirmedFee: null, reportedFee: null } });
  });
  it("relabeling old evidence is not a new confirmation; a fresh authoritative record is required", async () => {
    const article = await seedTransferArticle(db, database, 1, { status: "CONFIRMED", official: false }); await tracking.sync(relNow);
    expect((await db.query('SELECT status FROM "Transfer"')).rows[0]).toEqual({ status: "RUMOR" });
    await db.query('UPDATE "NewsSource" SET type=\'OFFICIAL\',official=true,"sourceTier"=\'TIER_0_OFFICIAL\',"authorityScopes"=$2::text[] WHERE id=$1::uuid', [article.sourceId, [`club:${transferIds.arsenal}`]]);
    await db.query('UPDATE "ClaimEvidence" SET kind=\'OFFICIAL_STATEMENT\',"authorityScope"=$1', [`club:${transferIds.arsenal}`]);
    expect((await tracking.sync(relNow)).newEvidenceRequired).toBe(1);
    expect((await db.query('SELECT status FROM "Transfer"')).rows[0]).toEqual({ status: "RUMOR" });
    await db.query('INSERT INTO "ClaimEvidence" (id,"articleId","sourceArticleId",claim,locator,excerpt,kind,"claimKey","lineageKey","authorityScope","reviewedBy","reviewedAt","updatedAt") SELECT $1::uuid,"articleId","sourceArticleId",claim,locator,excerpt,kind,"claimKey","lineageKey","authorityScope","reviewedBy","reviewedAt",now() FROM "ClaimEvidence" LIMIT 1', [clusterId(48000)]);
    expect((await tracking.sync(relNow)).created).toBe(1);
    expect((await list()).transfers[0].status).toBe("CONFIRMED");
  });
  it("hides restricted sources immediately and rechecks publication", async () => {
    const row = await seedTransferArticle(db, database, 1); await tracking.sync(relNow);
    const slug = (await list()).transfers[0].slug!;
    await db.query('UPDATE "NewsSource" SET "permissionStatus"=\'RESTRICTED\' WHERE id=$1::uuid', [row.sourceId]);
    expect((await list()).transfers).toEqual([]); expect(await queries.detail(slug, relNow)).toBeNull();
  });
  it("a private official update cannot upgrade the public interest story", async () => {
    await seedTransferArticle(db, database, 1, { status: "INTEREST" }); await seedTransferArticle(db, database, 2, { status: "CONFIRMED", publish: false }); await tracking.sync(relNow);
    expect((await list()).transfers[0].status).toBe("INTEREST"); expect((await list()).transfers[0].timeline).toHaveLength(1);
  });
  it("uses canonical alias mappings without creating clubs or players", async () => {
    await seedTransferArticle(db, database, 1, { alias: true }); await tracking.sync(relNow);
    expect((await list()).transfers[0].story.transfer?.player).toBe("Player X");
    expect((await db.query('SELECT count(*)::int AS count FROM "Player"')).rows[0]).toEqual({ count: 1 });
    expect((await db.query('SELECT "playerId" FROM "Transfer"')).rows[0]).toEqual({ playerId: transferIds.player });
  });
  it("keeps incomplete mappings honest and does not invent a transfer identity", async () => {
    await seedTransferArticle(db, database, 1, { missingPlayer: true, missingTarget: true }); const result = await tracking.sync(relNow);
    expect(result.incomplete).toBe(1); expect((await list()).transfers[0]).toMatchObject({ slug: null, story: { transfer: { player: null, targetClub: null } } });
    expect((await db.query('SELECT count(*)::int AS count FROM "Transfer"')).rows[0]).toEqual({ count: 0 });
  });
  it("filters by persisted league and freshly evaluated status", async () => {
    await seedTransferArticle(db, database, 1); await tracking.sync(relNow);
    expect((await queries.list({ ...all, status: "INTEREST", league: "premier-league" }, relNow)).transfers).toHaveLength(1);
    expect((await queries.list({ ...all, status: "CONFIRMED" }, relNow)).transfers).toHaveLength(0);
    expect((await queries.list({ ...all, league: "la-liga" }, relNow)).transfers).toHaveLength(0);
    await db.exec('UPDATE "League" SET slug=\'la-liga\''); expect((await queries.list({ ...all, league: "la-liga" }, relNow)).transfers).toHaveLength(1);
  });
  it("a disputed linked story blocks the event instead of exposing stale confirmation", async () => {
    await seedTransferArticle(db, database, 1, { status: "CONFIRMED" }); await tracking.sync(relNow);
    await db.exec('UPDATE "ArticleCluster" SET "manualDisputed"=true'); expect((await list()).transfers).toEqual([]);
  });
  it("new reviewed contradictions block stale confirmation before reclustering", async () => {
    await seedTransferArticle(db, database, 1, { status: "CONFIRMED" }); await tracking.sync(relNow);
    await db.query('INSERT INTO "ClaimEvidence" (id,"articleId","sourceArticleId",claim,locator,excerpt,kind,stance,"claimKey","lineageKey","authorityScope","reviewedBy","reviewedAt","updatedAt") SELECT $1::uuid,"articleId","sourceArticleId",claim,locator,excerpt,kind,\'CONTRADICTS\',"claimKey",\'official-correction\',"authorityScope","reviewedBy","reviewedAt",now() FROM "ClaimEvidence" LIMIT 1', [clusterId(49000)]);
    expect((await list()).transfers).toEqual([]);
  });
  it("ignores relationships whose cached identities no longer match their evidence", async () => {
    await seedTransferArticle(db, database, 1); await tracking.sync(relNow);
    await db.query('UPDATE "Transfer" SET "targetClubId"=$1::uuid', [transferIds.chelsea]);
    expect((await list()).transfers).toEqual([]);
  });
  it("does not merge events weeks apart solely because the same pair is mentioned", async () => {
    await seedTransferArticle(db, database, 1, { date: "2026-08-01T06:00:00Z" }); await tracking.sync(relNow);
    await seedTransferArticle(db, database, 2); await tracking.sync(relNow);
    expect((await db.query('SELECT count(*)::int AS count FROM "Transfer"')).rows[0]).toEqual({ count: 2 });
  });
  it("requires reviewed official field evidence for a confirmed fee and preserves currency verbatim", async () => {
    const row = await seedTransferArticle(db, database, 1, { status: "CONFIRMED", feeText: "The transfer fee is €40m on a five-year contract." });
    for (const [n, field, value, currency] of [[1, "confirmedFee", "€40m", "EUR"], [2, "contractDuration", "five-year contract", undefined]] as const) await db.query('INSERT INTO "ClaimEvidence" (id,"articleId","sourceArticleId",claim,locator,excerpt,kind,"fieldPath","claimKey","lineageKey","authorityScope","reviewedBy","reviewedAt","updatedAt") VALUES ($1::uuid,$2::uuid,$2::uuid,$3,\'lead\',$4,\'OFFICIAL_STATEMENT\',$5,\'transfer-terms\',\'official-original\',$6,\'Fixture editor\',\'2026-10-17T07:00:00Z\',now())', [clusterId(30000 + n), row.id, JSON.stringify({ playerId: transferIds.player, targetClubId: transferIds.arsenal, value, ...(currency ? { currency } : {}) }), row.excerpt, `transfer.${field}`, `club:${transferIds.arsenal}`]);
    await tracking.sync(relNow); const view = (await list()).transfers[0];
    expect(view.facts).toMatchObject({ confirmedFee: { value: "€40m", currency: "EUR" }, reportedFee: null, contractDuration: { value: "five-year contract" } });
  });
  it("reported media fees cannot become confirmed fees", async () => {
    const row = await seedTransferArticle(db, database, 1, { feeText: "The transfer fee could reach €40m including add-ons.", status: "RUMOR" });
    for (const [n, field] of [[1, "reportedFee"], [2, "confirmedFee"]] as const) await db.query('INSERT INTO "ClaimEvidence" (id,"articleId","sourceArticleId",claim,locator,excerpt,"fieldPath","claimKey","lineageKey","reviewedBy","reviewedAt","updatedAt") VALUES ($1::uuid,$2::uuid,$2::uuid,$3,\'lead\',$4,$5,\'reported-price\',\'media-origin\',\'Fixture editor\',\'2026-10-17T07:00:00Z\',now())', [clusterId(31000 + n), row.id, JSON.stringify({ playerId: transferIds.player, targetClubId: transferIds.arsenal, value: "could reach €40m including add-ons", currency: "EUR" }), row.excerpt, `transfer.${field}`]);
    await tracking.sync(relNow); expect((await list()).transfers[0].facts).toMatchObject({ confirmedFee: null, reportedFee: { value: "could reach €40m including add-ons", currency: "EUR" } });
  });
  it("a confirmed signing can still have only a reported, conditional fee", async () => {
    const row = await seedTransferArticle(db, database, 1, { status: "CONFIRMED", feeText: "The transfer fee is up to €40m including add-ons." });
    for (const [n, field] of [[1, "reportedFee"], [2, "confirmedFee"]] as const) await db.query('INSERT INTO "ClaimEvidence" (id,"articleId","sourceArticleId",claim,locator,excerpt,kind,"fieldPath","claimKey","lineageKey","authorityScope","reviewedBy","reviewedAt","updatedAt") VALUES ($1::uuid,$2::uuid,$2::uuid,$3,\'lead\',$4,\'OFFICIAL_STATEMENT\',$5,\'conditional-price\',\'official-origin\',$6,\'Fixture editor\',\'2026-10-17T07:00:00Z\',now())', [clusterId(32000 + n), row.id, JSON.stringify({ playerId: transferIds.player, targetClubId: transferIds.arsenal, value: "up to €40m including add-ons", currency: "EUR" }), row.excerpt, `transfer.${field}`, `club:${transferIds.arsenal}`]);
    await tracking.sync(relNow); expect((await list()).transfers[0]).toMatchObject({ status: "CONFIRMED", facts: { confirmedFee: null, reportedFee: { value: "up to €40m including add-ons", currency: "EUR" } } });
  });
  it("invalid detail slugs never resolve, and public reads do not add history", async () => {
    await seedTransferArticle(db, database, 1); await tracking.sync(relNow); const before = await db.query('SELECT * FROM "TransferUpdate"');
    await list(); await list(); expect((await db.query('SELECT * FROM "TransferUpdate"')).rows).toEqual(before.rows);
    expect(await queries.detail("../../unsafe", relNow)).toBeNull(); expect(transferIdFromSlug(`giao-dich-${clusterId(999)}`)).not.toBeNull(); expect(await queries.detail(`giao-dich-${clusterId(999)}`, relNow)).toBeNull();
  });
});
