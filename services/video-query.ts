import type { VerifiedHighlight } from "../types/video-provider";
import { VideoStore, videoFreshMs } from "./video-store";
import { classifyVideo, primaryVideo } from "./video-policy";

/** Internal read-only projection, never a provider call or background sync on render. */
export async function readVerifiedHighlight(store: VideoStore, matchId: string, now = new Date()): Promise<VerifiedHighlight | null> {
  const match = (await store.matches(now, matchId))[0]; if (!match) return null;
  const stored = (await store.stored(matchId)).filter((row) => row.validationStatus === "VALIDATED" && Date.parse(row.lastCheckedAt) <= now.getTime() && now.getTime() - Date.parse(row.lastCheckedAt) < videoFreshMs);
  const chosen = primaryVideo(stored, match, now); if (!chosen) return null;
  return { url: `https://www.youtube.com/watch?v=${chosen.video.externalId}`, videoId: chosen.video.externalId, embedAllowed: chosen.video.embedAllowed, thumbnailUrl: `https://i.ytimg.com/vi/${chosen.video.externalId}/hqdefault.jpg`, title: chosen.video.title, channelName: chosen.video.channelName, videoType: classifyVideo(chosen.video.title), publishedAt: chosen.video.publishedAt, checkedAt: chosen.lastCheckedAt, language: chosen.video.language, vietnamAvailability: chosen.video.vietnamAvailability };
}
