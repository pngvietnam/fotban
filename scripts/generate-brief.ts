import { z } from "zod";
import { parseEnvironment } from "../lib/config";
import { createDatabaseClient } from "../lib/database-client";
import { createLogger } from "../lib/logging";
import { prismaSyncDatabase } from "../lib/sync-database";
import { briefDate } from "../lib/brief-policy";
import { MorningBriefService } from "../services/morning-brief";
import { BriefQueryService } from "../services/brief-query";

async function main() {
  const args = process.argv.slice(2); const dateArg = args.shift() ?? "today";
  const options: Record<string, string | number> = {};
  while (args.length) {
    const key = args.shift(); const value = args.shift();
    if (!key || !value || !["--as-of", "--timezone", "--lookback", "--upcoming", "--cutoff-hour"].includes(key) || key in options) throw new Error("ARGUMENTS");
    options[key] = value;
  }
  const timezone = String(options["--timezone"] ?? "Asia/Ho_Chi_Minh");
  const date = ["today", "smoke"].includes(dateArg) ? briefDate(new Date(), timezone) : z.iso.date().parse(dateArg);
  const env = parseEnvironment(process.env); if (!env.DATABASE_URL) throw new Error("DATABASE_REQUIRED");
  const db = createDatabaseClient(env.DATABASE_URL);
  try {
    const database = prismaSyncDatabase(db);
    const result = await new MorningBriefService(database, createLogger(env.LOG_LEVEL)).generate({ date, timezone, ...(options["--as-of"] ? { asOf: options["--as-of"] } : {}), ...(options["--lookback"] ? { lookbackHours: Number(options["--lookback"]) } : {}), ...(options["--upcoming"] ? { upcomingHours: Number(options["--upcoming"]) } : {}), ...(options["--cutoff-hour"] ? { cutoffHour: Number(options["--cutoff-hour"]) } : {}) });
    const sample = await new BriefQueryService(database).getRevision(result.record.id, { internal: true });
    if (!sample) throw new Error("BRIEF_PREVIEW_UNAVAILABLE");
    console.log(JSON.stringify({ cached: result.cached, ...sample }, null, 2));
  } finally { await db.$disconnect(); }
}
void main().catch(() => { console.error("Brief generation failed. Check database, target date/cutoff, migrations and current source gates. Usage: brief:generate -- today|YYYY-MM-DD|smoke [--as-of UTC-ISO] [--timezone Asia/Ho_Chi_Minh] [--lookback 24] [--upcoming 24] [--cutoff-hour 8]. Raw errors withheld."); process.exitCode = 1; });
