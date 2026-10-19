import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import type { SyncDatabase } from "../lib/sync-database";
import { transferDatabase, resetTransferDatabase, seedTransferArticle, transferIds } from "./fixtures/transfer-store";
import { briefNow } from "./fixtures/briefs";
import { vidId, videoCandidate, videoSource, videoMapping, videoMatch, videoNow } from "./fixtures/videos";
import { MorningBriefService } from "../services/morning-brief";
import { BriefQueryService } from "../services/brief-query";
import { VideoStore } from "../services/video-store";
import { TransferTrackingService } from "../services/transfer-service";
import { StoryClusteringService } from "../services/story-clustering";
import { seedBriefNews } from "./fixtures/brief-news";

describe("morning brief persistence and publication", () => {
  let db: PGlite; let database: SyncDatabase; let service: MorningBriefService; let query: BriefQueryService;
  beforeAll(async () => { ({ db, database } = await transferDatabase()); }, 30000);
  afterAll(async () => { await db.close(); });
  beforeEach(async () => { await db.exec('TRUNCATE "DailyBrief","Video","VideoSource","Match" CASCADE'); await resetTransferDatabase(db); service = new MorningBriefService(database); query = new BriefQueryService(database); });
  const generate = () => service.generate({ date: "2026-10-18" }, briefNow);
  async function match(n = 1, status = "FINISHED", kickoff = "2026-10-17T18:00:00Z", score: number | null = 2) {
    const id = vidId(100 + n); const season = vidId(200);
    await db.query('INSERT INTO "Season" (id,"leagueId",name,"updatedAt") VALUES ($1,$2,\'2026/2027\',now()) ON CONFLICT DO NOTHING', [season, transferIds.league]);
    await db.query('INSERT INTO "Match" (id,slug,provider,"externalId","leagueId","seasonId","homeClubId","awayClubId","kickoffAt",status,"homeScore","awayScore","lastUpdatedAt","updatedAt") VALUES ($1,$2,\'FOOTBALL_DATA\',$2,$3,$4,$5,$6,$7,$8::"MatchStatus",$9,$10,\'2026-10-17T21:00:00Z\',now())', [id, `brief-fixture-${n}`, transferIds.league, season, transferIds.arsenal, transferIds.chelsea, kickoff, status, status === "FINISHED" ? score : null, status === "FINISHED" && score !== null ? 1 : null]);
    await db.query('INSERT INTO "ExternalIdentity" (id,provider,"entityType","externalId","matchId","updatedAt") VALUES ($1,\'FOOTBALL_DATA\',\'MATCH\',$2,$3,now())', [vidId(300+n), `brief-fixture-${n}`, id]);
    return id;
  }
  it("includes completed results with exact score and clean highlight fallback", async () => {
    await match(); const result = await generate(); expect(result.record.status).toBe("READY");
    expect(result.record.document.sections[0].items[0]).toMatchObject({ titleVi: "Arsenal 2 – 1 Chelsea: kết quả đã ghi nhận", match: { homeScore: 2, awayScore: 1 }, highlightRef: null });
    const view = await query.getRevision(result.record.id, { internal: true, now: briefNow }); expect(view?.highlightFallbackVi).toBe("Chưa tìm thấy highlight từ nguồn được xác minh.");
    expect(view?.highlights).toHaveProperty(`match:${vidId(101)}`, null);
    expect((await db.query('SELECT * FROM "BriefItemEvidence"')).rows.length).toBeGreaterThan(0);
  });
  it("unchanged generation is idempotent, changed score creates a preserved revision", async () => {
    await match(); const first = await generate(); const same = await generate(); expect(same.cached).toBe(true); expect(same.record.id).toBe(first.record.id);
    await db.exec('UPDATE "Match" SET "homeScore"=3'); const changed = await generate(); expect(changed.record.revision).toBe(2);
    expect((await db.query('SELECT id FROM "DailyBrief"')).rows).toHaveLength(1); expect((await db.query('SELECT id FROM "BriefRevision"')).rows).toHaveLength(2);
    expect((await db.query<{ headline: string }>('SELECT headline FROM "BriefItem" WHERE "revisionId"=$1 AND "matchId" IS NOT NULL', [first.record.id])).rows[0].headline).toContain("2 – 1");
    await db.exec('UPDATE "Match" SET "homeScore"=2'); const reverted = await generate(); expect(reverted.record.revision).toBe(3); expect(reverted.cached).toBe(false);
  });
  it("does not mark an empty/sparse-invalid brief READY or publish it", async () => {
    const result = await generate(); expect(result.record.status).toBe("DRAFT"); expect(result.record.document.sections).toEqual([]);
    await expect(service.publish(result.record.id, briefNow)).rejects.toThrow("BRIEF_NOT_READY");
    expect(await query.getLatest(briefNow)).toBeNull();
  });
  it("excludes missing scores, unmapped data, other competitions and out-of-window fixtures", async () => {
    await match(1, "FINISHED", "2026-10-17T18:00:00Z", null); await match(2, "FINISHED", "2026-10-16T18:00:00Z"); await match(3, "FINISHED");
    await db.query('DELETE FROM "ExternalIdentity" WHERE "matchId"=$1', [vidId(103)]);
    expect((await generate()).record.document.sections).toEqual([]);
  });
  it("selects upcoming fixtures after cutoff and within the configured horizon", async () => {
    await match(1, "SCHEDULED", "2026-10-18T18:00:00Z"); await match(2, "SCHEDULED", "2026-10-19T18:00:00Z");
    const section = (await generate()).record.document.sections[0]; expect(section.type).toBe("UPCOMING"); expect(section.items).toHaveLength(1); expect(section.items[0].summaryVi).toContain("01:00");
  });
  it("publishes only explicitly, protects snapshots, and exposes date/latest/revision queries", async () => {
    await match(); const { record } = await generate(); expect(await query.getByDate("2026-10-18", { now: briefNow })).toBeNull();
    await expect(db.query('UPDATE "BriefItem" SET headline=\'invented\' WHERE "revisionId"=$1', [record.id])).rejects.toThrow();
    await service.publish(record.id, briefNow); expect((await query.getLatest(briefNow))?.id).toBe(record.id);
    expect((await query.getByDate("2026-10-18", { now: briefNow }))?.revision).toBe(1);
    expect(await query.getRevision("invalid")).toBeNull();
  });
  it("publication rechecks facts and cannot publish a superseded revision", async () => {
    await match(); const first = await generate(); await db.exec('UPDATE "Match" SET "homeScore"=4');
    await expect(service.publish(first.record.id, briefNow)).rejects.toThrow(); await generate(); await expect(service.publish(first.record.id, briefNow)).rejects.toThrow();
  });
  it("transfer evolution emits only the current supported state, not old raw clusters", async () => {
    await seedTransferArticle(db, database, 1, { status: "INTEREST", date: "2026-10-17T06:00:00Z" }); await seedTransferArticle(db, database, 2, { status: "CONFIRMED", date: "2026-10-17T09:00:00Z" });
    await new StoryClusteringService(database).cluster({ now: briefNow });
    await new TransferTrackingService(database).sync(briefNow);
    const result = await generate(); const items = result.record.document.sections.flatMap((section) => section.items);
    expect(items).toHaveLength(1); expect(items[0].section).toBe("TRANSFERS"); expect(items[0].transferStatus).toBe("CONFIRMED"); expect(items[0].citations).toHaveLength(2);
  });
  it("rumor stays rumor; restricted and untranslated stories never leak", async () => {
    const source = await seedTransferArticle(db, database, 1, { status: "RUMOR" }); await new TransferTrackingService(database).sync(briefNow);
    const result = await generate(); expect(result.record.document.sections[0].items[0]).toMatchObject({ transferStatus: "RUMOR", reliability: { label: "RUMOR" } });
    expect(result.record.document.sections[0].items[0].titleVi).toContain("có thể");
    await db.query('UPDATE "NewsSource" SET enabled=false WHERE id=$1', [source.sourceId]);
    expect(await query.getRevision(result.record.id, { internal: true, now: briefNow })).toBeNull(); expect((await generate()).record.status).toBe("DRAFT");
  });
  it("integrates only verified stored highlights without freezing YouTube API metadata", async () => {
    const id = await match(1, "FINISHED", videoMatch.kickoffAt); const source = videoSource(); const mapping = videoMapping({ competitionId: transferIds.league });
    await db.query('INSERT INTO "VideoSource" (id,"channelId","channelHandle",name,country,language,verified,enabled,"sourceType","lastVerifiedAt","reviewReference","updatedAt") VALUES ($1,$2,$3,$4,\'VN\',\'vi\',true,true,\'RIGHTS_HOLDER\',$5,$6,now())', [source.id, source.channelId, source.channelHandle, source.name, source.lastVerifiedAt, source.reviewReference]);
    await db.query('INSERT INTO "VideoSourceCompetition" (id,"videoSourceId","competitionId",season,market,language,"rightsType","validFrom","validTo",enabled,"evidenceUrl","updatedAt") VALUES ($1,$2,$3,$4,\'VN\',\'vi\',\'AUTHORIZED_LINK\',$5,$6,true,$7,now())', [mapping.id, source.id, transferIds.league, mapping.season, mapping.validFrom, mapping.validTo, mapping.evidenceUrl]);
    const videoStore = new VideoStore(database); const input = { ...videoMatch, id, leagueId: transferIds.league };
    await videoStore.persist(input, source, mapping, videoCandidate(), videoNow); await videoStore.select(input, videoNow);
    // Move cutoff to include this older result, without inventing a completion timestamp.
    const result = await service.generate({ date: "2026-10-17", asOf: "2026-10-17T23:00:00Z" }, briefNow).catch(() => null);
    expect(result).toBeNull(); // UTC date must still identify the requested Vietnamese day.
    const good = await service.generate({ date: "2026-10-17", asOf: "2026-10-17T15:00:00Z" }, briefNow);
    const view = await query.getRevision(good.record.id, { internal: true, now: briefNow });
    expect(Object.values(view!.highlights)[0]?.url).toContain("fixture0001");
    expect(JSON.stringify(good.record.metadata)).not.toContain("fixture0001");
    await db.exec('DELETE FROM "Video"'); expect(Object.values((await query.getRevision(good.record.id, { internal: true, now: briefNow }))!.highlights)[0]).toBeNull();
  });
  it("canonical news appears once with all permitted sources and no cross-section duplicate", async () => {
    await seedBriefNews(db, database, 1, "OFF_FIELD", true); await seedBriefNews(db, database, 2, "OFF_FIELD", true);
    await new StoryClusteringService(database).cluster({ now: briefNow });
    await db.exec('UPDATE "Article" SET "publicationStatus"=\'PUBLISHED\'');
    const result = await generate(); const items = result.record.document.sections.flatMap((section) => section.items);
    expect(items).toHaveLength(1); expect(items[0].section).toBe("OFF_FIELD"); expect(items[0].citations).toHaveLength(2);
    expect(items[0].reliability.label).toBe("OFFICIAL"); expect(result.record.document.summary[0].itemKey).toBe(items[0].key);
    expect(JSON.stringify(result.record.document)).not.toContain("contentOriginal");
  });
  it("missing safe Vietnamese processing and denied permissions are excluded", async () => {
    const article = await seedBriefNews(db, database, 1, "CLUB");
    await db.query('UPDATE "Article" SET "publicationStatus"=\'DRAFT\',"processingStatus"=\'NEEDS_REVIEW\',"titleVi"=NULL,"summaryVi"=NULL WHERE id=$1', [article.articleId]);
    expect((await generate()).record.status).toBe("DRAFT");
    await db.query('UPDATE "NewsSource" SET "permissionStatus"=\'RESTRICTED\' WHERE id=$1', [article.sourceId]);
    expect((await generate()).record.document.sections).toEqual([]);
  });
  it("public historical briefs cannot expose newly restricted source content", async () => {
    const article = await seedBriefNews(db, database, 1, "CLUB"); const { record } = await generate();
    await service.publish(record.id, briefNow); expect(await query.getLatest(briefNow)).not.toBeNull();
    await db.query('UPDATE "NewsSource" SET enabled=false WHERE id=$1', [article.sourceId]);
    expect(await query.getLatest(briefNow)).toBeNull(); expect(await query.getRevision(record.id, { now: briefNow })).toBeNull();
  });
  it("concurrent equivalent requests produce one identity and revision", async () => {
    await match(); const results = await Promise.all([generate(), generate()]);
    expect(results[0].record.id).toBe(results[1].record.id); expect((await db.query('SELECT id FROM "BriefRevision"')).rows).toHaveLength(1);
  });
  it("upcoming snapshots remain historical after kickoff, but rescheduling is detected", async () => {
    await match(1, "SCHEDULED", "2026-10-18T18:00:00Z"); const { record } = await generate(); await service.publish(record.id, briefNow);
    await db.exec('UPDATE "Match" SET status=\'LIVE\'');
    expect(await query.getRevision(record.id, { now: new Date("2026-10-18T19:00:00Z") })).not.toBeNull();
    await db.exec('UPDATE "Match" SET "kickoffAt"=\'2026-10-18T20:00:00Z\'');
    expect(await query.getRevision(record.id, { now: new Date("2026-10-18T19:00:00Z") })).toBeNull();
  });
});
