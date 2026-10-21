import { z } from "zod";
import { parseEnvironment } from "../lib/config";
import { createDatabaseClient } from "../lib/database-client";
import { prismaSyncDatabase } from "../lib/sync-database";
import { createLogger } from "../lib/logging";
import { YouTubeVideoProvider } from "../providers/youtube/provider";
import { VideoStore } from "../services/video-store";
import { VideoSyncService, type VideoSyncRequest } from "../services/video-sync";
import { VideoFeedSync } from "../services/video-feed-sync";
import { YouTubeFeedReader } from "../providers/youtube/rss";

async function main() {
  const [mode = "recent", matchId, ...rest] = process.argv.slice(2);
  if (rest.length || !["registry", "feeds", "backfill", "recent", "match", "smoke", "refresh", "cleanup"].includes(mode) || mode === "match" && !z.uuid().safeParse(matchId).success || mode !== "match" && matchId) throw new Error("ARGUMENTS");
  const env = parseEnvironment(process.env); if (!env.DATABASE_URL) throw new Error("DATABASE_REQUIRED");
  const db = createDatabaseClient(env.DATABASE_URL);
  try {
    const store = new VideoStore(prismaSyncDatabase(db));
    if (mode === "registry") { console.log(JSON.stringify({ insertedSources: await store.registry() })); return; }
    // Keyless: public channel feeds plus oEmbed re-checks; no API key or quota needed.
    if (mode === "feeds") { console.log(JSON.stringify(await new VideoFeedSync(new YouTubeFeedReader(), store, createLogger(env.LOG_LEVEL)).run())); return; }
    // One-off history read with the Data API key (about 1 quota unit per 50 videos): older matches than the feed reaches.
    if (mode === "backfill") {
      if (!env.YOUTUBE_API_KEY) throw new Error("NOT_CONFIGURED");
      console.log(JSON.stringify(await new VideoFeedSync(new YouTubeFeedReader(), store, createLogger(env.LOG_LEVEL), { apiKey: env.YOUTUBE_API_KEY, days: 200 }).run())); return;
    }
    const request: VideoSyncRequest = mode === "match" ? { mode, matchId } : { mode: mode as "recent" | "smoke" | "refresh" | "cleanup" };
    console.log(JSON.stringify(await new VideoSyncService(new YouTubeVideoProvider(env.YOUTUBE_API_KEY), store, createLogger(env.LOG_LEVEL)).run(request)));
  } finally { await db.$disconnect(); }
}
void main().catch(() => { console.error("Video sync failed. Check arguments, database/migrations and structured job status. Usage: video:sync -- registry|feeds|recent|smoke|refresh|cleanup|match <uuid>. Raw errors withheld."); process.exitCode = 1; });
