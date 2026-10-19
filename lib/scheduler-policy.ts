import { z } from "zod";
import { briefDate } from "./brief-policy";
import type { SchedulerPhase, SchedulerPlan } from "../types/scheduler";

export const schedulerPolicy = { refreshLeadMinutes: 30, attempts: 2, backoffMs: 500, maximumBackoffMs: 5000, freshnessHours: 36, batchSize: 50 } as const;
export const schedulerSettingsSchema = z.object({
  APP_TIMEZONE: z.enum(["Asia/Ho_Chi_Minh", "Asia/Bangkok", "UTC"]).default("Asia/Ho_Chi_Minh"),
  MORNING_BRIEF_HOUR: z.coerce.number().int().min(1).max(23).default(8),
  SCHEDULER_ENABLED: z.preprocess((v) => v === "true" ? true : v === "false" || v === "" || v === undefined ? false : v, z.boolean()).default(false),
});
export function morningPlan(input: { date?: string; phase?: SchedulerPhase; storedOnly?: boolean; rerun?: boolean }, settings: z.input<typeof schedulerSettingsSchema> = {}, now = new Date()): SchedulerPlan {
  const config = schedulerSettingsSchema.parse(settings);
  const date = !input.date || input.date === "today" ? briefDate(now, config.APP_TIMEZONE) : z.iso.date().parse(input.date);
  const offset = config.APP_TIMEZONE === "UTC" ? 0 : 7;
  const scheduledAt = new Date(Date.parse(`${date}T00:00:00Z`) + (config.MORNING_BRIEF_HOUR - offset) * 3600000).toISOString();
  const refreshAt = new Date(Date.parse(scheduledAt) - schedulerPolicy.refreshLeadMinutes * 60000).toISOString();
  const phase = input.phase ?? "all";
  if (Date.parse(phase === "refresh" ? refreshAt : scheduledAt) > now.getTime()) throw new Error("SCHEDULE_NOT_DUE");
  const historical = date < briefDate(now, config.APP_TIMEZONE);
  return { date, timezone: config.APP_TIMEZONE, scheduledAt, refreshAt, key: `morning-v1:${config.APP_TIMEZONE}:${scheduledAt}`, historical, phase, storedOnly: Boolean(input.storedOnly) || historical, rerun: Boolean(input.rerun) };
}
export function dueMorningPlan(settings: z.input<typeof schedulerSettingsSchema>, now = new Date()): SchedulerPlan | null {
  const config = schedulerSettingsSchema.parse(settings); if (!config.SCHEDULER_ENABLED) return null;
  try { return morningPlan({}, config, now); }
  catch { try { return morningPlan({ phase: "refresh" }, config, now); } catch { return null; } }
}
/** Explicit local acceptance only. Never called by tick or the production morning plan. */
export function manualMorningPlan(now = new Date(), environment = process.env.NODE_ENV): SchedulerPlan {
  if (environment === "production" || !Number.isFinite(now.getTime())) throw new Error("MANUAL_LOCAL_ONLY");
  const scheduledAt=now.toISOString();
  return {date:briefDate(now,"Asia/Ho_Chi_Minh"),timezone:"Asia/Ho_Chi_Minh",scheduledAt,refreshAt:scheduledAt,key:`manual-morning-v1:${scheduledAt}`,historical:false,phase:"all",storedOnly:false,rerun:false,mode:"MANUAL_NOW"};
}
