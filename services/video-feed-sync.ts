import { randomUUID } from "node:crypto";
import { registeredChannel } from "../providers/youtube/sources";
import type { YouTubeFeedReader } from "../providers/youtube/rss";
import { VideoProviderError, type VideoCandidate, type VideoSource } from "../types/video-provider";
import { normalizedVideoText, sourceAllowed, validateVideo } from "./video-policy";
import type { VideoStore } from "./video-store";

export type FeedSyncReport = { sources: number; feeds: number; feedVideos: number; matches: number; stored: number; primary: number; rechecked: number; removed: number; errors: number; skipped: string };
type Log = { info(fields: Record<string, unknown>, event: string): void; error(fields: Record<string, unknown>, event: string): void };
const recheckAfterMs = 24 * 3600_000;

/**
 * Keyless highlight discovery: reads each reviewed channel's public feed, keeps only videos that
 * pass the same highlight policy as the API path (both teams, competition, time window, reviewed
 * source), and re-checks stored links once a day through YouTube's public oEmbed endpoint.
 * Costs no API quota, so the worker can run it often and catch every upload.
 */
export class VideoFeedSync {
  constructor(private reader: Pick<YouTubeFeedReader, "feed" | "stillPublic">, private store: VideoStore, private log?: Log) {}
  async run(now = new Date()): Promise<FeedSyncReport> {
    const db = this.store.db; const owner = randomUUID();
    const report: FeedSyncReport = { sources: 0, feeds: 0, feedVideos: 0, matches: 0, stored: 0, primary: 0, rechecked: 0, removed: 0, errors: 0, skipped: "" };
    const jobs = await db.query<{ id: string }>(`INSERT INTO "JobRun" (id,"jobName","logicalKey",status,"startedAt",attempts,"leaseOwner","leaseExpiresAt","correlationId","updatedAt") VALUES ($1::uuid,'video-sync','feeds','RUNNING',$2::timestamptz,1,$3::text,$2::timestamptz+interval '5 minutes',$3::text::uuid,$2::timestamptz)
      ON CONFLICT ("jobName","logicalKey") DO UPDATE SET status='RUNNING',"startedAt"=excluded."startedAt","finishedAt"=NULL,attempts="JobRun".attempts+1,"leaseOwner"=excluded."leaseOwner","leaseExpiresAt"=excluded."leaseExpiresAt","updatedAt"=excluded."updatedAt"
      WHERE "JobRun".status<>'RUNNING' OR "JobRun"."leaseExpiresAt"<$2::timestamptz RETURNING id`, [randomUUID(), now, owner]);
    if (!jobs.length) return { ...report, skipped: "JOB_RUNNING" };
    let code: string | null = null;
    try {
      await this.store.registry();
      // 1. Read each reviewed channel's feed. The feed must report the pinned channel and its expected author.
      const feeds = new Map<string, { source: VideoSource; videos: VideoCandidate[] }>();
      for (const source of await this.store.sources()) {
        report.sources++;
        const registered = registeredChannel(source.channelHandle);
        const channelId = source.channelId ?? registered?.channelId;
        if (!channelId || (registered && registered.channelId !== channelId)) { report.errors++; code = "CHANNEL_NOT_PINNED"; continue; }
        try {
          const feed = await this.reader.feed(channelId);
          if (registered && normalizedVideoText(feed.author) !== normalizedVideoText(registered.feedAuthor)) { report.errors++; code = "CHANNEL_AUTHOR_MISMATCH"; continue; }
          await this.store.resolve(source, channelId);
          // The feed carries no language; a reviewed rights holder's uploads are in its registered language.
          const videos = feed.videos.map((video) => ({ ...video, language: video.language ?? source.language }));
          feeds.set(source.id, { source: { ...source, channelId }, videos }); report.feeds++; report.feedVideos += videos.length;
        } catch (error) { report.errors++; code = error instanceof VideoProviderError ? error.code : "FEED_ERROR"; }
      }
      // 2. Match feed videos to recently finished matches; only videos that pass the policy are stored.
      for (const match of await this.store.recentFinished(now)) {
        report.matches++;
        // One match failing to store must not stop the others; it is counted and retried next run.
        try {
          const mappings = (await this.store.mappings(match)).filter(({ source, mapping }) => feeds.has(source.id) && sourceAllowed({ ...source, channelId: feeds.get(source.id)!.source.channelId }, mapping, match, now));
          for (const { source, mapping } of mappings) {
            const feed = feeds.get(source.id)!;
            for (const video of feed.videos) {
              if (!validateVideo(video, feed.source, mapping, match, now).valid) continue;
              await this.store.persist(match, feed.source, mapping, video, now); report.stored++;
            }
          }
          if (await this.store.select(match, now)) report.primary++;
        } catch { report.errors++; code = "MATCH_STORE_ERROR"; }
      }
      // 3. Once a day, confirm stored links are still public on their channel (keyless oEmbed).
      for (const row of await this.store.dueForRecheck(now, new Date(now.getTime() - recheckAfterMs))) {
        try {
          const stored = (await this.store.stored(row.matchId)).find((item) => item.video.externalId === row.externalId);
          if (!stored) continue;
          if (await this.reader.stillPublic(row.externalId, row.channelName)) {
            const [match] = await this.store.matches(now, row.matchId);
            if (match) { await this.store.persist(match, stored.source, stored.mapping, stored.video, now); report.rechecked++; await this.store.select(match, now); }
          } else { await this.store.missing([row.externalId], now); report.removed++; }
        } catch (error) { report.errors++; code = error instanceof VideoProviderError ? error.code : "RECHECK_ERROR"; }
      }
      return report;
    } catch (error) { code = error instanceof VideoProviderError ? error.code : "STORE_ERROR"; report.errors++; throw new Error(code); }
    finally {
      const failed = report.errors > 0 && report.feeds === 0;
      await db.query(`UPDATE "JobRun" SET status=$3::"JobStatus","finishedAt"=$4::timestamptz,"recordsProcessed"=$5,"errorCode"=$6,"errorSafe"=$6,checkpoint=$7::jsonb,"leaseOwner"=NULL,"leaseExpiresAt"=NULL,"updatedAt"=$4::timestamptz WHERE id=$1::uuid AND "leaseOwner"=$2`,
        [jobs[0].id, owner, failed ? "FAILED" : "SUCCEEDED", now, report.stored + report.rechecked, code, JSON.stringify(report)]);
      (report.errors ? this.log?.error.bind(this.log) : this.log?.info.bind(this.log))?.({ provider: "YOUTUBE_FEED", ...report, code }, "video.feed_sync_finished");
    }
  }
}
