import { z } from "zod";
import { VideoProviderError, videoCandidateSchema, type VideoCandidate, type VideoMatch, type VideoProvider, type VideoSource } from "../../types/video-provider";

const id = z.string().regex(/^[A-Za-z0-9_-]{11}$/);
const channelId = z.string().regex(/^UC[A-Za-z0-9_-]{22}$/);
const item = z.object({ id, snippet: z.object({ title: z.string(), channelId, channelTitle: z.string(), description: z.string().optional(), publishedAt: z.iso.datetime(), defaultAudioLanguage: z.string().optional(), defaultLanguage: z.string().optional(), liveBroadcastContent: z.string().optional() }), contentDetails: z.object({ duration: z.string().optional(), regionRestriction: z.object({ allowed: z.array(z.string()).optional(), blocked: z.array(z.string()).optional() }).optional() }), status: z.object({ privacyStatus: z.enum(["public", "private", "unlisted"]), uploadStatus: z.string(), embeddable: z.boolean().optional() }) });
function duration(value?: string) { const found = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(value ?? ""); return found ? Number(found[1] ?? 0) * 3600 + Number(found[2] ?? 0) * 60 + Number(found[3] ?? 0) : null; }

/** Vendor DTOs stay in this adapter. Error messages never contain request URLs or keys. */
export class YouTubeVideoProvider implements VideoProvider {
  readonly name = "YOUTUBE";
  #key?: string;
  get configured() { return Boolean(this.#key); }
  constructor(key?: string, private options: { fetch?: typeof fetch; timeoutMs?: number; sleep?: (ms: number) => Promise<void> } = {}) { this.#key = key?.trim() || undefined; }
  private async request(endpoint: string, params: Record<string, string>): Promise<unknown> {
    if (!this.#key) throw new VideoProviderError("NOT_CONFIGURED");
    for (let attempt = 0; attempt < 2; attempt++) {
      const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 8000);
      let failure: VideoProviderError;
      try {
        const url = new URL(`https://www.googleapis.com/youtube/v3/${endpoint}`); url.search = new URLSearchParams(params).toString();
        const response = await (this.options.fetch ?? fetch)(url, { headers: { "X-Goog-Api-Key": this.#key, Accept: "application/json" }, signal: controller.signal, redirect: "error", cache: "no-store" });
        if (response.status === 403 || response.status === 429) {
          const body = await response.text();
          throw new VideoProviderError(response.status === 429 || /quotaExceeded|dailyLimitExceeded|rateLimitExceeded/.test(body) ? "QUOTA" : "UNAUTHORIZED");
        }
        if (response.status === 401) throw new VideoProviderError("UNAUTHORIZED");
        if (!response.ok) throw new VideoProviderError(response.status >= 500 || response.status === 408 ? "UPSTREAM" : "MALFORMED");
        const text = await response.text(); if (text.length > 1024 * 1024) throw new VideoProviderError("MALFORMED");
        try { return JSON.parse(text); } catch { throw new VideoProviderError("MALFORMED"); }
      } catch (error) { failure = error instanceof VideoProviderError ? error : new VideoProviderError(controller.signal.aborted ? "TIMEOUT" : "NETWORK"); }
      finally { clearTimeout(timer); }
      // Search is expensive: never retry it. Only idempotent metadata reads retry once.
      if (endpoint === "search" || attempt || !["TIMEOUT", "NETWORK", "UPSTREAM"].includes(failure.code)) throw failure;
      await (this.options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))))(300);
    }
    throw new VideoProviderError("UPSTREAM");
  }
  async resolveChannel(handle: string) {
    const raw = await this.request("channels", { part: "snippet", forHandle: handle });
    const result = z.object({ items: z.array(z.object({ id: channelId, snippet: z.object({ customUrl: z.string() }) })).max(1) }).safeParse(raw);
    if (!result.success) throw new VideoProviderError("MALFORMED");
    const found = result.data.items[0]; return found && found.snippet.customUrl.toLowerCase() === handle.toLowerCase() ? { channelId: found.id, handle: found.snippet.customUrl } : null;
  }
  async searchMatchHighlights(match: VideoMatch, source: VideoSource) {
    if (!source.channelId) return [];
    const raw = await this.request("search", { part: "id", type: "video", channelId: source.channelId, maxResults: "5", order: "date", regionCode: "VN", relevanceLanguage: "vi", q: `${match.home[0]} ${match.away[0]} highlights`, publishedAfter: new Date(Date.parse(match.kickoffAt) + 75 * 60000).toISOString(), publishedBefore: new Date(Date.parse(match.kickoffAt) + 72 * 3600000).toISOString() });
    const result = z.object({ items: z.array(z.object({ id: z.object({ videoId: id }) })).max(5) }).safeParse(raw);
    if (!result.success) throw new VideoProviderError("MALFORMED");
    return [...new Set(result.data.items.map((entry) => entry.id.videoId))];
  }
  async getVideos(ids: string[]) {
    if (!ids.length) return { videos: [], missingIds: [] };
    const requested = [...new Set(z.array(id).max(50).parse(ids))];
    const raw = await this.request("videos", { part: "snippet,contentDetails,status", id: requested.join(",") });
    const parsed = z.object({ items: z.array(item).max(50) }).safeParse(raw);
    if (!parsed.success || parsed.data.items.some((entry) => !requested.includes(entry.id)) || new Set(parsed.data.items.map((entry) => entry.id)).size !== parsed.data.items.length) throw new VideoProviderError("MALFORMED");
    const videos: VideoCandidate[] = parsed.data.items.map((entry) => {
      const region = entry.contentDetails.regionRestriction;
      const explicitRegion = Array.isArray(region?.allowed) || Array.isArray(region?.blocked);
      const vn = region?.blocked?.includes("VN") || region?.allowed && !region.allowed.includes("VN") ? "UNAVAILABLE" : explicitRegion ? "AVAILABLE" : "UNKNOWN";
      const publicReady = entry.status.privacyStatus === "public" && entry.status.uploadStatus === "processed" && (!entry.snippet.liveBroadcastContent || entry.snippet.liveBroadcastContent === "none");
      return videoCandidateSchema.parse({ externalId: entry.id, channelId: entry.snippet.channelId, channelName: entry.snippet.channelTitle, title: entry.snippet.title, description: entry.snippet.description?.slice(0, 6000) ?? null, publishedAt: entry.snippet.publishedAt, durationSeconds: duration(entry.contentDetails.duration), language: entry.snippet.defaultAudioLanguage ?? entry.snippet.defaultLanguage ?? null, availability: entry.status.privacyStatus === "private" ? "PRIVATE" : publicReady ? "AVAILABLE" : "UNAVAILABLE", vietnamAvailability: vn, embedAllowed: entry.status.embeddable ?? null });
    });
    // A missing public API item cannot distinguish removal from privacy. Never invent the reason.
    return { videos, missingIds: requested.filter((key) => !videos.some((video) => video.externalId === key)) };
  }
}
