import { createHash, randomUUID } from "node:crypto";
import { VideoProviderError, type VideoProvider, type VideoMatch } from "../types/video-provider";
import { VideoStore } from "./video-store";
import { sourceAllowed, sourceRank } from "./video-policy";

export type VideoSyncRequest = { mode: "recent" | "smoke" | "refresh" | "cleanup" } | { mode: "match"; matchId: string };
type Log = { info(fields: Record<string, unknown>, event: string): void; error(fields: Record<string, unknown>, event: string): void };
export class VideoSyncService {
  constructor(private provider: VideoProvider, private store: VideoStore, private log?: Log) {}
  async run(request: VideoSyncRequest, now = new Date()) {
    const db = this.store.db; const owner = randomUUID();
    const jobs = await db.query<{ id: string }>(`INSERT INTO "JobRun" (id,"jobName","logicalKey",status,"startedAt",attempts,"leaseOwner","leaseExpiresAt","correlationId","updatedAt") VALUES ($1::uuid,'video-sync','global','RUNNING',$2::timestamptz,1,$3::text,$2::timestamptz+interval '5 minutes',$3::text::uuid,$2::timestamptz) ON CONFLICT ("jobName","logicalKey") DO UPDATE SET status='RUNNING',"startedAt"=excluded."startedAt","finishedAt"=NULL,attempts="JobRun".attempts+1,"leaseOwner"=excluded."leaseOwner","leaseExpiresAt"=excluded."leaseExpiresAt","updatedAt"=excluded."updatedAt" WHERE "JobRun".status<>'RUNNING' OR "JobRun"."leaseExpiresAt"<$2::timestamptz RETURNING id`, [randomUUID(), now, owner]);
    const report = { skipped: "", matches: 0, searches: 0, processed: 0, errors: 0, primary: 0, purged: 0 };
    if (!jobs.length) return { ...report, skipped: "JOB_RUNNING" };
    let code: string | null = null;
    try {
      report.purged = await this.store.purgeExpired(now);
      await db.query(`INSERT INTO "ProviderStatus" (id,provider,capability,enabled,"updatedAt") VALUES ($1::uuid,'YOUTUBE','verified-highlight-links',$2,$3::timestamptz) ON CONFLICT (provider) DO UPDATE SET enabled=excluded.enabled,"updatedAt"=excluded."updatedAt"`, [randomUUID(), this.provider.configured, now]);
      if (request.mode === "cleanup") return report;
      if (!this.provider.configured) { report.skipped = "NOT_CONFIGURED"; return report; }
      const cooldown = await db.query('SELECT id FROM "ProviderStatus" WHERE provider=\'YOUTUBE\' AND "cooldownUntil">$1::timestamptz', [now]);
      if (cooldown.length) { report.skipped = "COOLDOWN"; return report; }
      // One channel lookup per enabled source per run; fixed maximum of ten approved sources.
      for (const source of await this.store.sources()) {
        try { const channel = await this.provider.resolveChannel(source.channelHandle); if (!await this.store.resolve(source, channel?.channelId ?? null)) { report.errors++; code = "CHANNEL_IDENTITY_UNVERIFIED"; } }
        catch (error) { report.errors++; code = await this.failure(error, now); if (["QUOTA", "UNAUTHORIZED"].includes(code)) return report; }
      }
      let matches: VideoMatch[];
      if (request.mode === "refresh") {
        const ids = await db.query<{ matchId: string }>('SELECT DISTINCT "matchId" FROM "Video" WHERE provider=\'YOUTUBE\' AND "videoSourceId" IS NOT NULL AND "lastCheckedAt"<$1::timestamptz-interval \'1 day\' ORDER BY "matchId" LIMIT 10', [now]);
        matches = (await Promise.all(ids.map((row) => this.store.matches(now, row.matchId)))).flat();
      } else matches = await this.store.matches(now, request.mode === "match" ? request.matchId : undefined);
      if (request.mode === "smoke") matches = matches.slice(0, 1);
      for (const match of matches) {
        report.matches++;
        const existing = await this.store.stored(match.id);
        const due = existing.filter((row) => now.getTime() - Date.parse(row.lastCheckedAt) >= 86400000);
        if (due.length) {
          try {
            const result = await this.provider.getVideos(due.map((row) => row.video.externalId));
            await this.store.missing(result.missingIds, now);
            for (const video of result.videos) {
              const old = due.find((row) => row.video.externalId === video.externalId)!;
              await this.store.persist(match, old.source, old.mapping, video, now); report.processed++;
            }
          } catch (error) { report.errors++; code = await this.failure(error, now); if (["QUOTA", "UNAUTHORIZED"].includes(code)) return report; }
        }
        const mappings = (await this.store.mappings(match)).filter(({ source, mapping }) => sourceAllowed(source, mapping, match, now)).sort((a, b) => sourceRank(a.source, a.mapping) - sourceRank(b.source, b.mapping) || a.mapping.priority - b.mapping.priority).slice(0, request.mode === "smoke" ? 1 : 2);
        const scopes = mappings.map(({ source: s, mapping: m }) => ({ source: [s.id,s.channelId,s.verified,s.enabled,s.priority,s.sourceType,s.country,s.language,s.lastVerifiedAt,s.reviewReference], mapping: [m.id,m.enabled,m.season,m.market,m.language,m.rightsType,m.priority,m.validFrom,m.validTo,m.evidenceUrl] }));
        const hash = createHash("sha256").update(JSON.stringify({ match, scopes, policy: "video-v1" })).digest("hex");
        const cached = await db.query('SELECT "matchId" FROM "VideoSyncState" WHERE "matchId"=$1::uuid AND "inputHash"=$2 AND "nextSearchAt">$3::timestamptz', [match.id, hash, now]);
        const recent = Date.parse(match.kickoffAt) >= now.getTime() - 14 * 86400000 && Date.parse(match.kickoffAt) < now.getTime() - 75 * 60000;
        const bestStored = await this.store.select(match, now);
        const preferredFound = bestStored && sourceRank(bestStored.source, bestStored.mapping) === 0;
        if (request.mode !== "refresh" && recent && !cached.length && !preferredFound) {
          let failed = false;
          for (const { source, mapping } of mappings) {
            if (!await this.reserveSearch(now)) { report.skipped = "DAILY_SEARCH_BUDGET"; break; }
            try {
              report.searches++;
              const ids = await this.provider.searchMatchHighlights(match, source);
              const result = await this.provider.getVideos(ids);
              for (const video of result.videos) { await this.store.persist(match, source, mapping, video, now); report.processed++; }
            } catch (error) { failed = true; report.errors++; code = await this.failure(error, now); if (["QUOTA", "UNAUTHORIZED"].includes(code)) return report; }
          }
          if (mappings.length && !failed && !report.skipped) await db.query(`INSERT INTO "VideoSyncState" ("matchId","inputHash","nextSearchAt","lastSearchedAt") VALUES ($1::uuid,$2,$3::timestamptz+interval '12 hours',$3::timestamptz) ON CONFLICT ("matchId") DO UPDATE SET "inputHash"=excluded."inputHash","nextSearchAt"=excluded."nextSearchAt","lastSearchedAt"=excluded."lastSearchedAt"`, [match.id, hash, now]);
        }
        if (await this.store.select(match, now)) report.primary++;
      }
      return report;
    } catch (error) { code = error instanceof VideoProviderError ? error.code : "STORE_ERROR"; report.errors++; throw new Error(code); }
    finally {
      const failed = report.errors > 0;
      await db.query(`UPDATE "JobRun" SET status=$3::"JobStatus","finishedAt"=$4::timestamptz,"recordsProcessed"=$5,"errorCode"=$6,"errorSafe"=$6,checkpoint=$7::jsonb,"leaseOwner"=NULL,"leaseExpiresAt"=NULL,"updatedAt"=$4::timestamptz WHERE id=$1::uuid AND "leaseOwner"=$2`, [jobs[0].id, owner, failed ? "FAILED" : report.skipped ? "CANCELLED" : "SUCCEEDED", now, report.processed, code ?? (report.skipped || null), JSON.stringify(report)]);
      await db.query(`UPDATE "ProviderStatus" SET health=$1::"ProviderHealth","lastCheckedAt"=$2::timestamptz,"lastSuccessAt"=CASE WHEN $6 THEN $2::timestamptz ELSE "lastSuccessAt" END,"lastFailureAt"=CASE WHEN $3 THEN $2::timestamptz ELSE "lastFailureAt" END,"recordsProcessed"="recordsProcessed"+$4,"errorCode"=CASE WHEN $7 THEN "errorCode" ELSE $5 END,"errorSafe"=CASE WHEN $7 THEN "errorSafe" ELSE $5 END,"updatedAt"=$2::timestamptz WHERE provider='YOUTUBE'`, [!this.provider.configured ? "UNCONFIGURED" : failed || report.skipped === "COOLDOWN" ? "WARNING" : "HEALTHY", now, failed, report.processed, code, !failed && !report.skipped && request.mode !== "cleanup", Boolean(report.skipped) || request.mode === "cleanup"]);
      (failed ? this.log?.error.bind(this.log) : this.log?.info.bind(this.log))?.({ provider: this.provider.name, jobId: jobs[0].id, ...report, code }, "video.sync_finished");
    }
  }
  private async failure(error: unknown, now: Date) {
    const code = error instanceof VideoProviderError ? error.code : "STORE_ERROR";
    if (code === "QUOTA") await this.store.db.query('UPDATE "ProviderStatus" SET "cooldownUntil"=$1::timestamptz+interval \'24 hours\' WHERE provider=\'YOUTUBE\'', [now]);
    return code;
  }
  private async reserveSearch(now: Date) {
    return this.store.db.transaction(async (tx) => {
      const rows = await tx.query<{ checkpoint: { day?: string; searches?: number } | null }>('SELECT checkpoint FROM "ProviderStatus" WHERE provider=\'YOUTUBE\' FOR UPDATE');
      const day = now.toISOString().slice(0, 10); const used = rows[0]?.checkpoint?.day === day ? Number(rows[0].checkpoint?.searches ?? 0) : 0;
      if (used >= 10) return false;
      await tx.query('UPDATE "ProviderStatus" SET checkpoint=$1::jsonb WHERE provider=\'YOUTUBE\'', [JSON.stringify({ day, searches: used + 1 })]); return true;
    });
  }
}
