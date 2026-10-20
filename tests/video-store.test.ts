import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { initialVideoSources } from "../providers/youtube/sources";
import type { PGlite } from "@electric-sql/pglite";
import type { SyncDatabase } from "../lib/sync-database";
import { transferDatabase } from "./fixtures/transfer-store";
import { FakeVideoProvider, vidId, videoCandidate, videoMapping, videoMatch, videoNow, videoSource } from "./fixtures/videos";
import { VideoStore } from "../services/video-store";
import { VideoSyncService } from "../services/video-sync";
import { readVerifiedHighlight } from "../services/video-query";
import { VideoProviderError } from "../types/video-provider";

describe("persisted video sync and public gates", () => {
  let db: PGlite; let database: SyncDatabase; let store: VideoStore; let provider: FakeVideoProvider;
  beforeAll(async () => { ({ db, database } = await transferDatabase()); }, 30000);
  afterAll(async () => { await db.close(); });
  beforeEach(async () => {
    await db.exec('TRUNCATE "Video","VideoSource","Match","League","Club","JobRun","ProviderStatus" CASCADE');
    store = new VideoStore(database); provider = new FakeVideoProvider();
    await db.query('INSERT INTO "League" (id,slug,name,country,"updatedAt") VALUES ($1,\'premier-league\',\'Premier League\',\'GB\',now())', [videoMatch.leagueId]);
    await db.query('INSERT INTO "Season" (id,"leagueId",name,"updatedAt") VALUES ($1,$2,\'2026/2027\',now())', [vidId(5), videoMatch.leagueId]);
    for (const [key, name] of [[6, "Arsenal"], [7, "Chelsea"]] as const) await db.query('INSERT INTO "Club" (id,slug,name,aliases,"updatedAt") VALUES ($1,$2,$2,$3::text[],now())', [vidId(key), name, [name]]);
    await db.query('INSERT INTO "Match" (id,slug,provider,"externalId","leagueId","seasonId","homeClubId","awayClubId","kickoffAt",status,"updatedAt") VALUES ($1,\'fixture-video-match\',\'TEST\',\'test\',$2,$3,$4,$5,$6,\'FINISHED\',now())', [videoMatch.id, videoMatch.leagueId, vidId(5), vidId(6), vidId(7), videoMatch.kickoffAt]);
    const source = videoSource(); const mapping = videoMapping();
    await db.query('INSERT INTO "VideoSource" (id,"channelId","channelHandle",name,country,language,verified,enabled,priority,"sourceType","lastVerifiedAt","reviewReference","updatedAt") VALUES ($1,$2,$3,$4,\'VN\',\'vi\',true,true,10,\'RIGHTS_HOLDER\',$5,$6,now())', [source.id, source.channelId, source.channelHandle, source.name, source.lastVerifiedAt, source.reviewReference]);
    await db.query('INSERT INTO "VideoSourceCompetition" (id,"videoSourceId","competitionId",season,market,language,"rightsType",priority,"validFrom","validTo",enabled,"evidenceUrl","updatedAt") VALUES ($1,$2,$3,$4,\'VN\',\'vi\',\'AUTHORIZED_LINK\',10,$5,$6,true,$7,now())', [mapping.id, source.id, videoMatch.leagueId, mapping.season, mapping.validFrom, mapping.validTo, mapping.evidenceUrl]);
  });
  const sync = () => new VideoSyncService(provider, store).run({ mode: "recent" }, videoNow);
  it("persists one verified highlight and is idempotent without another search", async () => {
    expect(await sync()).toMatchObject({ searches: 1, processed: 1, primary: 1, errors: 0 });
    expect(await sync()).toMatchObject({ searches: 0, primary: 1 }); expect(provider.searches).toBe(1);
    expect((await db.query('SELECT id FROM "Video"')).rows).toHaveLength(1);
    expect((await readVerifiedHighlight(store, videoMatch.id, videoNow))?.url).toBe("https://www.youtube.com/watch?v=fixture0001");
  });
  it("missing key skips sync gracefully and leaves fresh stored links usable", async () => {
    await sync(); provider.configured = false;
    expect((await sync()).skipped).toBe("NOT_CONFIGURED"); expect(provider.searches).toBe(1);
    expect(await readVerifiedHighlight(store, videoMatch.id, videoNow)).not.toBeNull();
  });
  it("negative searches are cached and never fabricate a video", async () => {
    provider.videos = []; await sync(); await sync(); expect(provider.searches).toBe(1);
    expect(await readVerifiedHighlight(store, videoMatch.id, videoNow)).toBeNull();
  });
  it("quota errors preserve good data, record failure and stop subsequent calls", async () => {
    await sync(); await db.exec('DELETE FROM "VideoSyncState"'); provider.failure = new VideoProviderError("QUOTA");
    await db.exec('UPDATE "VideoSource" SET country=\'GB\',"sourceType"=\'BROADCASTER\'');
    expect(await sync()).toMatchObject({ errors: 1 }); const calls = provider.searches;
    expect((await sync()).skipped).toBe("COOLDOWN"); expect(provider.searches).toBe(calls);
    expect(await readVerifiedHighlight(store, videoMatch.id, videoNow)).not.toBeNull();
    expect((await db.query<{ errorCode: string }>('SELECT "errorCode" FROM "ProviderStatus"')).rows[0].errorCode).toBe("QUOTA");
  });
  it("disabled or expired rights are enforced again on read", async () => {
    await sync(); await db.query('UPDATE "VideoSourceCompetition" SET enabled=false');
    expect(await readVerifiedHighlight(store, videoMatch.id, videoNow)).toBeNull();
    await db.query('UPDATE "VideoSourceCompetition" SET enabled=true,"validTo"=$1', [videoNow]);
    expect(await readVerifiedHighlight(store, videoMatch.id, videoNow)).toBeNull();
  });
  it("private/removed public-API records withdraw selection without breaking the match", async () => {
    await sync(); provider.missingIds = ["fixture0001"];
    const next = new Date(videoNow.getTime() + 2 * 86400000);
    await new VideoSyncService(provider, store).run({ mode: "refresh" }, next);
    expect(await readVerifiedHighlight(store, videoMatch.id, next)).toBeNull();
    const row = (await db.query<{ availabilityStatus: string; selectedAsPrimary: boolean }>('SELECT "availabilityStatus","selectedAsPrimary" FROM "Video"')).rows[0];
    expect(row).toMatchObject({ availabilityStatus: "UNAVAILABLE", selectedAsPrimary: false });
  });
  it("chooses one primary among multiple types and enforces uniqueness in SQL", async () => {
    provider.videos.push(videoCandidate({ externalId: "fixture0002", title: "Extended highlights Arsenal Chelsea Premier League" }), videoCandidate({ externalId: "fixture0003", title: "REACTION Arsenal Chelsea Premier League highlights" }));
    await sync(); expect((await db.query('SELECT id FROM "Video"')).rows).toHaveLength(3);
    expect((await db.query('SELECT id FROM "Video" WHERE "selectedAsPrimary"')).rows).toHaveLength(1);
    await expect(db.exec('UPDATE "Video" SET "selectedAsPrimary"=true WHERE "externalId"=\'fixture0002\'')).rejects.toThrow();
    expect((await readVerifiedHighlight(store, videoMatch.id, videoNow))?.videoType).toBe("HIGHLIGHT");
  });
  it("rejects wrong-match/reupload candidates and keeps no suitable video state", async () => {
    provider.videos = [videoCandidate({ title: "Arsenal Liverpool highlights Premier League" }), videoCandidate({ externalId: "fixture0002", channelId: `UC${"z".repeat(22)}` })];
    await sync(); expect(await readVerifiedHighlight(store, videoMatch.id, videoNow)).toBeNull();
  });
  it("withdraws stale metadata and purges only managed expired records", async () => {
    await sync(); const later = new Date(videoNow.getTime() + 30 * 86400000);
    expect(await readVerifiedHighlight(store, videoMatch.id, later)).toBeNull();
    expect(await store.purgeExpired(later)).toBe(1); expect((await db.query('SELECT id FROM "Match"')).rows).toHaveLength(1);
  });
  it("registry insertion is repeatable and never re-enables operator-disabled sources", async () => {
    expect(await store.registry()).toBe(initialVideoSources.length); expect(await store.registry()).toBe(0);
    await db.exec('UPDATE "VideoSource" SET enabled=false'); await store.registry();
    expect((await db.query('SELECT id FROM "VideoSource" WHERE enabled')).rows).toHaveLength(0);
  });
  it("channel identity changes fail closed and cannot take over a reviewed source", async () => {
    await sync(); expect(await store.resolve(videoSource(), `UC${"z".repeat(22)}`)).toBe(false);
    expect(await readVerifiedHighlight(store, videoMatch.id, videoNow)).toBeNull();
  });
  it("uses persisted global budget and records cancelled/skipped jobs", async () => {
    await sync(); await db.exec('DELETE FROM "VideoSyncState"'); await db.query('UPDATE "ProviderStatus" SET checkpoint=$1::jsonb', [JSON.stringify({ day: "2026-10-17", searches: 10 })]);
    await db.exec('UPDATE "VideoSource" SET country=\'GB\',"sourceType"=\'BROADCASTER\'');
    expect((await sync()).skipped).toBe("DAILY_SEARCH_BUDGET"); expect(provider.searches).toBe(1);
    expect((await db.query<{ status: string }>('SELECT status FROM "JobRun"')).rows[0].status).toBe("CANCELLED");
  });
  it("does not search again for a preferred verified highlight after cache expiry", async () => {
    await sync();
    await new VideoSyncService(provider, store).run({ mode: "recent" }, new Date(videoNow.getTime() + 13 * 3600000));
    expect(provider.searches).toBe(1); expect(provider.metadata).toBe(1);
  });
  it("one failed approved channel query does not prevent another source succeeding", async () => {
    const source = videoSource({ id: vidId(30), channelId: `UC${"b".repeat(22)}`, channelHandle: "@second" });
    await db.query('INSERT INTO "VideoSource" (id,"channelId","channelHandle",name,country,language,verified,enabled,"sourceType","lastVerifiedAt","reviewReference","updatedAt") VALUES ($1,$2,$3,\'Second fixture\',\'VN\',\'vi\',true,true,\'RIGHTS_HOLDER\',$4,$5,now())', [source.id, source.channelId, source.channelHandle, source.lastVerifiedAt, source.reviewReference]);
    await db.query('INSERT INTO "VideoSourceCompetition" (id,"videoSourceId","competitionId",season,market,language,"rightsType","validFrom","validTo",enabled,"evidenceUrl","updatedAt") SELECT $1,$2,"competitionId",season,market,language,"rightsType","validFrom","validTo",enabled,"evidenceUrl",now() FROM "VideoSourceCompetition" LIMIT 1', [vidId(31), source.id]);
    provider.resolveChannel = async (handle) => ({ handle, channelId: handle === "@second" ? source.channelId! : videoSource().channelId! });
    provider.searchMatchHighlights = async (_match, current) => { if (current.id === videoSource().id) throw new VideoProviderError("NETWORK"); return ["fixture0002"]; };
    provider.videos = [videoCandidate({ externalId: "fixture0002", channelId: source.channelId! })];
    expect(await sync()).toMatchObject({ errors: 1, processed: 1, primary: 1 });
    expect(await readVerifiedHighlight(store, videoMatch.id, videoNow)).not.toBeNull();
  });
});
