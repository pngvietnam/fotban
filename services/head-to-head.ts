import type { SqlExecutor, SyncDatabase } from "../lib/sync-database";
import { HIGHLIGHTLY } from "../providers/highlightly/config";
import type { Meeting } from "../providers/highlightly/normalization";
import type { HeadToHeadApi } from "../providers/highlightly/provider";
import { ProviderError, safeProviderError } from "../providers/errors";
import { exhaustQuota, reserveQuota } from "./match-details";

/** Head-to-head reads have their own allowance; with details (60) and profiles (20) it stays inside the free 100/day. */
export const H2H_QUOTA_KEY = "HIGHLIGHTLY_H2H";
export const h2hDailyBudget = 10;
const provider = HIGHLIGHTLY.id;
const dayMs = 86400_000;
const refreshMs = 7 * dayMs;
const maxAttempts = 3;

/** Provider team ids as stored: the smaller id first, so both directions of a fixture share one row. */
export const pairKey = (one: string, two: string) => (BigInt(one) < BigInt(two) ? [one, two] : [two, one]) as [string, string];

export type H2HSyncResult = { examined: number; stored: number; requests: number; stopped: "DONE" | "QUOTA" | "ERROR"; error?: string };
type Candidate = { home: string; away: string };

/**
 * Pairs of clubs meeting soon or just met (kickoff from yesterday to four days ahead), soonest first, whose
 * provider team ids are known and whose meetings are missing or older than a week.
 */
export async function h2hCandidates(db: SqlExecutor, now: Date, limit = 10) {
  const rows = await db.query<Candidate>(`SELECT d."homeTeamExternalId" AS home,d."awayTeamExternalId" AS away FROM "Match" m JOIN "MatchDetailSync" d ON d."matchId"=m.id AND d.provider=$1
    WHERE d."homeTeamExternalId" IS NOT NULL AND d."awayTeamExternalId" IS NOT NULL AND m."kickoffAt" BETWEEN $2::timestamptz-interval '1 day' AND $2::timestamptz+interval '4 days'
    ORDER BY abs(extract(epoch FROM m."kickoffAt"-$2::timestamptz)),m.id`, [provider, now]);
  const known = await db.query<{ teamA: string; teamB: string; fetchedAt: string | null; attempts: number }>(`SELECT "teamA","teamB","fetchedAt",attempts FROM "HeadToHead" WHERE provider=$1`, [provider]);
  const state = new Map(known.map((row) => [`${row.teamA}:${row.teamB}`, row]));
  const seen = new Set<string>();
  return rows.flatMap((row) => {
    if (!/^\d{1,20}$/.test(row.home) || !/^\d{1,20}$/.test(row.away)) return [];
    const [teamA, teamB] = pairKey(row.home, row.away); const key = `${teamA}:${teamB}`;
    if (seen.has(key)) return [];
    seen.add(key);
    const stored = state.get(key);
    const fresh = stored?.fetchedAt && Date.parse(stored.fetchedAt) > now.getTime() - refreshMs;
    return fresh || (!stored?.fetchedAt && (stored?.attempts ?? 0) >= maxAttempts) ? [] : [{ teamA, teamB }];
  }).slice(0, limit);
}

/** Reads meetings for the candidate pairs until the allowance is used; never throws, reports why it stopped. */
export async function syncHeadToHead(database: SyncDatabase, api: HeadToHeadApi, now = new Date()): Promise<H2HSyncResult> {
  const result: H2HSyncResult = { examined: 0, stored: 0, requests: 0, stopped: "DONE" };
  try {
    for (const pair of await h2hCandidates(database, now)) {
      result.examined++;
      if (!(await reserveQuota(database, now, h2hDailyBudget, H2H_QUOTA_KEY))) throw new ProviderError("RATE_LIMITED");
      result.requests++;
      let meetings: Meeting[];
      try { meetings = await api.headToHead(pair.teamA, pair.teamB); }
      catch (error) {
        const code = safeProviderError(error).code;
        if (code !== "UNSUPPORTED" && code !== "MALFORMED_RESPONSE" && code !== "INVALID_JSON") throw error;
        await database.query(`INSERT INTO "HeadToHead" (provider,"teamA","teamB",attempts,"lastAttemptAt","lastError","updatedAt") VALUES ($1,$2,$3,1,$4::timestamptz,$5,$4::timestamptz)
          ON CONFLICT (provider,"teamA","teamB") DO UPDATE SET attempts="HeadToHead".attempts+1,"lastAttemptAt"=$4::timestamptz,"lastError"=$5,"updatedAt"=$4::timestamptz`, [provider, pair.teamA, pair.teamB, now, code]);
        continue;
      }
      await database.query(`INSERT INTO "HeadToHead" (provider,"teamA","teamB",meetings,"fetchedAt",attempts,"lastAttemptAt","lastError","updatedAt") VALUES ($1,$2,$3,$4::jsonb,$5::timestamptz,0,$5::timestamptz,NULL,$5::timestamptz)
        ON CONFLICT (provider,"teamA","teamB") DO UPDATE SET meetings=EXCLUDED.meetings,"fetchedAt"=EXCLUDED."fetchedAt",attempts=0,"lastAttemptAt"=EXCLUDED."lastAttemptAt","lastError"=NULL,"updatedAt"=EXCLUDED."updatedAt"`,
        [provider, pair.teamA, pair.teamB, JSON.stringify(meetings), now]);
      result.stored++;
    }
  } catch (error) {
    const safe = safeProviderError(error);
    if (safe.code === "RATE_LIMITED") { result.stopped = "QUOTA"; if (result.requests) await exhaustQuota(database, now, h2hDailyBudget, H2H_QUOTA_KEY).catch(() => undefined); }
    else { result.stopped = "ERROR"; result.error = safe.code; }
  }
  return result;
}

/** The provider's stored meetings for a match's two clubs, or null when this pair has not been read yet. */
export async function storedMeetings(db: SqlExecutor, matchId: string): Promise<{ meetings: Meeting[]; homeTeamId: string; externalId: string | null } | null> {
  const [ids] = await db.query<{ home: string | null; away: string | null; externalId: string | null }>(`SELECT "homeTeamExternalId" AS home,"awayTeamExternalId" AS away,"externalId" FROM "MatchDetailSync" WHERE "matchId"=$1::uuid AND provider=$2`, [matchId, provider]);
  if (!ids?.home || !ids.away || !/^\d{1,20}$/.test(ids.home) || !/^\d{1,20}$/.test(ids.away)) return null;
  const [teamA, teamB] = pairKey(ids.home, ids.away);
  const [row] = await db.query<{ meetings: Meeting[] }>(`SELECT meetings FROM "HeadToHead" WHERE provider=$1 AND "teamA"=$2 AND "teamB"=$3 AND "fetchedAt" IS NOT NULL`, [provider, teamA, teamB]);
  return row ? { meetings: Array.isArray(row.meetings) ? row.meetings : [], homeTeamId: ids.home, externalId: ids.externalId } : null;
}
