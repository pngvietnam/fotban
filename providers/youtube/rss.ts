import { XMLParser, XMLValidator } from "fast-xml-parser";
import { VideoProviderError, videoCandidateSchema, type VideoCandidate } from "../../types/video-provider";

const channelPattern = /^UC[A-Za-z0-9_-]{22}$/;
const videoPattern = /^[A-Za-z0-9_-]{11}$/;
const entities = (value: string) => value.replace(/&quot;/g, "\"").replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const text = (value: unknown) => typeof value === "string" ? entities(value).trim() : typeof value === "number" ? String(value) : "";
/** The feed writes channel IDs without their "UC" prefix (observed 2026-10-20); the author link has the full ID. */
const fullChannelId = (value: string) => /^[A-Za-z0-9_-]{22}$/.test(value) ? `UC${value}` : value;
const list = (value: unknown) => Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];

export type ChannelFeed = { channelId: string; author: string; videos: VideoCandidate[] };
export type EmbedStatus = "EMBEDDABLE" | "NOT_EMBEDDABLE" | "GONE";
type Options = { fetch?: typeof fetch; timeoutMs?: number; sleep?: (ms: number) => Promise<void>; attempts?: number };

/**
 * YouTube's public channel feed (feeds/videos.xml): the channel's latest ~15 public uploads with
 * title, description and publish time. Free and keyless, so it is read often instead of the
 * quota-limited search API. A feed lists only public videos; region blocks are not visible here,
 * so Vietnam availability stays UNKNOWN.
 */
export class YouTubeFeedReader {
  constructor(private options: Options = {}) {}
  /** No cache-control headers: the feed endpoint answers them with 404/500 (observed 2026-10-20). */
  private async get(url: string) {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 10000);
    try {
      return await (this.options.fetch ?? fetch)(url, { signal: controller.signal, redirect: "follow", headers: { Accept: "application/atom+xml, application/xml, application/json" } });
    } catch { throw new VideoProviderError(controller.signal.aborted ? "TIMEOUT" : "NETWORK"); }
    finally { clearTimeout(timer); }
  }
  async feed(channelId: string): Promise<ChannelFeed> {
    if (!channelPattern.test(channelId)) throw new VideoProviderError("MALFORMED");
    // The feed endpoint answers a valid channel with 404/5xx now and then (observed 2026-10-20); a short retry clears it.
    const sleep = this.options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
    let response = await this.get(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`);
    for (let attempt = 1; attempt < (this.options.attempts ?? 4) && (response.status === 404 || response.status >= 500); attempt++) {
      await sleep(1500 * attempt);
      response = await this.get(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`);
    }
    if (response.status === 404) throw new VideoProviderError("UNAUTHORIZED");
    if (!response.ok) throw new VideoProviderError(response.status >= 500 ? "UPSTREAM" : "MALFORMED");
    const xml = await response.text();
    if (xml.length > 2 * 1024 * 1024 || /<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true) throw new VideoProviderError("MALFORMED");
    const root = new XMLParser({ ignoreAttributes: false, parseTagValue: false, processEntities: false, removeNSPrefix: true }).parse(xml) as Record<string, unknown>;
    const feed = (root.feed ?? {}) as Record<string, unknown>;
    const feedChannel = fullChannelId(text(feed.channelId));
    const authorNode = (feed.author ?? {}) as Record<string, unknown>;
    const author = text(authorNode.name);
    if (feedChannel !== channelId || !author || text(authorNode.uri) !== `https://www.youtube.com/channel/${channelId}`) throw new VideoProviderError("MALFORMED");
    const videos = list(feed.entry).flatMap((raw): VideoCandidate[] => {
      const entry = raw as Record<string, unknown>;
      const group = (entry.group ?? {}) as Record<string, unknown>;
      const parsed = videoCandidateSchema.safeParse({
        externalId: text(entry.videoId), channelId: fullChannelId(text(entry.channelId)), channelName: author, title: text(entry.title).slice(0, 500),
        description: text(group.description).slice(0, 6000) || null, publishedAt: new Date(text(entry.published)).toISOString(),
        durationSeconds: null, language: null, availability: "AVAILABLE", vietnamAvailability: "UNKNOWN", embedAllowed: null,
      });
      return parsed.success && videoPattern.test(parsed.data.externalId) && parsed.data.channelId === channelId ? [parsed.data] : [];
    });
    return { channelId, author, videos };
  }
  /**
   * A channel's whole upload history through the Data API (playlistItems.list on the channel's uploads
   * playlist): 1 quota unit per page of 50, no search calls. The key stays in the request URL only and
   * is never logged. Used for the one-off backfill of matches older than the ~15 videos the feed lists.
   */
  async uploads(channelId: string, apiKey: string, maxPages = 80): Promise<ChannelFeed> {
    if (!channelPattern.test(channelId) || !apiKey) throw new VideoProviderError(apiKey ? "MALFORMED" : "NOT_CONFIGURED");
    const playlist = `UU${channelId.slice(2)}`;
    const videos: VideoCandidate[] = []; let author = ""; let pageToken = "";
    for (let page = 0; page < maxPages; page++) {
      const response = await this.get(`https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50&playlistId=${playlist}${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}&key=${encodeURIComponent(apiKey)}`);
      if (response.status === 403 || response.status === 429) throw new VideoProviderError("QUOTA");
      if (response.status === 400 || response.status === 401) throw new VideoProviderError("UNAUTHORIZED");
      if (!response.ok) throw new VideoProviderError(response.status >= 500 ? "UPSTREAM" : "MALFORMED");
      const body = (await response.json()) as { items?: { snippet?: Record<string, unknown> }[]; nextPageToken?: string };
      for (const item of body.items ?? []) {
        const snippet = item.snippet ?? {}; const resource = (snippet.resourceId ?? {}) as Record<string, unknown>;
        if (text(snippet.videoOwnerChannelId) !== channelId) continue; // a playlist entry from another channel
        author ||= text(snippet.videoOwnerChannelTitle);
        const parsed = videoCandidateSchema.safeParse({
          externalId: text(resource.videoId), channelId, channelName: text(snippet.videoOwnerChannelTitle) || author, title: text(snippet.title).slice(0, 500) || "-",
          description: text(snippet.description).slice(0, 6000) || null, publishedAt: new Date(text(snippet.publishedAt)).toISOString(),
          durationSeconds: null, language: null, availability: "AVAILABLE", vietnamAvailability: "UNKNOWN", embedAllowed: null,
        });
        if (parsed.success && videoPattern.test(parsed.data.externalId) && parsed.data.title !== "Private video" && parsed.data.title !== "Deleted video") videos.push(parsed.data);
      }
      if (!body.nextPageToken) break; pageToken = body.nextPageToken;
    }
    if (!author) throw new VideoProviderError("MALFORMED");
    return { channelId, author, videos };
  }
  /**
   * What YouTube's public oEmbed endpoint says about a video: 200 from the expected channel means
   * public and embeddable; 401/403 means the owner turned embedding off (or made it private), so
   * it is shown as a link only; 404, or another channel, means it is gone.
   */
  async embedStatus(videoId: string, author: string): Promise<EmbedStatus> {
    if (!videoPattern.test(videoId)) throw new VideoProviderError("MALFORMED");
    const response = await this.get(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}`);
    if (response.status === 401 || response.status === 403) return "NOT_EMBEDDABLE";
    if (response.status === 404) return "GONE";
    if (!response.ok) throw new VideoProviderError(response.status >= 500 ? "UPSTREAM" : "MALFORMED");
    const body = await response.json().catch(() => null) as { author_name?: unknown } | null;
    return typeof body?.author_name === "string" && body.author_name.trim() === author.trim() ? "EMBEDDABLE" : "GONE";
  }
}
