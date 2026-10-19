import "server-only";
import { getDatabase } from "../lib/db";
import { logger } from "../lib/logger";
import { prismaSyncDatabase } from "../lib/sync-database";

/** Crest links by club name or short name, for views that only carry names (the frozen Morning Brief). */
export async function crestsByName(names: string[]) {
  const unique = [...new Set(names.map((name) => name.trim()).filter(Boolean))].slice(0, 100);
  const crests: Record<string, string> = {};
  const db = getDatabase();
  if (!unique.length || !db) return crests;
  try {
    const rows = await prismaSyncDatabase(db).query<{ name: string; shortName: string | null; crest: string }>('SELECT name,"shortName",\"externalCrestUrl\" AS crest FROM "Club" WHERE "externalCrestUrl" IS NOT NULL AND (name=ANY($1::text[]) OR "shortName"=ANY($1::text[]))', [unique]);
    for (const row of rows) for (const key of [row.name, row.shortName]) if (key && unique.includes(key)) crests[key] = row.crest;
  } catch { logger.warn({ event: "crest_lookup_unavailable" }); }
  return crests;
}
