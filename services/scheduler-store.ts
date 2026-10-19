import { randomUUID } from "node:crypto";
import type { SqlExecutor, SyncDatabase } from "../lib/sync-database";
import { schedulerPolicy } from "../lib/scheduler-policy";
import type { Freshness, JobOutcome, ScheduledJob, SchedulerPlan, SchedulerStatus } from "../types/scheduler";

type JobRow = { id: string; status: SchedulerStatus; attempts: number; checkpoint: Record<string, unknown> | null };
/** All mutations require the runner's dedicated PostgreSQL advisory lock. Existing
 * RUNNING rows can be recovered after a crash because their old session is gone.
 */
export class SchedulerStore {
  constructor(readonly db: SyncDatabase) {}
  async read(name: string, plan: SchedulerPlan) { return (await this.db.query<JobRow>('SELECT id,status,attempts,checkpoint FROM "JobRun" WHERE "jobName"=$1 AND "logicalKey"=$2', [name, plan.key]))[0] ?? null; }
  async begin(name: string, plan: SchedulerPlan, owner: string, now: Date, checkpoint: unknown) {
    const result = await this.db.query<JobRow>(`INSERT INTO "JobRun" (id,"jobName","logicalKey","logicalDate",status,"startedAt",attempts,"correlationId","leaseOwner",checkpoint,"updatedAt") VALUES ($1::uuid,$2,$3,$4::date,'RUNNING',$5::timestamptz,1,$6::uuid,$6,$7::jsonb,$5::timestamptz) ON CONFLICT ("jobName","logicalKey") DO UPDATE SET status='RUNNING',"startedAt"=excluded."startedAt","finishedAt"=NULL,attempts="JobRun".attempts+1,"leaseOwner"=excluded."leaseOwner","errorCode"=NULL,"errorSafe"=NULL,checkpoint=excluded.checkpoint,"updatedAt"=excluded."updatedAt" RETURNING id,status,attempts,checkpoint`, [randomUUID(), name, plan.key, plan.date, now, owner, JSON.stringify(checkpoint)]);
    return result[0];
  }
  async finish(id: string, owner: string, status: SchedulerStatus, now: Date, checkpoint: unknown, processed = 0, code?: string, tx: SqlExecutor = this.db) {
    const rows = await tx.query<{ id: string }>('UPDATE "JobRun" SET status=$3::"JobStatus","finishedAt"=$4::timestamptz,"recordsProcessed"=$5::integer,"errorCode"=$6,"errorSafe"=$6,checkpoint=$7::jsonb,"leaseOwner"=NULL,"updatedAt"=$4::timestamptz WHERE id=$1::uuid AND "leaseOwner"=$2 RETURNING id', [id, owner, status, now, processed, code ?? null, JSON.stringify(checkpoint)]);
    if (!rows.length) throw new Error("SCHEDULER_OWNER_LOST");
  }
  async freshness(now: Date): Promise<Freshness> {
    const rows = await this.db.query<{ provider: string; lastSuccessAt: Date | null; dataUpdatedAt: Date | null; health: string }>('SELECT provider,"lastSuccessAt","dataUpdatedAt",health FROM "ProviderStatus" ORDER BY provider');
    const observed = rows.map((row) => ({ provider: row.provider, lastSuccessAt: row.lastSuccessAt ? new Date(row.lastSuccessAt).toISOString() : null, dataUpdatedAt: row.dataUpdatedAt ? new Date(row.dataUpdatedAt).toISOString() : null, health: row.health, stale: !row.lastSuccessAt || now.getTime() - new Date(row.lastSuccessAt).getTime() > schedulerPolicy.freshnessHours * 3600000 || new Date(row.lastSuccessAt).getTime() > now.getTime() }));
    for (const provider of ["FOOTBALL_DATA", "YOUTUBE"]) if (!observed.some((row) => row.provider === provider)) observed.push({ provider, lastSuccessAt: null, dataUpdatedAt: null, health: "UNCONFIGURED", stale: true });
    if (!observed.some((row) => row.provider.startsWith("NEWS:"))) observed.push({ provider: "NEWS", lastSuccessAt: null, dataUpdatedAt: null, health: "UNKNOWN", stale: true });
    return observed;
  }
  async health() {
    const rows = await this.db.query<{ status: string; finishedAt: Date; checkpoint: unknown }>(`SELECT DISTINCT ON (status) status,"finishedAt",checkpoint FROM "JobRun" WHERE "jobName"='scheduler:morning-attempt' AND status IN ('SUCCEEDED','PARTIAL','FAILED') ORDER BY status,"finishedAt" DESC`);
    return { lastSuccessful: rows.find((r) => r.status === "SUCCEEDED") ?? null, lastPartial: rows.find((r) => r.status === "PARTIAL") ?? null, lastFailed: rows.find((r) => r.status === "FAILED") ?? null };
  }
  async complete(id: string, plan: SchedulerPlan, owner: string, startedAt: Date, finishedAt: Date, status: SchedulerStatus, checkpoint: unknown, processed: number, code?: string) {
    await this.db.transaction(async (tx) => {
      await this.finish(id, owner, status, finishedAt, checkpoint, processed, code, tx);
      await tx.query(`INSERT INTO "JobRun" (id,"jobName","logicalKey","logicalDate",status,"startedAt","finishedAt",attempts,"correlationId","recordsProcessed","errorCode","errorSafe",checkpoint,"updatedAt") VALUES ($1::uuid,'scheduler:morning-attempt',$2,$3::date,$4::"JobStatus",$5::timestamptz,$6::timestamptz,1,$7::uuid,$8::integer,$9,$9,$10::jsonb,$6::timestamptz)`, [randomUUID(), `${plan.key}:${owner}`, plan.date, status, startedAt, finishedAt, owner, processed, code ?? null, JSON.stringify(checkpoint)]);
    });
  }
}
export const scheduledJobName = (type: ScheduledJob) => `scheduler:${type}`;
export type StoredStep = { type: ScheduledJob; status: SchedulerStatus; outcome?: JobOutcome; cached?: boolean; code?: string };
