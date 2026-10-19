import type { MatchProvider, MatchQuery } from "../types/match-provider";
import { safeProviderError } from "../providers/errors";
import { MatchSyncStore, type SyncPayload } from "./match-store";

export type SyncRequest = { mode: "competitions"; force?: boolean }
  | { mode: "teams"; competition: string; season?: number; force?: boolean }
  | { mode: "standings"; competition: string; season?: number; force?: boolean }
  | ({ mode: "matches"; force?: boolean } & MatchQuery);
export const syncTtlMs = { competitions: 24 * 3600000, teams: 24 * 3600000, matches: 6 * 3600000, standings: 24 * 3600000 };
type SafeLogger = { info(fields: Record<string, unknown>, event: string): void; error(fields: Record<string, unknown>, event: string): void };

/** options.ttlMs overrides the cache window for this call (the worker refreshes results more often). */
export async function syncMatches(provider: MatchProvider, store: MatchSyncStore, request: SyncRequest, log?: SafeLogger, options: { ttlMs?: number } = {}) {
  await store.ensureProvider(provider.id, JSON.stringify(provider.capabilities));
  const { force } = request;
  // Stable per resource/window key; a rerun updates the same logical job.
  const key = JSON.stringify({ provider: provider.id, mode: request.mode,
    competition: "competition" in request ? request.competition : null,
    season: "season" in request ? request.season ?? null : null,
    from: "dateFrom" in request ? request.dateFrom : null,
    to: "dateTo" in request ? request.dateTo : null });
  const job = await store.claim(key, options.ttlMs ?? syncTtlMs[request.mode], Boolean(force));
  if (job.cached) return { jobId: job.id, cached: true, recordsProcessed: 0, skipped: 0 };
  try {
    let payload: SyncPayload;
    let skipped: number;
    if (request.mode === "competitions") {
      const result = await provider.getCompetitions();
      payload = { mode: "competitions", items: result.items }; skipped = result.skipped;
    } else if (request.mode === "teams") {
      const result = await provider.getTeams(request.competition, request.season);
      payload = { mode: "teams", competition: result.competition, season: result.season, teams: result.teams.items }; skipped = result.teams.skipped;
    } else if (request.mode === "standings") {
      const result = await provider.getStandings(request.competition, request.season);
      payload = { mode: "standings", items: result.items }; skipped = result.skipped;
    } else {
      const result = await provider.getMatches(request);
      payload = { mode: "matches", items: result.items }; skipped = result.skipped;
    }
    const recordsProcessed = await store.complete(job, provider.id, payload, skipped, new Date());
    log?.info({ provider: provider.id, jobId: job.id, recordsProcessed, skipped }, "match.sync_completed");
    return { jobId: job.id, cached: false, recordsProcessed, skipped };
  } catch (error) {
    const safe = safeProviderError(error);
    await store.fail(job, provider.id, safe.code, safe.message);
    log?.error({ provider: provider.id, jobId: job.id, code: safe.code }, "match.sync_failed");
    throw safe;
  }
}
