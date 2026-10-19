import { randomUUID } from "node:crypto";
import { jobOutcomeSchema, scheduledJobs, SchedulerError, type SchedulerHandlers, type SchedulerLock, type SchedulerLog, type SchedulerPlan, type SchedulerStatus } from "../types/scheduler";
import { schedulerPolicy } from "../lib/scheduler-policy";
import { SchedulerStore, scheduledJobName, type StoredStep } from "./scheduler-store";

const workflowName = "scheduler:morning";
const external = new Set(["MATCH_SYNC", "NEWS_SYNC", "VIDEO_SYNC"]);
const failure = (error: unknown) => error instanceof SchedulerError ? error : new SchedulerError("JOB_FAILED");

/** Orchestration only. Handlers own all provider/domain logic. Scheduling supplies
 * a stable cutoff, never the machine's local zone or the invocation's wall time.
 */
export class ScheduledJobRunner {
  constructor(private store: SchedulerStore, private lock: SchedulerLock, private handlers: SchedulerHandlers,
    private options: { log?: SchedulerLog; clock?: () => Date; sleep?: (ms: number) => Promise<void> } = {}) {}
  private now() { return this.options.clock?.() ?? new Date(); }
  private async databaseReady() { try { await this.store.db.query("SELECT 1 AS healthy"); } catch { throw new SchedulerError("DATABASE"); } }
  async run(plan: SchedulerPlan) {
    const release = await this.lock.acquire();
    if (!release) return { status: "SKIPPED" as const, code: "WORKFLOW_RUNNING", cached: false };
    const owner = randomUUID(); const started = this.now(); let workflowId: string | undefined;
    const steps: StoredStep[] = []; let freshness = await this.store.freshness(started).catch(() => []);
    try {
      this.lock.assertHeld?.();
      await this.databaseReady();
      const previous = await this.store.read(workflowName, plan);
      const previousPlan = previous?.checkpoint?.plan as SchedulerPlan | undefined;
      const sameMode = previousPlan?.storedOnly === plan.storedOnly;
      if (!plan.rerun && sameMode && previous && ["SUCCEEDED", "PARTIAL"].includes(previous.status)) return { status: previous.status, workflowId: previous.id, cached: true };
      const run = await this.store.begin(workflowName, plan, owner, started, { plan, scheduledAt: plan.scheduledAt, steps: [] });
      workflowId = run.id;
      this.options.log?.info({ workflowId, logicalDate: plan.date, scheduledAt: plan.scheduledAt, status: "RUNNING" }, "scheduler.started");
      for (const type of scheduledJobs) {
        if (type === "MORNING_BRIEF_GENERATE" && plan.phase === "refresh") break;
        this.lock.assertHeld?.();
        // Verify the critical dependency even when an adapter swallows its own error.
        await this.databaseReady();
        const old = await this.store.read(scheduledJobName(type), plan);
        const parsed = jobOutcomeSchema.safeParse(old?.checkpoint?.outcome);
        const changedMode = external.has(type) && !sameMode;
        const oldCodes = old?.checkpoint?.retryCodes;
        const oldCode = Array.isArray(oldCodes) ? oldCodes.at(-1) : undefined;
        const retryNotBefore = old?.checkpoint?.retryNotBefore;
        if (type !== "MORNING_BRIEF_GENERATE" && old?.status === "FAILED" && typeof retryNotBefore === "string" && Date.parse(retryNotBefore) > this.now().getTime()) {
          steps.push({ type, status: "FAILED", code: String(oldCode), cached: true }); continue;
        }
        // Completed optional partial batches have their own provider-level
        // cooldowns/errors. Do not blindly retry their successful sources at the
        // second phase, or retry permanent failures without an operator rerun.
        if (!plan.rerun && !changedMode && type !== "MORNING_BRIEF_GENERATE") {
          if (old?.status === "PARTIAL" && external.has(type) && parsed.success) { steps.push({ type, status: "PARTIAL", outcome: parsed.data, cached: true }); continue; }
          if (old?.status === "FAILED" && ["CONFIGURATION", "PERMISSION_DENIED", "UNAUTHORIZED", "JOB_FAILED"].includes(String(oldCode))) { steps.push({ type, status: "FAILED", code: String(oldCode), cached: true }); continue; }
        }
        // Recheck internal projections after a resumed/recovered source sync; a
        // formerly failed news source may have supplied new articles. Their own
        // content hashes avoid repeated AI calls/revisions. Cache external jobs.
        if (!plan.rerun && !changedMode && external.has(type) && old?.status === "SUCCEEDED" && parsed.success) {
          steps.push({ type, status: old.status, outcome: parsed.data, cached: true }); continue;
        }
        let attempt = 0; const retryCodes: string[] = [];
        for (;;) {
          attempt++;
          const job = await this.store.begin(scheduledJobName(type), plan, owner, this.now(), { scheduledAt: type === "MORNING_BRIEF_GENERATE" ? plan.scheduledAt : plan.refreshAt, workflowId, retryCodes });
          this.options.log?.info({ workflowId, jobId: job.id, jobType: type, logicalDate: plan.date, attempt, status: "RUNNING" }, "scheduler.job_started");
          try {
            if (type === "MORNING_BRIEF_GENERATE") freshness = await this.store.freshness(this.now());
            const skipped = plan.historical && type !== "MORNING_BRIEF_GENERATE" ? "HISTORICAL_STORED_DATA" : plan.storedOnly && external.has(type) ? "STORED_DATA_ONLY" : null;
            const outcome = jobOutcomeSchema.parse(skipped ? { status: "SKIPPED", code: skipped } : await this.handlers[type]({ plan, workflowId, freshness, now: this.now() }));
            this.lock.assertHeld?.();
            await this.databaseReady();
            if (type === "MORNING_BRIEF_GENERATE" && (!outcome.brief || !["READY", "PUBLISHED"].includes(outcome.brief.status))) throw new SchedulerError("NOT_READY");
            await this.store.finish(job.id, owner, outcome.status, this.now(), { workflowId, scheduledAt: type === "MORNING_BRIEF_GENERATE" ? plan.scheduledAt : plan.refreshAt, outcome, retryCodes, ...(type === "MORNING_BRIEF_GENERATE" ? { freshness } : {}) }, outcome.processed, outcome.code);
            steps.push({ type, status: outcome.status, outcome });
            this.options.log?.info({ workflowId, jobId: job.id, jobType: type, logicalDate: plan.date, status: outcome.status, recordsProcessed: outcome.processed, recordsSucceeded: outcome.succeeded, recordsFailed: outcome.failed, code: outcome.code }, "scheduler.job_finished");
            break;
          } catch (error) {
            this.lock.assertHeld?.();
            await this.databaseReady();
            const safe = failure(error); retryCodes.push(safe.code);
            const retryNotBefore = Number.isFinite(safe.retryAfterMs) && safe.retryAfterMs > 0 ? new Date(Math.min(8640000000000000, this.now().getTime() + safe.retryAfterMs)).toISOString() : undefined;
            await this.store.finish(job.id, owner, "FAILED", this.now(), { workflowId, scheduledAt: type === "MORNING_BRIEF_GENERATE" ? plan.scheduledAt : plan.refreshAt, retryCodes, retryNotBefore }, 0, safe.code);
            this.options.log?.error({ workflowId, jobId: job.id, jobType: type, logicalDate: plan.date, status: "FAILED", code: safe.code, attempt }, "scheduler.job_failed");
            if (safe.transient && attempt < schedulerPolicy.attempts && safe.retryAfterMs <= schedulerPolicy.maximumBackoffMs) {
              await (this.options.sleep ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms))))(Math.max(safe.retryAfterMs, schedulerPolicy.backoffMs * 2 ** (attempt - 1)));
              continue;
            }
            if (type === "MORNING_BRIEF_GENERATE" || ["DATABASE", "LOCK_LOST"].includes(safe.code)) throw safe;
            steps.push({ type, status: "FAILED", code: safe.code }); break;
          }
        }
      }
      const processed = steps.reduce((sum, item) => sum + (item.outcome?.processed ?? 0), 0);
      const failed = steps.filter((item) => ["FAILED", "PARTIAL"].includes(item.status) || plan.mode==="MANUAL_NOW" && item.status==="SKIPPED" && ["NOT_CONFIGURED","NO_PERMITTED_SOURCES","VIDEO_DEFERRED"].includes(item.outcome?.code??""));
      const status: SchedulerStatus = plan.phase === "refresh" ? "PENDING" : failed.length ? "PARTIAL" : "SUCCEEDED";
      const checkpoint = { plan, scheduledAt: plan.scheduledAt, steps, freshness, recordsProcessed: processed, recordsSucceeded: steps.reduce((sum, item) => sum + (item.outcome?.succeeded ?? 0), 0), recordsFailed: steps.reduce((sum, item) => sum + (item.outcome?.failed ?? (item.status === "FAILED" ? 1 : 0)), 0), degradedDependencies: failed.map((item) => item.type) };
      this.lock.assertHeld?.();
      await this.store.complete(workflowId, plan, owner, started, this.now(), status, checkpoint, processed);
      this.options.log?.info({ workflowId, logicalDate: plan.date, status, recordsProcessed: processed, recordsFailed: checkpoint.recordsFailed }, "scheduler.finished");
      return { status, workflowId, cached: false, ...checkpoint };
    } catch (error) {
      const safe = failure(error);
      const checkpoint = { plan, scheduledAt: plan.scheduledAt, steps, freshness, errorCode: safe.code };
      // When the database itself is down, persistence is impossible. Do not claim an
      // audit was saved; its RUNNING row is recovered under the next session lock.
      let auditPersisted = false;
      if (workflowId) try {
        this.lock.assertHeld?.();
        await this.store.complete(workflowId, plan, owner, started, this.now(), "FAILED", checkpoint, 0, safe.code); auditPersisted = true;
      } catch { /* Safe process exit; existing service operations are idempotent. */ }
      this.options.log?.error({ workflowId, logicalDate: plan.date, status: "FAILED", code: safe.code, auditPersisted }, "scheduler.failed");
      return { status: "FAILED" as const, workflowId, code: safe.code, auditPersisted, cached: false };
    } finally { await release(); }
  }
}
