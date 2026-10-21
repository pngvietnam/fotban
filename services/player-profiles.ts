import type { SqlExecutor, SyncDatabase } from "../lib/sync-database";
import { foldName, sameName } from "../lib/match-detail-matching";
import { HIGHLIGHTLY } from "../providers/highlightly/config";
import type { PlayerProfileApi } from "../providers/highlightly/provider";
import { ProviderError, safeProviderError } from "../providers/errors";
import { exhaustQuota, reserveQuota } from "./match-details";

/** Profile reads have their own small daily allowance so match details keep theirs (both share the free 100/day). */
export const PROFILE_QUOTA_KEY = "HIGHLIGHTLY_PROFILES";
export const profileDailyBudget = 30;
const provider = HIGHLIGHTLY.id;
const dayMs = 86400_000;
const refreshMs = 3 * dayMs;
const retryMs = 3 * dayMs;
const maxAttempts = 3;

export type ProfileSyncResult = { examined: number; stored: number; unmatched: number; requests: number; stopped: "DONE" | "QUOTA" | "ERROR"; error?: string };
type Candidate = { id: string; name: string; birthDate: string | null; externalId: string | null; attempts: number | null };

/**
 * Players the press is writing about in transfer stories (last 7 days), newest story first, whose profile
 * is missing or older than three days; a player that could not be matched is retried only every three days.
 */
export async function profileCandidates(db: SqlExecutor, now: Date, limit = 15) {
  return db.query<Candidate>(`SELECT p.id,p.name,p."birthDate"::text AS "birthDate",pp."externalId",pp.attempts FROM "Player" p
    LEFT JOIN "PlayerProfile" pp ON pp."playerId"=p.id AND pp.provider=$1
    CROSS JOIN LATERAL (SELECT max(a."publishedAt") AS latest FROM "ArticleEntity" e JOIN "Article" a ON a.id=e."articleId" JOIN "FeedCard" f ON f."articleId"=a.id
      WHERE e."playerId"=p.id AND f.status='PUBLISHED' AND f."storyType"='TRANSFER' AND a."publishedAt">$2::timestamptz-interval '7 days') m
    WHERE m.latest IS NOT NULL
      AND (pp."fetchedAt" IS NULL OR pp."fetchedAt"<$2::timestamptz-($3::bigint * interval '1 millisecond'))
      AND (pp."playerId" IS NULL OR (pp."lastAttemptAt" IS NULL OR pp."lastAttemptAt"<$2::timestamptz-($4::bigint * interval '1 millisecond')) AND (pp.attempts<$5 OR pp."externalId" IS NOT NULL))
    ORDER BY m.latest DESC LIMIT $6`, [provider, now, refreshMs, retryMs, maxAttempts, limit]);
}

/** The one search hit that is this player (same name, either spelling); with namesakes, the one whose first name matches; null when none or still ambiguous. */
export function pickPlayer(results: { id: string; name: string; fullName: string | null }[], name: string) {
  const same = results.filter((row) => sameName(row.fullName ?? row.name, name) || sameName(row.name, name));
  if (same.length <= 1) return same[0] ?? null;
  const first = foldName(name).split(/[^a-z0-9]+/).filter(Boolean)[0];
  const byFirst = same.filter((row) => foldName(row.fullName ?? row.name).split(/[^a-z0-9]+/).filter(Boolean)[0] === first);
  return byFirst.length === 1 ? byFirst[0] : null;
}

async function remember(db: SqlExecutor, playerId: string, now: Date, fields: { externalId?: string | null; error?: string | null }) {
  await db.query(`INSERT INTO "PlayerProfile" ("playerId",provider,"externalId",attempts,"lastAttemptAt","lastError","updatedAt") VALUES ($1::uuid,$2,$3,1,$4::timestamptz,$5,$4::timestamptz)
    ON CONFLICT ("playerId",provider) DO UPDATE SET "externalId"=COALESCE($3,"PlayerProfile"."externalId"),attempts="PlayerProfile".attempts+1,"lastAttemptAt"=$4::timestamptz,"lastError"=$5,"updatedAt"=$4::timestamptz`, [playerId, provider, fields.externalId ?? null, now, fields.error ?? null]);
}

/** Reads profiles for the candidates until the profile allowance is used; never throws, reports why it stopped. */
export async function syncPlayerProfiles(database: SyncDatabase, api: PlayerProfileApi, now = new Date()): Promise<ProfileSyncResult> {
  const result: ProfileSyncResult = { examined: 0, stored: 0, unmatched: 0, requests: 0, stopped: "DONE" };
  const spend = async () => { if (!(await reserveQuota(database, now, profileDailyBudget, PROFILE_QUOTA_KEY))) throw new ProviderError("RATE_LIMITED"); result.requests++; };
  try {
    for (const player of await profileCandidates(database, now)) {
      result.examined++;
      let externalId = player.externalId;
      if (!externalId) {
        await spend();
        const hit = pickPlayer(await api.searchPlayers(player.name), player.name);
        if (!hit) { await remember(database, player.id, now, { error: "NO_MATCH" }); result.unmatched++; continue; }
        externalId = hit.id;
      }
      await spend();
      let profile: Awaited<ReturnType<PlayerProfileApi["playerProfile"]>>;
      try { profile = await api.playerProfile(externalId); }
      catch (error) {
        // One unreadable profile must not stop the others; the quota and network errors still end the pass.
        const code = safeProviderError(error).code;
        if (code === "UNSUPPORTED" || code === "MALFORMED_RESPONSE" || code === "INVALID_JSON") { await remember(database, player.id, now, { externalId, error: code }); result.unmatched++; continue; }
        throw error;
      }
      // A different birth date means a namesake: never attach another person's career.
      if (!profile || (player.birthDate && profile.birthDate && profile.birthDate !== player.birthDate)) { await remember(database, player.id, now, { error: "NO_MATCH" }); result.unmatched++; continue; }
      await database.query(`INSERT INTO "PlayerProfile" ("playerId",provider,"externalId",club,"joinedAt","contractExpiry","marketValue","marketValueCurrency","marketValueAt",transfers,rumours,injuries,"fetchedAt",attempts,"lastAttemptAt","lastError","updatedAt")
        VALUES ($1::uuid,$2,$3,$4,$5::date,$6::date,$7,$8,$9::date,$10::jsonb,$11::jsonb,$12::jsonb,$13::timestamptz,0,$13::timestamptz,NULL,$13::timestamptz)
        ON CONFLICT ("playerId",provider) DO UPDATE SET "externalId"=EXCLUDED."externalId",club=EXCLUDED.club,"joinedAt"=EXCLUDED."joinedAt","contractExpiry"=EXCLUDED."contractExpiry","marketValue"=EXCLUDED."marketValue","marketValueCurrency"=EXCLUDED."marketValueCurrency","marketValueAt"=EXCLUDED."marketValueAt",
          transfers=EXCLUDED.transfers,rumours=EXCLUDED.rumours,injuries=EXCLUDED.injuries,"fetchedAt"=EXCLUDED."fetchedAt",attempts=0,"lastAttemptAt"=EXCLUDED."lastAttemptAt","lastError"=NULL,"updatedAt"=EXCLUDED."updatedAt"`,
        [player.id, provider, profile.externalId, profile.club, profile.joinedAt, profile.contractExpiry, profile.marketValue?.amount ?? null, profile.marketValue?.currency ?? null, profile.marketValue?.at ?? null,
          JSON.stringify(profile.transfers), JSON.stringify(profile.rumours), JSON.stringify(profile.injuries), now]);
      result.stored++;
    }
  } catch (error) {
    const safe = safeProviderError(error);
    if (safe.code === "RATE_LIMITED") { result.stopped = "QUOTA"; if (result.requests) await exhaustQuota(database, now, profileDailyBudget, PROFILE_QUOTA_KEY).catch(() => undefined); }
    else { result.stopped = "ERROR"; result.error = safe.code; }
  }
  return result;
}
