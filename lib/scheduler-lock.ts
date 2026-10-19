import { Client } from "pg";
import { SchedulerError, type SchedulerLock } from "../types/scheduler";

/** Dedicated session, never a pooled query: PostgreSQL releases the lock on disconnect.
 * The same global key covers all dates, including overlapping backfills/manual reruns.
 */
export class PostgresSchedulerLock implements SchedulerLock {
  private lost = false;
  constructor(private connectionString: string) {}
  assertHeld() { if (this.lost) throw new SchedulerError("LOCK_LOST"); }
  async acquire() {
    const client = new Client({ connectionString: this.connectionString, application_name: "fmb-scheduler-lock", connectionTimeoutMillis: 3000, statement_timeout: 3000, keepAlive: true });
    client.on("error", () => { this.lost = true; });
    try {
      await client.connect();
      const result = await client.query<{ locked: boolean }>("SELECT pg_try_advisory_lock(91531113) AS locked");
      if (!result.rows[0]?.locked) { await client.end(); return null; }
      this.lost = false;
      return async () => { try { await client.query("SELECT pg_advisory_unlock(91531113)"); } finally { await client.end(); } };
    } catch { await client.end().catch(() => {}); throw new SchedulerError("DATABASE"); }
  }
}
