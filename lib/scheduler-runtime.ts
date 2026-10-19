import type { PrismaClient } from "@prisma/client";
import type { parseEnvironment } from "./config";
import { createMatchRuntime } from "./match-runtime";
import { createNewsRuntime } from "./news-runtime";
import { createAIRuntime } from "./ai-runtime";
import { prismaSyncDatabase } from "./sync-database";
import { schedulerPolicy } from "./scheduler-policy";
import { syncMatches } from "../services/match-sync";
import { syncNews } from "../services/news-sync";
import { processArticle } from "../services/ai-processing";
import { ReliabilityService } from "../services/reliability-service";
import { StoryClusteringService } from "../services/story-clustering";
import { TransferTrackingService } from "../services/transfer-service";
import { VideoSyncService } from "../services/video-sync";
import { VideoStore } from "../services/video-store";
import { YouTubeVideoProvider } from "../providers/youtube/provider";
import { MorningBriefService } from "../services/morning-brief";
import { canIngest } from "../providers/news/sources";
import { jobOutcomeSchema, SchedulerError, type JobOutcome, type SchedulerHandlers, type SchedulerLog } from "../types/scheduler";

const done = (processed = 0, failed = 0): JobOutcome => ({ status: failed ? "PARTIAL" : "SUCCEEDED", processed, succeeded: Math.max(0, processed - failed), failed });
const skipped = (code: string): JobOutcome => ({ status: "SKIPPED", processed: 0, succeeded: 0, failed: 0, code });
function providerFailure(error: unknown): SchedulerError {
  const value = error && typeof error === "object" ? error as { code?: unknown; retryAfterMs?: unknown } : {};
  const code = String(value.code);
  if (["TIMEOUT", "NETWORK", "UPSTREAM", "RATE_LIMITED"].includes(code)) return new SchedulerError(code as "TIMEOUT", true, typeof value.retryAfterMs === "number" && value.retryAfterMs >= 0 ? value.retryAfterMs : 0);
  return new SchedulerError(code === "UNAUTHORIZED" ? "UNAUTHORIZED" : "JOB_FAILED");
}

/** Only the composition root knows concrete adapters. All jobs call the existing
 * services; provider retry/cache/permission/rate policies remain authoritative.
 */
export function createSchedulerHandlers(db: PrismaClient, env: ReturnType<typeof parseEnvironment>, log?: SchedulerLog): SchedulerHandlers {
  const database = prismaSyncDatabase(db);
  const match = createMatchRuntime(db, env); const news = createNewsRuntime(db, { wikimediaUserAgent: env.WIKIMEDIA_USER_AGENT }); const ai = createAIRuntime(db, env);
  const recentArticles = (now: Date) => database.query<{ id: string }>('SELECT id FROM "Article" WHERE "collectedAt">=$1::timestamptz-interval \'48 hours\' AND "collectedAt"<=$1::timestamptz ORDER BY "collectedAt",id LIMIT $2::integer', [now, schedulerPolicy.batchSize]);
  return {
    MATCH_SYNC: async ({ plan }) => {
      if (!env.FOOTBALL_DATA_API_KEY) return skipped("NOT_CONFIGURED");
      const dateFrom = new Date(Date.parse(plan.scheduledAt) - 2 * 86400000).toISOString().slice(0, 10);
      const dateTo = new Date(Date.parse(plan.scheduledAt) + 86400000).toISOString().slice(0, 10);
      let processed = 0; let errors = 0;
      for (const competition of ["premier-league", "la-liga"]) {
        try { const result = await syncMatches(match.provider, match.store, { mode: "matches", competition, dateFrom, dateTo }, log); processed += result.recordsProcessed; errors += result.skipped; }
        catch (error) {
          // Per-competition isolation. Adapter already bounds transient retries;
          // avoid repeating a successful league merely because the other failed.
          errors++; log?.error({ jobType: "MATCH_SYNC", competition, code: providerFailure(error).code }, "scheduler.match_failed");
        }
      }
      return { ...done(processed + errors, errors), ...(errors ? { code: "MATCH_SYNC_PARTIAL" } : {}) };
    },
    NEWS_SYNC: async () => {
      await news.store.registerSources();
      const sources = (await news.store.sources()).filter((source) => source.enabled && canIngest(source));
      if (!sources.length) return skipped("NO_PERMITTED_SOURCES");
      // Missing Wikimedia contact is an optional configuration skip, not a bypass.
      const configured = sources.filter((source) => source.slug !== "wikinews-en" || Boolean(env.WIKIMEDIA_USER_AGENT));
      if (!configured.length) return skipped("NOT_CONFIGURED");
      const result = await syncNews(configured, news.store, news.createProvider, { limit: 10, logger: log });
      const failed = result.filter((row) => row.status === "failed" || row.status === "skipped" && ["COOLDOWN"].includes(row.code ?? "")).length;
      return { ...done(result.length, failed), ...(failed ? { code: "NEWS_SYNC_PARTIAL" } : {}) };
    },
    ARTICLE_PROCESS: async ({ plan, now }) => {
      const processing = plan.storedOnly ? createAIRuntime(db, { AI_PROVIDER: "fallback" }) : ai;
      let processed = 0; let failed = 0;
      for (const article of await processing.store.candidates(schedulerPolicy.batchSize, { since: new Date(now.getTime() - 48 * 3600000), before: now })) {
        const result = await processArticle(article.id, processing.store, processing.provider, { identity: processing.identity, logger: log });
        processed++; if (result.status === "FAILED") failed++;
      }
      return done(processed, failed);
    },
    RELIABILITY_UPDATE: async ({ now }) => {
      const service = new ReliabilityService(database); let processed = 0;
      for (const article of await recentArticles(now)) { await service.assessArticle(article.id, now); processed++; }
      return done(processed);
    },
    STORY_CLUSTER: async ({ now }) => done((await new StoryClusteringService(database).cluster({ since: new Date(now.getTime() - 48 * 3600000), now })).length),
    TRANSFER_UPDATE: async ({ now }) => { const result = await new TransferTrackingService(database).sync(now); return done(result.clusters); },
    VIDEO_SYNC: async ({ now }) => {
      // Service also performs required metadata expiry cleanup when unconfigured.
      const result = await new VideoSyncService(new YouTubeVideoProvider(env.YOUTUBE_API_KEY), new VideoStore(database), log).run({ mode: "recent" }, now);
      if (result.errors) return { ...done(result.processed + result.errors, result.errors), code: "VIDEO_SYNC_PARTIAL" };
      if (["COOLDOWN", "JOB_RUNNING", "DAILY_SEARCH_BUDGET"].includes(result.skipped)) return { ...done(1, 1), code: "VIDEO_DEFERRED" };
      if (result.skipped) return skipped("NOT_CONFIGURED");
      return done(result.processed);
    },
    MORNING_BRIEF_GENERATE: async ({ plan, now, freshness }) => {
      // Freshness is generation context, persisted beside the revision reference
      // in JobRun. It never changes M12's immutable factual snapshot/hash.
      log?.info({ logicalDate: plan.date, staleProviders: freshness.filter((row) => row.stale).length }, "scheduler.brief_inputs");
      const result = await new MorningBriefService(database, log).generate({ date: plan.date, timezone: plan.timezone, asOf: plan.scheduledAt }, now);
      return jobOutcomeSchema.parse({ ...done(1), brief: { id: result.record.id, revision: result.record.revision, status: result.record.status, cached: result.cached } });
    },
  };
}
