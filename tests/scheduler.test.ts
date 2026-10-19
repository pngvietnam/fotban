import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import type { PrismaClient } from "@prisma/client";
import type { SyncDatabase } from "../lib/sync-database";
import { dueMorningPlan, morningPlan, manualMorningPlan } from "../lib/scheduler-policy";
import { parseEnvironment } from "../lib/config";
import { ScheduledJobRunner } from "../services/scheduler";
import { SchedulerStore } from "../services/scheduler-store";
import { MorningBriefService } from "../services/morning-brief";
import { createSchedulerHandlers } from "../lib/scheduler-runtime";
import { jobOutcomeSchema, scheduledJobs, SchedulerError, type JobOutcome, type SchedulerHandlers, type SchedulerLock } from "../types/scheduler";
import { transferDatabase, resetTransferDatabase } from "./fixtures/transfer-store";
import { seedBriefNews } from "./fixtures/brief-news";

const now = new Date("2026-10-18T02:00:00Z");
const success = (): JobOutcome => ({ status: "SUCCEEDED", processed: 1, succeeded: 1, failed: 0 });
const ready = (): JobOutcome => ({ ...success(), brief: { id: "a0000000-0000-4000-8000-000000000001", revision: 1, status: "READY", cached: false } });
// Test-only lock models separate dedicated sessions. Actual advisory lock behavior
// is checked separately against PostgreSQL; no in-memory production lock exists.
class TestLock implements SchedulerLock {
  held = false; lost = false;
  assertHeld() { if (this.lost) throw new SchedulerError("LOCK_LOST"); }
  async acquire() { if (this.held) return null; this.held = true; return async () => { this.held = false; }; }
}
function handlers(): SchedulerHandlers { return Object.fromEntries(scheduledJobs.map((type) => [type, vi.fn(async () => type === "MORNING_BRIEF_GENERATE" ? ready() : success())])) as unknown as SchedulerHandlers; }

describe("explicit Vietnam schedule policy", () => {
  it("manual now uses the current Vietnam date/cutoff even before 08:00",()=>{
    const clock=new Date("2026-10-17T18:12:34.000Z");const manual=manualMorningPlan(clock,"development");
    expect(manual).toMatchObject({date:"2026-10-18",timezone:"Asia/Ho_Chi_Minh",scheduledAt:clock.toISOString(),refreshAt:clock.toISOString(),historical:false,phase:"all",mode:"MANUAL_NOW"});
    expect(manual.key).toBe(`manual-morning-v1:${clock.toISOString()}`);
  });
  it("manual mode is unavailable in production and does not change the scheduled plan",()=>{
    const before=morningPlan({}, {},now);expect(()=>manualMorningPlan(now,"production")).toThrow("MANUAL_LOCAL_ONLY");
    expect(manualMorningPlan(now,"development").key).not.toBe(before.key);expect(morningPlan({}, {},now)).toEqual(before);
    expect(before).toMatchObject({refreshAt:"2026-10-18T00:30:00.000Z",scheduledAt:"2026-10-18T01:00:00.000Z"});
  });
  it("resolves 08:00 Vietnam to 01:00 UTC regardless of host zone", () => { const plan = morningPlan({}, {}, now); expect(plan.scheduledAt).toBe("2026-10-18T01:00:00.000Z"); expect(plan.refreshAt).toBe("2026-10-18T00:30:00.000Z"); });
  it("is disabled by default and interprets false literally", () => { expect(dueMorningPlan({}, now)).toBeNull(); expect(parseEnvironment({ SCHEDULER_ENABLED: "false" }).SCHEDULER_ENABLED).toBe(false); expect(() => parseEnvironment({ SCHEDULER_ENABLED: "yes" })).toThrow(); });
  it("ticks refresh at 07:30 and generates only at/after 08:00", () => {
    const settings = { SCHEDULER_ENABLED: true };
    expect(dueMorningPlan(settings, new Date("2026-10-18T00:29Z"))).toBeNull();
    expect(dueMorningPlan(settings, new Date("2026-10-18T00:30Z"))?.phase).toBe("refresh");
    expect(dueMorningPlan(settings, new Date("2026-10-18T01:00Z"))?.phase).toBe("all");
    expect(() => morningPlan({}, {}, new Date("2026-10-18T00:59Z"))).toThrow("SCHEDULE_NOT_DUE");
  });
  it("honors configured hour and explicit UTC without a server offset", () => { expect(morningPlan({ date: "2026-10-17" }, { APP_TIMEZONE: "UTC", MORNING_BRIEF_HOUR: 9 }, now).scheduledAt).toBe("2026-10-17T09:00:00.000Z"); });
  it("backfills use stored data and a distinct stable historical key", () => { const plan = morningPlan({ date: "2026-10-17" }, {}, now); expect(plan.historical && plan.storedOnly).toBe(true); expect(plan.key).not.toBe(morningPlan({}, {}, now).key); expect(() => morningPlan({ date: "2026-10-19" }, {}, now)).toThrow(); });
});

describe("database-audited morning orchestration", () => {
  let db: PGlite; let database: SyncDatabase; let store: SchedulerStore; let lock: TestLock; let jobs: SchedulerHandlers;
  beforeAll(async () => { ({ db, database } = await transferDatabase()); }, 30000);
  afterAll(async () => { await db.close(); });
  beforeEach(async () => { await db.exec('TRUNCATE "JobRun","ProviderStatus","DailyBrief","Match","Video" CASCADE'); await resetTransferDatabase(db); store = new SchedulerStore(database); lock = new TestLock(); jobs = handlers(); });
  const plan = (options: Parameters<typeof morningPlan>[0] = {}) => morningPlan(options, {}, now);
  const runner = (overrides: { sleep?: (ms: number) => Promise<void> } = {}) => new ScheduledJobRunner(store, lock, jobs, { clock: () => now, ...overrides });

  it("manual acceptance runs all eight existing handlers with the captured cutoff",async()=>{
    const manual=manualMorningPlan(now,"test");expect((await runner().run(manual)).status).toBe("SUCCEEDED");
    for(const job of scheduledJobs)expect(jobs[job]).toHaveBeenCalledWith(expect.objectContaining({plan:manual}));
    expect((await runner().run(manual)).cached).toBe(true);expect(jobs.MATCH_SYNC).toHaveBeenCalledTimes(1);
  });
  it("manual acceptance records missing optional providers as degradation without changing normal status policy",async()=>{
    jobs.VIDEO_SYNC=async()=>({status:"SKIPPED",code:"NOT_CONFIGURED",processed:0,succeeded:0,failed:0});
    const manual=await runner().run(manualMorningPlan(now,"test"));expect(manual).toMatchObject({status:"PARTIAL",degradedDependencies:["VIDEO_SYNC"]});
    expect((await runner().run(plan())).status).toBe("SUCCEEDED");expect(jobs.MORNING_BRIEF_GENERATE).toHaveBeenCalledTimes(2);
  });
  it("manual M12 window is exactly 24 hours before current cutoff, remains READY and reuses identical inputs",async()=>{
    await seedBriefNews(db,database,1);const service=new MorningBriefService(database);const manual=manualMorningPlan(now,"test");
    jobs.MORNING_BRIEF_GENERATE=async({plan,now})=>{const r=await service.generate({date:plan.date,timezone:plan.timezone,asOf:plan.scheduledAt},now);expect(r.record.document).toMatchObject({windowStart:"2026-10-17T02:00:00.000Z",cutoffAt:"2026-10-18T02:00:00.000Z",upcomingEnd:"2026-10-19T02:00:00.000Z"});return {...success(),brief:{id:r.record.id,revision:r.record.revision,status:r.record.status as "READY",cached:r.cached}};};
    await runner().run(manual);await runner().run({...manual,rerun:true});expect((await database.query('SELECT status FROM "BriefRevision"'))).toEqual([{status:"READY"}]);
  });

  it("executes all existing-service handlers in dependency order and persists UTC audit/counters", async () => {
    const sequence: string[] = []; for (const type of scheduledJobs) jobs[type] = vi.fn(async () => { sequence.push(type); return type === "MORNING_BRIEF_GENERATE" ? ready() : success(); });
    const result = await runner().run(plan()); expect(result.status).toBe("SUCCEEDED"); expect(sequence).toEqual(scheduledJobs);
    const rows = await database.query<{ status: string; checkpoint: { scheduledAt: string; recordsSucceeded: number }; startedAt: Date; finishedAt: Date; recordsProcessed: number }>('SELECT * FROM "JobRun" WHERE "jobName"=\'scheduler:morning\'');
    expect(rows[0]).toMatchObject({ status: "SUCCEEDED", recordsProcessed: 8, checkpoint: { scheduledAt: "2026-10-18T01:00:00.000Z", recordsSucceeded: 8 } }); expect(new Date(rows[0].finishedAt).getTime()).toBeGreaterThanOrEqual(new Date(rows[0].startedAt).getTime());
    expect((await store.health()).lastSuccessful).not.toBeNull();
  });
  it("duplicate invocation reuses the workflow without another audit attempt or service call", async () => {
    await runner().run(plan()); expect(await runner().run(plan())).toMatchObject({ cached: true, status: "SUCCEEDED" });
    expect(jobs.MATCH_SYNC).toHaveBeenCalledTimes(1); expect((await database.query<{ n: number }>('SELECT count(*)::int AS n FROM "JobRun" WHERE "jobName"=\'scheduler:morning-attempt\''))[0].n).toBe(1);
  });
  it("protects concurrent invocations until the first worker releases its session", async () => {
    let resolve!: () => void; let entered!: () => void; const enteredPromise = new Promise<void>((r) => { entered = r; });
    jobs.MATCH_SYNC = vi.fn(async () => { entered(); await new Promise<void>((r) => { resolve = r; }); return success(); });
    const first = runner().run(plan()); await enteredPromise;
    expect(await runner().run(plan())).toMatchObject({ status: "SKIPPED", code: "WORKFLOW_RUNNING" }); resolve(); expect((await first).status).toBe("SUCCEEDED"); expect(jobs.MATCH_SYNC).toHaveBeenCalledTimes(1);
  });
  it("resumes 07:30 refresh at 08:00 without repeating successful upstream work", async () => {
    const refresh = plan({ phase: "refresh" }); expect((await runner().run(refresh)).status).toBe("PENDING"); expect(jobs.MORNING_BRIEF_GENERATE).not.toHaveBeenCalled();
    expect((await runner().run(plan())).status).toBe("SUCCEEDED"); expect(jobs.MATCH_SYNC).toHaveBeenCalledTimes(1); expect(jobs.MORNING_BRIEF_GENERATE).toHaveBeenCalledTimes(1);
  });
  it("rechecks downstream projections when a failed news refresh recovers", async () => {
    jobs.NEWS_SYNC = vi.fn(async () => { throw new SchedulerError("NETWORK"); });
    expect((await runner().run(plan({ phase: "refresh" }))).status).toBe("PENDING");
    jobs.NEWS_SYNC = vi.fn(async () => success()); expect((await runner().run(plan())).status).toBe("SUCCEEDED");
    expect(jobs.MATCH_SYNC).toHaveBeenCalledTimes(1); expect(jobs.ARTICLE_PROCESS).toHaveBeenCalledTimes(2); expect(jobs.RELIABILITY_UPDATE).toHaveBeenCalledTimes(2); expect(jobs.STORY_CLUSTER).toHaveBeenCalledTimes(2);
  });
  it("YouTube failure degrades to PARTIAL and still generates a READY brief", async () => {
    jobs.VIDEO_SYNC = vi.fn(async () => { throw new SchedulerError("RATE_LIMITED", true, 86400000); });
    const result = await runner().run(plan()); expect(result).toMatchObject({ status: "PARTIAL", degradedDependencies: ["VIDEO_SYNC"] }); expect(jobs.MORNING_BRIEF_GENERATE).toHaveBeenCalled(); expect(jobs.VIDEO_SYNC).toHaveBeenCalledTimes(1); expect((await store.health()).lastPartial).not.toBeNull();
  });
  it("one failed permitted news source is recorded without blocking processing/brief", async () => {
    jobs.NEWS_SYNC = vi.fn(async (): Promise<JobOutcome> => ({ status: "PARTIAL", processed: 2, succeeded: 1, failed: 1, code: "NEWS_SYNC_PARTIAL" }));
    expect((await runner().run(plan())).status).toBe("PARTIAL"); expect(jobs.ARTICLE_PROCESS).toHaveBeenCalled(); expect(jobs.MORNING_BRIEF_GENERATE).toHaveBeenCalled();
  });
  it("critical DB failure stops all downstream work and releases the lock", async () => {
    const broken: SyncDatabase = { query: async () => { throw new Error("private DB credentials"); }, transaction: database.transaction };
    const result = await new ScheduledJobRunner(new SchedulerStore(broken), lock, jobs, { clock: () => now }).run(plan()); expect(result).toMatchObject({ status: "FAILED", code: "DATABASE", auditPersisted: false }); expect(jobs.MATCH_SYNC).not.toHaveBeenCalled(); expect(lock.held).toBe(false); expect(JSON.stringify(result)).not.toContain("credentials");
  });
  it("retries explicit transient failure once with bounded backoff", async () => {
    let calls = 0; const sleep = vi.fn(async () => {});
    jobs.MATCH_SYNC = vi.fn(async () => { if (!calls++) throw new SchedulerError("TIMEOUT", true); return success(); });
    expect((await runner({ sleep }).run(plan())).status).toBe("SUCCEEDED"); expect(sleep).toHaveBeenCalledWith(500); expect(jobs.MATCH_SYNC).toHaveBeenCalledTimes(2);
    const row = await store.read("scheduler:MATCH_SYNC", plan()); expect(row?.attempts).toBe(2); expect(row?.checkpoint?.retryCodes).toEqual(["TIMEOUT"]);
  });
  it("permanent configuration/permission failure is not retried", async () => {
    jobs.NEWS_SYNC = vi.fn(async () => { throw new SchedulerError("PERMISSION_DENIED"); });
    expect((await runner().run(plan())).status).toBe("PARTIAL"); expect(jobs.NEWS_SYNC).toHaveBeenCalledTimes(1);
  });
  it("does not retry permanent credentials or partial provider batches between phases", async () => {
    jobs.MATCH_SYNC = vi.fn(async (): Promise<JobOutcome> => ({ ...success(), status: "PARTIAL", failed: 1, succeeded: 0, code: "MATCH_SYNC_PARTIAL" }));
    jobs.VIDEO_SYNC = vi.fn(async () => { throw new SchedulerError("UNAUTHORIZED"); });
    await runner().run(plan({ phase: "refresh" })); expect((await runner().run(plan())).status).toBe("PARTIAL");
    expect(jobs.MATCH_SYNC).toHaveBeenCalledTimes(1); expect(jobs.VIDEO_SYNC).toHaveBeenCalledTimes(1); expect(jobs.MORNING_BRIEF_GENERATE).toHaveBeenCalled();
  });
  it("persists long Retry-After and does not bypass it on a phase change or manual rerun", async () => {
    jobs.VIDEO_SYNC = vi.fn(async () => { throw new SchedulerError("RATE_LIMITED", true, 86400000); });
    await runner().run(plan({ phase: "refresh" })); await runner().run(plan()); await runner().run(plan({ rerun: true }));
    expect(jobs.VIDEO_SYNC).toHaveBeenCalledTimes(1); expect((await store.read("scheduler:VIDEO_SYNC", plan()))?.checkpoint?.retryNotBefore).toBe("2026-10-19T02:00:00.000Z");
  });
  it("exhausts transient retries and isolates failure", async () => {
    jobs.VIDEO_SYNC = vi.fn(async () => { throw new SchedulerError("NETWORK", true); }); const sleep = vi.fn(async () => {});
    expect((await runner({ sleep }).run(plan())).status).toBe("PARTIAL"); expect(jobs.VIDEO_SYNC).toHaveBeenCalledTimes(2); expect(sleep).toHaveBeenCalledTimes(1);
  });
  it("explicit manual rerun uses the same workflow and retains attempt history", async () => {
    await runner().run(plan()); await runner().run(plan({ rerun: true })); expect(jobs.MATCH_SYNC).toHaveBeenCalledTimes(2);
    expect((await store.read("scheduler:morning", plan()))?.attempts).toBe(2); expect((await database.query<{ n: number }>('SELECT count(*)::int AS n FROM "JobRun" WHERE "jobName"=\'scheduler:morning-attempt\''))[0].n).toBe(2);
  });
  it("recovers a failed brief under the same key without repeating completed sync", async () => {
    jobs.MORNING_BRIEF_GENERATE = vi.fn(async () => { throw new SchedulerError("JOB_FAILED"); }); expect((await runner().run(plan())).status).toBe("FAILED");
    jobs.MORNING_BRIEF_GENERATE = vi.fn(async () => ready()); expect((await runner().run(plan())).status).toBe("SUCCEEDED"); expect(jobs.MATCH_SYNC).toHaveBeenCalledTimes(1); expect((await store.health()).lastFailed).not.toBeNull(); expect((await store.health()).lastSuccessful).not.toBeNull();
  });
  it("recovers an abandoned RUNNING row only while holding the database-session boundary", async () => {
    const owner = "b0000000-0000-4000-8000-000000000001"; await store.begin("scheduler:morning", plan(), owner, now, { plan: plan() });
    expect((await runner().run(plan())).status).toBe("SUCCEEDED"); expect((await store.read("scheduler:morning", plan()))?.attempts).toBe(2);
  });
  it("lost lock aborts safely before the next job instead of reporting success", async () => {
    jobs.MATCH_SYNC = vi.fn(async () => { lock.lost = true; return success(); });
    expect(await runner().run(plan())).toMatchObject({ status: "FAILED", code: "LOCK_LOST", auditPersisted: false }); expect(jobs.NEWS_SYNC).not.toHaveBeenCalled();
  });
  it("backfill does not refresh current external/internal state", async () => {
    expect((await runner().run(plan({ date: "2026-10-17" }))).status).toBe("SUCCEEDED"); for (const type of scheduledJobs.slice(0, -1)) expect(jobs[type]).not.toHaveBeenCalled();
    expect(jobs.MORNING_BRIEF_GENERATE).toHaveBeenCalledWith(expect.objectContaining({ plan: expect.objectContaining({ scheduledAt: "2026-10-17T01:00:00.000Z" }) }));
  });
  it("stored-only mode skips external calls and a later normal run is not incorrectly cached", async () => {
    await runner().run(plan({ storedOnly: true })); expect(jobs.MATCH_SYNC).not.toHaveBeenCalled(); expect(jobs.ARTICLE_PROCESS).toHaveBeenCalled();
    expect((await runner().run(plan())).cached).toBe(false); expect(jobs.MATCH_SYNC).toHaveBeenCalledTimes(1);
  });
  it("records actual stale/unknown inputs beside the generated brief reference", async () => {
    await database.query(`INSERT INTO "ProviderStatus" (id,provider,capability,"lastSuccessAt","dataUpdatedAt",health,"updatedAt") VALUES ('c0000000-0000-4000-8000-000000000001','FOOTBALL_DATA','matches','2026-10-15T00:00Z','2026-10-14T23:00Z','WARNING',now())`);
    await runner().run(plan()); const job = await store.read("scheduler:MORNING_BRIEF_GENERATE", plan());
    expect(job?.checkpoint?.freshness).toEqual(expect.arrayContaining([expect.objectContaining({ provider: "FOOTBALL_DATA", stale: true, lastSuccessAt: "2026-10-15T00:00:00.000Z" }), expect.objectContaining({ provider: "YOUTUBE", stale: true, lastSuccessAt: null })]));
    expect(jobs.MORNING_BRIEF_GENERATE).toHaveBeenCalledWith(expect.objectContaining({ freshness: expect.any(Array) }));
  });
  it("rejects malformed output and a DRAFT brief cannot count as successful generation", async () => {
    jobs.NEWS_SYNC = vi.fn(async () => ({ ...success(), secret: "do-not-store" } as JobOutcome)); jobs.MORNING_BRIEF_GENERATE = vi.fn(async (): Promise<JobOutcome> => ({ ...ready(), brief: { ...ready().brief!, status: "DRAFT" } }));
    expect((await runner().run(plan())).status).toBe("FAILED"); const rows = await database.query('SELECT checkpoint FROM "JobRun"'); expect(JSON.stringify(rows)).not.toContain("do-not-store");
  });
  it("real M12 generation stays idempotent on manual rerun and never publishes", async () => {
    await seedBriefNews(db, database, 1); const service = new MorningBriefService(database);
    jobs.MORNING_BRIEF_GENERATE = async ({ plan, now }) => { const result = await service.generate({ date: plan.date, asOf: plan.scheduledAt }, now); return jobOutcomeSchema.parse({ ...success(), brief: { id: result.record.id, revision: result.record.revision, status: result.record.status, cached: result.cached } }); };
    expect((await runner().run(plan())).status).toBe("SUCCEEDED"); expect((await runner().run(plan({ rerun: true }))).status).toBe("SUCCEEDED");
    expect((await database.query<{ n: number }>('SELECT count(*)::int AS n FROM "BriefRevision"'))[0].n).toBe(1); expect((await database.query<{ status: string }>('SELECT status FROM "DailyBrief"'))[0].status).toBe("READY");
  });
  it("changed persisted inputs append a revision and preserve prior brief history", async () => {
    await seedBriefNews(db, database, 1); const service = new MorningBriefService(database);
    jobs.MORNING_BRIEF_GENERATE = async ({ plan, now }) => { const result = await service.generate({ date: plan.date, asOf: plan.scheduledAt }, now); return jobOutcomeSchema.parse({ ...success(), brief: { id: result.record.id, revision: result.record.revision, status: result.record.status, cached: result.cached } }); };
    await runner().run(plan()); await seedBriefNews(db, database, 2, "CLUB"); await runner().run(plan({ rerun: true }));
    expect((await database.query<{ revision: number; status: string }>('SELECT revision,status FROM "BriefRevision" ORDER BY revision'))).toEqual([{ revision: 1, status: "READY" }, { revision: 2, status: "READY" }]);
  });
  it("production adapters skip missing keys, keep restricted sources disabled, and do not invent freshness", async () => {
    const prisma = { $queryRawUnsafe: (sql: string, ...params: unknown[]) => database.query(sql, params), $transaction: (work: (tx: unknown) => Promise<unknown>) => database.transaction((tx) => work({ $queryRawUnsafe: (sql: string, ...params: unknown[]) => tx.query(sql, params) })) } as unknown as PrismaClient;
    const real = createSchedulerHandlers(prisma, parseEnvironment({})); const context = { plan: plan(), now, workflowId: "d0000000-0000-4000-8000-000000000001", freshness: [] };
    expect(await real.MATCH_SYNC(context)).toMatchObject({ status: "SKIPPED", code: "NOT_CONFIGURED" }); expect(await real.NEWS_SYNC(context)).toMatchObject({ status: "SKIPPED", code: "NOT_CONFIGURED" }); expect(await real.VIDEO_SYNC(context)).toMatchObject({ status: "SKIPPED", code: "NOT_CONFIGURED" });
    expect((await database.query<{ n: number }>('SELECT count(*)::int AS n FROM "NewsSource" WHERE "permissionStatus"<>\'ALLOWED\' AND enabled'))[0].n).toBe(0); expect((await store.freshness(now)).every((row) => row.lastSuccessAt === null)).toBe(true);
  });
  it("stored-only processing uses fallback even when a remote AI provider is configured", async () => {
    const source = await seedBriefNews(db, database, 1); await db.query('UPDATE "Article" SET "publicationStatus"=\'DRAFT\' WHERE id=$1', [source.articleId]);
    const prisma = { $queryRawUnsafe: (sql: string, ...params: unknown[]) => database.query(sql, params), $transaction: (work: (tx: unknown) => Promise<unknown>) => database.transaction((tx) => work({ $queryRawUnsafe: (sql: string, ...params: unknown[]) => tx.query(sql, params) })) } as unknown as PrismaClient;
    const remote = createSchedulerHandlers(prisma, parseEnvironment({ AI_PROVIDER: "remote", AI_ENDPOINT: "https://ai.example.test/process", AI_MODEL: "test-model", AI_API_KEY: "test-only" }));
    const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("External calls prohibited in stored-only mode"));
    try { await remote.ARTICLE_PROCESS({ plan: plan({ storedOnly: true }), now, workflowId: "d0000000-0000-4000-8000-000000000001", freshness: [] }); expect(fetch).not.toHaveBeenCalled(); } finally { fetch.mockRestore(); }
  });
});
