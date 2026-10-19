import { parseEnvironment } from "../lib/config";
import { createDatabaseClient } from "../lib/database-client";
import { prismaSyncDatabase } from "../lib/sync-database";
import { createLogger } from "../lib/logging";
import { morningPlan, dueMorningPlan, manualMorningPlan } from "../lib/scheduler-policy";
import { PostgresSchedulerLock } from "../lib/scheduler-lock";
import { createSchedulerHandlers } from "../lib/scheduler-runtime";
import { ScheduledJobRunner } from "../services/scheduler";
import { SchedulerStore } from "../services/scheduler-store";
import { scheduledJobs } from "../types/scheduler";

async function main() {
  const args = process.argv.slice(2); const command = args.shift() ?? "today";
  const flags = new Set(args);
  if (flags.size !== args.length || args.some((arg) => !["--refresh", "--stored-only", "--rerun", "--dry-run"].includes(arg)) || ["tick","now"].includes(command) && flags.has("--refresh")) throw new Error("ARGUMENTS");
  const env = parseEnvironment(process.env); const now = new Date();
  const plan = command === "now" ? manualMorningPlan(now) : command === "tick" ? dueMorningPlan(env, now) : command === "health" ? null : morningPlan({ date: command, phase: flags.has("--refresh") ? "refresh" : "all", storedOnly: flags.has("--stored-only"), rerun: flags.has("--rerun") }, env, now);
  if (command !== "health" && !plan) { console.log(JSON.stringify({ status: "SKIPPED", code: "DISABLED_OR_NOT_DUE" })); return; }
  if (plan) { plan.storedOnly ||= flags.has("--stored-only"); plan.rerun ||= flags.has("--rerun"); }
  if (flags.has("--dry-run")) { console.log(JSON.stringify({ dryRun: true, plan, jobs: plan?.phase === "refresh" ? scheduledJobs.slice(0, -1) : scheduledJobs, publication: "EXPLICIT_ONLY" }, null, 2)); return; }
  if (!env.DATABASE_URL) throw new Error("DATABASE_REQUIRED");
  if(command==="now" && !["localhost","127.0.0.1","[::1]"].includes(new URL(env.DATABASE_URL).hostname)) throw new Error("MANUAL_LOCAL_DATABASE_REQUIRED");
  const db = createDatabaseClient(env.DATABASE_URL);
  try {
    const store = new SchedulerStore(prismaSyncDatabase(db));
    if (command === "health") { console.log(JSON.stringify(await store.health(), null, 2)); return; }
    const result = await new ScheduledJobRunner(store, new PostgresSchedulerLock(env.DATABASE_URL), createSchedulerHandlers(db, env, createLogger(env.LOG_LEVEL)), { log: createLogger(env.LOG_LEVEL) }).run(plan!);
    console.log(JSON.stringify(result, null, 2));
    if (result.status === "FAILED") process.exitCode = 1;
    else if (result.status === "PARTIAL") process.exitCode = 2;
  } finally { await db.$disconnect(); }
}
void main().catch(() => { console.error("Scheduler failed. Check database/migrations, due date and server configuration. Usage: scheduler:morning -- today|YYYY-MM-DD|now|tick|health [--refresh] [--stored-only] [--rerun] [--dry-run]. The now mode requires non-production NODE_ENV and loopback PostgreSQL. Raw errors withheld."); process.exitCode = 1; });
