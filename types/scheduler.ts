import { z } from "zod";

export const scheduledJobs = ["MATCH_SYNC", "NEWS_SYNC", "ARTICLE_PROCESS", "RELIABILITY_UPDATE", "STORY_CLUSTER", "TRANSFER_UPDATE", "VIDEO_SYNC", "MORNING_BRIEF_GENERATE"] as const;
export type ScheduledJob = typeof scheduledJobs[number];
export type SchedulerStatus = "PENDING" | "RUNNING" | "SUCCEEDED" | "PARTIAL" | "FAILED" | "SKIPPED";
export type SchedulerPhase = "refresh" | "all";
export const jobOutcomeSchema = z.object({
  status: z.enum(["SUCCEEDED", "PARTIAL", "SKIPPED"]),
  processed: z.number().int().nonnegative().default(0),
  succeeded: z.number().int().nonnegative().default(0),
  failed: z.number().int().nonnegative().default(0),
  code: z.string().regex(/^[A-Z][A-Z0-9_]{0,79}$/).optional(),
  // Deliberately narrow: no arbitrary provider payload, URL, error or secret metadata.
  brief: z.object({ id: z.uuid(), revision: z.number().int().positive(), status: z.enum(["DRAFT", "READY", "PUBLISHED", "NEEDS_REVIEW", "FAILED"]), cached: z.boolean() }).optional(),
}).strict();
export type JobOutcome = z.infer<typeof jobOutcomeSchema>;
export type Freshness = { provider: string; lastSuccessAt: string | null; dataUpdatedAt: string | null; stale: boolean; health: string }[];
export type SchedulerPlan = { date: string; timezone: "Asia/Ho_Chi_Minh" | "Asia/Bangkok" | "UTC"; scheduledAt: string; refreshAt: string; key: string; historical: boolean; phase: SchedulerPhase; storedOnly: boolean; rerun: boolean; mode?: "MANUAL_NOW" };
export type JobContext = { plan: SchedulerPlan; workflowId: string; freshness: Freshness; now: Date };
export type SchedulerHandlers = Record<ScheduledJob, (context: JobContext) => Promise<JobOutcome>>;
export interface SchedulerLock { acquire(): Promise<(() => Promise<void>) | null>; assertHeld?(): void }
export type SchedulerLog = { info(fields: Record<string, unknown>, event: string): void; error(fields: Record<string, unknown>, event: string): void };

export class SchedulerError extends Error {
  constructor(readonly code: "TIMEOUT" | "NETWORK" | "UPSTREAM" | "RATE_LIMITED" | "CONFIGURATION" | "PERMISSION_DENIED" | "UNAUTHORIZED" | "DATABASE" | "JOB_FAILED" | "NOT_READY" | "LOCK_LOST", readonly transient = false, readonly retryAfterMs = 0) { super(code); }
}
