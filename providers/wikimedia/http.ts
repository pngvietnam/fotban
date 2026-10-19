import { NewsError } from "../news/errors";
import { wikinewsConfig } from "./config";

export type WikimediaHttpOptions = { fetch?: typeof fetch; sleep?: (ms: number) => Promise<void>; timeoutMs?: number; beforeRequest?: () => Promise<void> };
export function validateWikimediaUserAgent(value: string | undefined) {
  if (!value || value.length > 300 || !/^[\x20-\x7E]+$/.test(value) || !/^[A-Za-z][\w .-]*\/[\w.-]+ \([^()]+\)/.test(value) || !/(?:[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|https:\/\/[a-z0-9.-]+\.[a-z]{2,})/i.test(value)) throw new NewsError("USER_AGENT_REQUIRED");
  return value;
}
export class WikimediaHttp {
  private readonly fetcher: typeof fetch;
  private readonly pause: (ms: number) => Promise<void>;
  constructor(private readonly userAgent: string | undefined, private readonly options: WikimediaHttpOptions = {}) {
    this.fetcher = options.fetch ?? fetch; this.pause = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }
  async get(params: Record<string, string>): Promise<unknown> {
    const agent = validateWikimediaUserAgent(this.userAgent);
    const url = new URL(wikinewsConfig.endpoint);
    url.search = new URLSearchParams({ format: "json", formatversion: "2", maxlag: "5", ...params }).toString();
    for (let attempt = 0; attempt < 2; attempt++) {
      if (this.options.beforeRequest) await this.options.beforeRequest(); else await this.pause(2000);
      const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new NewsError("TIMEOUT")); }, this.options.timeoutMs ?? 10000); });
        const work = async () => {
          const response = await this.fetcher(url, { headers: { "User-Agent": agent, "Api-User-Agent": agent, Accept: "application/json" }, redirect: "manual", signal: controller.signal, cache: "no-store" });
          const retry = response.headers.get("retry-after");
          const delay = retry && /^\d+$/.test(retry) ? Number(retry) * 1000 : retry ? Date.parse(retry) - Date.now() : 0;
          if (response.status === 429 || response.status === 503 && retry) throw new NewsError("RATE_LIMITED", Math.max(60000, Number.isFinite(delay) ? delay : 0));
          if (response.status === 401 || response.status === 403 || response.status >= 300 && response.status < 400) throw new NewsError("BLOCKED");
          if (!response.ok) throw new NewsError("HTTP_ERROR", response.status >= 500 ? 1 : 0);
          if (!/application\/json/i.test(response.headers.get("content-type") ?? "")) throw new NewsError("MALFORMED");
          if (Number(response.headers.get("content-length")) > 2000000) throw new NewsError("TOO_LARGE");
          const reader = response.body?.getReader(); let bytes = 0; let body = ""; const decoder = new TextDecoder();
          if (reader) { try { for (;;) { const chunk = await reader.read(); if (chunk.done) break; bytes += chunk.value.length; if (bytes > 2000000) { await reader.cancel(); throw new NewsError("TOO_LARGE"); } body += decoder.decode(chunk.value, { stream: true }); } body += decoder.decode(); } finally { reader.releaseLock(); } }
          let result: unknown; try { result = JSON.parse(body); } catch { throw new NewsError("MALFORMED"); }
          if (!result || typeof result !== "object") throw new NewsError("MALFORMED");
          if ("error" in result) {
            const error = result.error as { code?: string };
            if (["maxlag", "ratelimited"].includes(error?.code ?? "")) throw new NewsError("RATE_LIMITED", Math.max(60000, Number.isFinite(delay) ? delay : 0));
            throw new NewsError("MALFORMED");
          }
          return result;
        };
        return await Promise.race([work(), timeout]);
      } catch (error) {
        const safe = error instanceof NewsError ? error : new NewsError("NETWORK");
        const transient = ["NETWORK", "TIMEOUT"].includes(safe.code) || safe.code === "HTTP_ERROR" && safe.retryAfterMs === 1;
        if (!transient || attempt === 1) throw safe;
        await this.pause(5000 + Math.floor(Math.random() * 1000));
      } finally { if (timer) clearTimeout(timer); controller.abort(); }
    }
    throw new NewsError("NETWORK");
  }
}
