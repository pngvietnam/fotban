import { commentApiErrorCode, parseCommentThreads, parseVideoStatistics, type ApiComment, type CommentApiErrorCode } from "../../lib/fan-comments";

/** A refused or failed request. The message is the code only: never a URL, a key or a response body. */
export class CommentApiError extends Error {
  constructor(readonly code: CommentApiErrorCode) { super(code); this.name = "CommentApiError"; }
}
/** What the fan pulse needs from YouTube: each video's public comment count (1 unit per 50 videos) and its most relevant comments (1 unit). */
export type FanCommentApi = {
  statistics(videoIds: string[]): Promise<Map<string, number | null>>;
  comments(videoId: string): Promise<ApiComment[]>;
};
/** The HTTP reader, injectable so tests never reach the network. */
export type HttpReader = (url: URL, init: { headers: Record<string, string>; signal: AbortSignal; redirect: "error"; cache: "no-store" }) => Promise<{ status: number; ok: boolean; text(): Promise<string> }>;

/** The YouTube Data API v3 reader. The key travels in a header (redacted by the logger), never in the URL. */
export function youTubeCommentApi(key: string, http: HttpReader = fetch, timeoutMs = 10_000): FanCommentApi {
  async function request(endpoint: "videos" | "commentThreads", params: Record<string, string>) {
    const url = new URL(`https://www.googleapis.com/youtube/v3/${endpoint}`); url.search = new URLSearchParams(params).toString();
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await http(url, { headers: { "X-Goog-Api-Key": key, Accept: "application/json" }, signal: controller.signal, redirect: "error", cache: "no-store" });
      const text = await response.text();
      if (!response.ok) throw new CommentApiError(commentApiErrorCode(response.status, text.slice(0, 4000)));
      if (text.length > 2 * 1024 * 1024) throw new CommentApiError("MALFORMED");
      try { return JSON.parse(text) as unknown; } catch { throw new CommentApiError("MALFORMED"); }
    } catch (error) {
      if (error instanceof CommentApiError) throw error;
      throw new CommentApiError(controller.signal.aborted ? "TIMEOUT" : "NETWORK");
    } finally { clearTimeout(timer); }
  }
  return {
    async statistics(videoIds) {
      const ids = [...new Set(videoIds)].slice(0, 50);
      if (!ids.length) return new Map();
      const parsed = parseVideoStatistics(await request("videos", { part: "statistics", id: ids.join(","), maxResults: "50" }));
      if (!parsed) throw new CommentApiError("MALFORMED");
      return parsed;
    },
    async comments(videoId) {
      const parsed = parseCommentThreads(await request("commentThreads", { part: "snippet", videoId, order: "relevance", textFormat: "plainText", maxResults: "100" }));
      if (!parsed) throw new CommentApiError("MALFORMED");
      return parsed;
    },
  };
}
