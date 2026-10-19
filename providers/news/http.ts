import robotsParser from "robots-parser";
import type { NewsCursor } from "../../types/news-provider";
import type { SourceDefinition } from "./sources";
import { NewsError } from "./errors";

export const newsUserAgent = "FootballMorningBriefBot/0.1";
export type NewsHttpOptions = { fetch?: typeof fetch; timeoutMs?: number; sleep?: (ms: number) => Promise<void> };
export class NewsHttp {
  private readonly fetcher: typeof fetch;
  private readonly pause: (ms: number) => Promise<void>;
  constructor(private readonly options: NewsHttpOptions = {}) { this.fetcher = options.fetch ?? fetch; this.pause = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))); }
  private async request(url: string, maxBytes: number, cursor?: NewsCursor): Promise<{ text: string; cursor: NewsCursor; status: number; contentType: string }> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new NewsError("TIMEOUT")); }, this.options.timeoutMs ?? 10000); });
        const work = async () => {
          const headers: Record<string, string> = { "User-Agent": newsUserAgent, Accept: "text/html,application/rss+xml,application/atom+xml,application/xml,text/plain" };
          // Only safe bounded validators are retained; arbitrary headers/URLs never enter the cursor.
          if (cursor?.etag && /^[\x20-\x7E]{1,300}$/.test(cursor.etag)) headers["If-None-Match"] = cursor.etag;
          if (cursor?.lastModified && /^[\x20-\x7E]{1,100}$/.test(cursor.lastModified)) headers["If-Modified-Since"] = cursor.lastModified;
          const response = await this.fetcher(url, { headers, signal: controller.signal, redirect: "manual", cache: "no-store" });
          if (response.status === 429) {
            const value = response.headers.get("retry-after");
            const duration = value && /^\d+$/.test(value) ? Number(value) * 1000 : value ? Date.parse(value) - Date.now() : 0;
            throw new NewsError("RATE_LIMITED", Math.min(86400000, Math.max(3600000, Number.isFinite(duration) ? duration : 0)));
          }
          if ([401, 403, 451].includes(response.status) || response.status >= 300 && response.status < 400 && response.status !== 304) throw new NewsError("BLOCKED");
          if (response.status === 304 && !cursor) throw new NewsError("MALFORMED");
          if (!response.ok && response.status !== 304) throw new NewsError("HTTP_ERROR", response.status >= 500 ? 1 : 0);
          if (Number(response.headers.get("content-length")) > maxBytes) throw new NewsError("TOO_LARGE");
          const reader = response.body?.getReader(); let bytes = 0; const decoder = new TextDecoder(); let body = "";
          if (reader) { try { for (;;) { const chunk = await reader.read(); if (chunk.done) break; bytes += chunk.value.length; if (bytes > maxBytes) { await reader.cancel(); throw new NewsError("TOO_LARGE"); } body += decoder.decode(chunk.value, { stream: true }); } body += decoder.decode(); } finally { reader.releaseLock(); } }
          const validators: NewsCursor = {};
          const etag = response.headers.get("etag"); const modified = response.headers.get("last-modified");
          if (etag && /^[\x20-\x7E]{1,300}$/.test(etag)) validators.etag = etag;
          if (modified && /^[\x20-\x7E]{1,100}$/.test(modified)) validators.lastModified = modified;
          return { text: body, cursor: response.status === 304 ? cursor! : validators, status: response.status, contentType: response.headers.get("content-type") ?? "" };
        };
        return await Promise.race([work(), timeout]);
      } catch (error) {
        const safe = error instanceof NewsError ? error : new NewsError("NETWORK");
        const transient = ["NETWORK", "TIMEOUT"].includes(safe.code) || safe.code === "HTTP_ERROR" && safe.retryAfterMs === 1;
        if (!transient || attempt === 1) throw safe;
        await this.pause(500 + Math.floor(Math.random() * 250));
      } finally { if (timer) clearTimeout(timer); controller.abort(); }
    }
    throw new NewsError("NETWORK");
  }
  async read(definition: SourceDefinition, cursor?: NewsCursor) {
    // Only configured HTTPS origins/endpoints. No navigation, resource loads, or redirect following.
    const endpoint = new URL(definition.endpoint);
    if (endpoint.protocol !== "https:" || endpoint.hostname !== definition.domain || endpoint.username || endpoint.password || endpoint.port) throw new NewsError("UNSUPPORTED");
    const robotsUrl = `${endpoint.origin}/robots.txt`;
    let policy: Awaited<ReturnType<NewsHttp["request"]>>;
    try { policy = await this.request(robotsUrl, 256000); } catch (error) { if (error instanceof NewsError && error.code === "RATE_LIMITED") throw error; throw new NewsError("ROBOTS_DENIED"); }
    if (!/^text\/plain\b/i.test(policy.contentType) || /<html|<!doctype html/i.test(policy.text)) throw new NewsError("ROBOTS_DENIED");
    const robots = robotsParser(robotsUrl, policy.text);
    if (robots.isAllowed(definition.endpoint, newsUserAgent) === false) throw new NewsError("ROBOTS_DENIED");
    const delay = robots.getCrawlDelay(newsUserAgent) ?? 0;
    if (delay > 10) throw new NewsError("ROBOTS_DENIED");
    await this.pause(Math.max(1000, delay * 1000));
    return this.request(definition.endpoint, 2000000, cursor);
  }
}
