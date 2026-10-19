import { z } from "zod";
import { parseEnvironment } from "../lib/config";
import { createDatabaseClient } from "../lib/database-client";
import { prismaSyncDatabase } from "../lib/sync-database";
import { createLogger } from "../lib/logging";
import { YouTubeVideoProvider } from "../providers/youtube/provider";
import { VideoStore } from "../services/video-store";
import { VideoSyncService, type VideoSyncRequest } from "../services/video-sync";

async function main() {
  const [mode = "recent", matchId, ...rest] = process.argv.slice(2);
  if (rest.length || !["registry", "recent", "match", "smoke", "refresh", "cleanup"].includes(mode) || mode === "match" && !z.uuid().safeParse(matchId).success || mode !== "match" && matchId) throw new Error("ARGUMENTS");
  const env = parseEnvironment(process.env); if (!env.DATABASE_URL) throw new Error("DATABASE_REQUIRED");
  const db = createDatabaseClient(env.DATABASE_URL);
  try {
    const store = new VideoStore(prismaSyncDatabase(db));
    if (mode === "registry") { console.log(JSON.stringify({ insertedSources: await store.registry() })); return; }
    const request: VideoSyncRequest = mode === "match" ? { mode, matchId } : { mode: mode as "recent" | "smoke" | "refresh" | "cleanup" };
    console.log(JSON.stringify(await new VideoSyncService(new YouTubeVideoProvider(env.YOUTUBE_API_KEY), store, createLogger(env.LOG_LEVEL)).run(request)));
  } finally { await db.$disconnect(); }
}
void main().catch(() => { console.error("Video sync failed. Check arguments, database/migrations and structured job status. Usage: video:sync -- registry|recent|smoke|refresh|cleanup|match <uuid>. Raw errors withheld."); process.exitCode = 1; });
