import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import type { SyncDatabase } from "../lib/sync-database";
import { MorningHomepageService, loadHomepage } from "../services/morning-homepage";
import { MorningBriefService } from "../services/morning-brief";
import { MorningHomepage } from "../components/home/morning-homepage";
import { transferDatabase, resetTransferDatabase, seedTransferArticle } from "./fixtures/transfer-store";
import { seedBriefNews } from "./fixtures/brief-news";
import { seedHomepageMatch } from "./fixtures/homepage";
import { briefNow } from "./fixtures/briefs";
import { vidId } from "./fixtures/videos";
import { TransferTrackingService } from "../services/transfer-service";

describe("permission-checked homepage persistence boundary", () => {
  let db: PGlite; let database: SyncDatabase; let generator: MorningBriefService;
  beforeAll(async () => { ({ db, database } = await transferDatabase()); }, 30000);
  afterAll(async () => { await db.close(); });
  beforeEach(async () => { await db.exec('TRUNCATE "DailyBrief","Video","VideoSource","Match","JobRun" CASCADE'); await resetTransferDatabase(db); generator = new MorningBriefService(database); });
  const read = (environment = "production", preview?: string, now = briefNow) => new MorningHomepageService(database, environment).read(preview, now);
  const generate = () => generator.generate({ date: "2026-10-18" }, briefNow);

  it("reads an eligible published brief and enriches only canonical selected stories", async () => {
    await seedBriefNews(db, database, 1); const generated = await generate(); await generator.publish(generated.record.id, briefNow);
    const result = await read(); expect(result.kind).toBe("ready"); if (result.kind !== "ready") throw new Error("Expected published view");
    expect(result.view.preview).toBe(false); expect(result.view.sections[0].items[0].entities.some((entity) => entity.name === "Arsenal")).toBe(true); expect(result.view.sections[0].items[0].href).toMatch(/^\/news\/tin-/);
    expect(result.view.summary).toHaveLength(1);
  });
  it.each(["production", "test", "development"])("READY is not public by default in %s", async (environment) => { await seedHomepageMatch(database); await generate(); expect(await read(environment)).toEqual({ kind: "empty" }); });
  it("production ignores public preview flags and does not publish READY content", async () => {
    await seedHomepageMatch(database); await generate(); expect(await read("production", "1")).toEqual({ kind: "empty" }); expect((await database.query<{ status: string }>('SELECT status FROM "DailyBrief"'))[0].status).toBe("READY");
  });
  it("development-only preview renders READY through the same current-data gates", async () => {
    await seedHomepageMatch(database); await generate(); const result = await read("development", "1"); expect(result.kind).toBe("ready"); if (result.kind === "ready") { expect(result.view.preview).toBe(true); expect(result.view.sections[0].type).toBe("RESULTS"); }
    expect(await read("development", "true")).toEqual({ kind: "empty" });
  });
  it("DRAFT is never shown, even by development preview", async () => { const generated = await generate(); expect(generated.record.status).toBe("DRAFT"); expect(await read("development", "1")).toEqual({ kind: "empty" }); });
  it("preview still hides revoked source content and related summary points", async () => {
    const source = await seedBriefNews(db, database, 1); await generate(); await db.query('UPDATE "NewsSource" SET "permissionStatus"=\'RESTRICTED\' WHERE id=$1', [source.sourceId]); expect(await read("development", "1")).toEqual({ kind: "empty" });
  });
  it("public reads revoke a previously published brief after permission withdrawal", async () => {
    const source = await seedBriefNews(db, database, 1); const generated = await generate(); await generator.publish(generated.record.id, briefNow); await db.query('UPDATE "NewsSource" SET enabled=false WHERE id=$1', [source.sourceId]); expect(await read()).toEqual({ kind: "empty" });
  });
  it("uses the last eligible published brief when a newer revision remains READY", async () => {
    await seedHomepageMatch(database); const old = await generate(); await generator.publish(old.record.id, briefNow); const recent = await generator.generate({ date: "2026-10-18", asOf: "2026-10-18T01:20:00Z" }, briefNow); expect(recent.record.status).toBe("READY");
    const result = await read(); expect(result.kind).toBe("ready"); if (result.kind === "ready") expect(result.view.preview).toBe(false);
  });
  it("keeps an old brief's actual date and stale status instead of calling it today's", async () => {
    await seedHomepageMatch(database, "2026-10-16T18:00:00Z"); const result = await generator.generate({ date: "2026-10-17" }, briefNow); await generator.publish(result.record.id, briefNow);
    const home = await read(); expect(home.kind).toBe("ready"); if (home.kind === "ready") expect(home.view).toMatchObject({ date: "2026-10-17", stale: true });
  });
  it("attaches safe PARTIAL and stale-source flags only to the exact selected revision", async () => {
    await seedHomepageMatch(database); const generated = await generate(); await generator.publish(generated.record.id, briefNow);
    const checkpoint = { steps: [{ outcome: { brief: { id: generated.record.id } } }], freshness: [{ stale: true, health: "WARNING" }], errorCode: "PRIVATE_PROVIDER_DETAIL" };
    await db.query('INSERT INTO "JobRun" (id,"jobName","logicalKey",status,"finishedAt",checkpoint,"correlationId","updatedAt") VALUES ($1,\'scheduler:morning-attempt\',\'test-only\',\'PARTIAL\',$2,$3::jsonb,$1,now())', [vidId(65000), briefNow, JSON.stringify(checkpoint)]);
    const result = await read(); expect(result.kind).toBe("ready"); if (result.kind === "ready") expect(result.view).toMatchObject({ partial: true, staleInputs: true }); expect(JSON.stringify(result)).not.toContain("PRIVATE_PROVIDER_DETAIL");
    await db.query('UPDATE "JobRun" SET checkpoint=$1::jsonb', [JSON.stringify({ ...checkpoint, steps: [{ outcome: { brief: { id: vidId(65001) } } }] })]); const unrelated = await read(); if (unrelated.kind === "ready") expect(unrelated.view.partial).toBe(false);
  });
  it("end-to-end persisted service plus server markup never calls external providers", async () => {
    await seedHomepageMatch(database); await seedBriefNews(db, database, 1); const generated = await generate(); await generator.publish(generated.record.id, briefNow);
    const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("External access prohibited"));
    try { const html = renderToStaticMarkup(<MorningHomepage result={await read()} now={briefNow} />); expect(html).toContain("2 – 1"); expect(html).toContain("Arsenal công bố hoạt động từ thiện"); expect(fetch).not.toHaveBeenCalled(); } finally { fetch.mockRestore(); }
  });
  it("preserves published transfer provenance, roles and rumor status", async () => {
    await seedTransferArticle(db, database, 1, { status: "INTEREST", feeText: "The fee could be €40m." }); await new TransferTrackingService(database).sync(briefNow);
    const generated = await generate(); expect(generated.record.status).toBe("READY"); await generator.publish(generated.record.id, briefNow);
    const result = await read(); expect(result.kind).toBe("ready"); if (result.kind === "ready") { const transfer = result.view.sections.find((section) => section.type === "TRANSFERS")?.items[0]; expect(transfer?.item.transferStatus).toBe("INTEREST"); expect(transfer?.transfer?.targetClub).toBe("Arsenal"); expect(transfer?.href).toMatch(/^\/transfers\/giao-dich-/); }
  });
  it("returns a safe error result for database failure without leaking internals", async () => { const broken = { query: database.query, transaction: async () => { throw new Error("private connection string"); } } as SyncDatabase; expect(await loadHomepage(() => new MorningHomepageService(broken).read(undefined, briefNow))).toEqual({ kind: "error" }); });
});
