import { Client } from "pg";
import { parseEnvironment } from "../lib/config";
import { createDatabaseClient } from "../lib/database-client";
import { createLogger } from "../lib/logging";
import { createMatchDetailApi, createMatchRuntime } from "../lib/match-runtime";
import { createNewsRuntime } from "../lib/news-runtime";
import { prismaSyncDatabase } from "../lib/sync-database";
import { competitionConfig } from "../providers/football-data/config";
import { vietnameseSource } from "../providers/news/vietnamese-sources";
import { publishFeedCards } from "../services/feed-cards";
import { syncMatches } from "../services/match-sync";
import { syncMatchDetails } from "../services/match-details";
import { syncPlayerProfiles } from "../services/player-profiles";
import { syncHeadToHead } from "../services/head-to-head";
import { syncLeagueLeaders } from "../services/league-leaders";
import { isLeagueSlug } from "../services/league-hub";
import { VideoFeedSync } from "../services/video-feed-sync";
import { liveFanReader, syncFanThreads } from "../services/fan-threads";
import { VideoStore } from "../services/video-store";
import { YouTubeFeedReader } from "../providers/youtube/rss";
import { syncNews } from "../services/news-sync";
import { syncPlayerImages, wikimediaApi } from "../services/player-images";
import { abortableSleep, runLoop } from "../services/worker-loop";

const lockKey = 91531121;
const intervalMs = 60_000;
const matchTtlMs = 30 * 60_000;
const standingsTtlMs = 6 * 3600_000;
const vietnamDay = (offsetDays: number) => new Date(Date.now() + 7 * 3600_000 + offsetDays * 86400_000).toISOString().slice(0, 10);

/**
 * Long-running freshness worker. It does not follow a fixed clock: every pass asks each source
 * whether it is due. Sources decide for themselves (15-minute RSS window, ETag/Last-Modified,
 * robots crawl-delay, persisted cooldowns and job leases), so a short loop interval costs only
 * cheap database checks while news is picked up soon after a publisher updates its feed.
 */
async function main() {
  const env = parseEnvironment(process.env);
  if (!env.DATABASE_URL) { console.error("DATABASE_URL is required."); process.exitCode = 1; return; }
  const logger = createLogger(env.LOG_LEVEL);
  const controller = new AbortController();
  for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => controller.abort());
  // A dedicated session holds the lock; PostgreSQL frees it if this process dies.
  const lock = new Client({ connectionString: env.DATABASE_URL, application_name: "fmb-news-worker", keepAlive: true });
  lock.on("error", () => controller.abort());
  await lock.connect();
  if (!(await lock.query<{ locked: boolean }>("SELECT pg_try_advisory_lock($1) AS locked", [lockKey])).rows[0]?.locked) {
    console.error("Another news worker is already running."); await lock.end(); process.exitCode = 1; return;
  }
  const db = createDatabaseClient(env.DATABASE_URL);
  const database = prismaSyncDatabase(db);
  const news = createNewsRuntime(db, { wikimediaUserAgent: env.WIKIMEDIA_USER_AGENT });
  const match = env.FOOTBALL_DATA_API_KEY ? createMatchRuntime(db, env) : null;
  const details = env.HIGHLIGHTLY_API_KEY ? createMatchDetailApi(db, env.HIGHLIGHTLY_API_KEY) : null;
  const photoApi = env.WIKIMEDIA_USER_AGENT ? wikimediaApi(env.WIKIMEDIA_USER_AGENT) : null;
  let photosPausedUntil = 0;
  // Highlights from the reviewed channels' public feeds: keyless, so a 20-minute cadence costs nothing.
  const videoFeeds = new VideoFeedSync(new YouTubeFeedReader(), new VideoStore(database), logger);
  let videosDueAt = 0;
  // What fans say: titles and reply counts of public Voz and r/soccer threads, every ten minutes (both ask for gentle readers).
  let fansDueAt = 0;
  logger.info({ matches: Boolean(match), details: Boolean(details), photos: Boolean(photoApi) }, "worker.started");
  try {
    await runLoop(async () => {
      let ok = true;
      await news.store.registerSources();
      const sources = (await news.store.sources()).filter((source) => vietnameseSource(source.slug) && source.enabled);
      const results = await syncNews(sources, news.store, news.createProvider, { limit: 120, logger });
      const synced = results.filter((result) => result.status === "synced");
      // One flaky publisher must not slow the others: each source already has its own cooldown and
      // lease. The whole loop backs off only when every attempted source failed (network/database trouble).
      // BUSY means another run holds that source's lease, which is expected and not a failure.
      const attempted = results.filter((result) => result.status === "synced" || result.status === "failed");
      if (attempted.length > 0 && attempted.every((result) => result.status === "failed" && result.code !== "BUSY")) ok = false;
      // Publish cards on every pass: cheap, idempotent, and it regroups late arrivals.
      const cards = await publishFeedCards(database);
      if (match) {
        for (const competition of Object.keys(competitionConfig)) {
          try {
            await syncMatches(match.provider, match.store, { mode: "matches", competition, dateFrom: vietnamDay(-3), dateTo: vietnamDay(10) }, logger, { ttlMs: matchTtlMs });
            await syncMatches(match.provider, match.store, { mode: "standings", competition }, logger, { ttlMs: standingsTtlMs });
          } catch { ok = false; } // Provider errors are recorded by the sync; keep the news loop alive.
          // League pages: top scorers, current matchday and emblem, every six hours per league.
          try { if (isLeagueSlug(competition) && await syncLeagueLeaders(database, match.provider, competition)) logger.info({ competition }, "worker.league_leaders"); } catch { ok = false; }
        }
      }
      // Events, lineups and statistics: only due matches cost a request; stops for the day at the allowance.
      if (details) {
        try {
          const result = await syncMatchDetails(database, details);
          if (result.requests || result.stopped === "ERROR") logger.info({ ...result }, "worker.match_details");
        } catch { ok = false; }
        // Transfer pages: profiles of players the press is writing about, from their own small allowance.
        try {
          const profiles = await syncPlayerProfiles(database, details);
          if (profiles.requests || profiles.stopped === "ERROR") logger.info({ ...profiles }, "worker.player_profiles");
        } catch { ok = false; }
        // Match pages: earlier meetings (every competition) of clubs playing soon, from their own small allowance.
        try {
          const meetings = await syncHeadToHead(database, details);
          if (meetings.requests || meetings.stopped === "ERROR") logger.info({ ...meetings }, "worker.head_to_head");
        } catch { ok = false; }
      }
      if (Date.now() >= videosDueAt) {
        videosDueAt = Date.now() + 20 * 60_000;
        try { const videos = await videoFeeds.run(); if (videos.stored || videos.removed || videos.errors) logger.info({ ...videos }, "worker.videos"); } catch { /* Logged by the sync; retried next window. */ }
      }
      if (Date.now() >= fansDueAt) {
        fansDueAt = Date.now() + 10 * 60_000;
        try { const fans = await syncFanThreads(database, liveFanReader); if (fans.kept) logger.info({ ...fans }, "worker.fan_threads"); } catch { /* Retried next window. */ }
      }
      // Free-licence player photos: a small, time-boxed batch per pass; pauses for 30 minutes when Wikimedia pushes back.
      if (photoApi && Date.now() >= photosPausedUntil) {
        try {
          const photos = await syncPlayerImages(database, { api: photoApi, limit: 8, timeBudgetMs: 20_000 });
          if (photos.stopped === "RATE_LIMITED" || photos.stopped === "NETWORK") photosPausedUntil = Date.now() + 30 * 60_000;
          if (photos.examined) logger.info({ ...photos }, "worker.photos");
        } catch { photosPausedUntil = Date.now() + 30 * 60_000; }
      }
      if (synced.length || !ok) logger.info({ synced: synced.length, created: synced.reduce((sum, result) => sum + (result.created ?? 0), 0), failed: results.filter((result) => result.status === "failed").length, busy: results.filter((result) => result.code === "BUSY").length, published: cards.published, held: cards.held }, "worker.pass");
      return { ok };
    }, { intervalMs, maxBackoffMs: 10 * 60_000, sleep: abortableSleep, signal: controller.signal, onPass: (pass) => { if (!pass.ok) logger.error({ failures: pass.failures, nextInMs: pass.nextInMs }, "worker.pass_failed"); } });
  } finally {
    logger.info({}, "worker.stopped");
    await db.$disconnect().catch(() => {});
    await lock.query("SELECT pg_advisory_unlock($1)", [lockKey]).catch(() => {});
    await lock.end().catch(() => {});
  }
}
main().catch(() => { console.error("News worker stopped. Check database readiness and migrations; no raw error is logged."); process.exitCode = 1; });
