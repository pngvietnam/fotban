import { z } from "zod";
import type { NewsProvider, NewsPage, NormalizedArticle } from "../../types/news-provider";
import { NewsError } from "../news/errors";

export const gdeltConfig = {
  endpoint: "https://api.gdeltproject.org/api/v2/doc/doc",
  attribution: "Discovery metadata: The GDELT Project — https://www.gdeltproject.org/",
  policyUrl: "https://www.gdeltproject.org/about.html#termsofuse",
  maxPerQuery: 10, requestIntervalMs: 6000, timeoutMs: 20000,
  queries: [
    { league: "premier-league", query: '("Premier League" OR "Manchester United" OR "Manchester City" OR "Liverpool FC" OR "Arsenal FC")' },
    { league: "la-liga", query: '("La Liga" OR "LaLiga" OR "Real Madrid" OR "FC Barcelona" OR "Atletico Madrid")' },
  ],
} as const;
const rowSchema = z.object({ url: z.string().max(2000), title: z.string().trim().min(5).max(500), domain: z.string().max(253), seendate: z.string().regex(/^\d{8}T\d{6}Z$/), language: z.string().min(1).max(60), sourcecountry: z.string().max(80).optional() });
const languageCode = (value: string) => ({ english: "en", spanish: "es", vietnamese: "vi" })[value.toLowerCase()] ?? value.toLowerCase();
export function gdeltDate(value: string): Date {
  const iso = value.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/, "$1-$2-$3T$4:$5:$6Z");
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 19) + "Z" !== iso) throw new NewsError("INVALID_ARTICLE");
  return date;
}
export function normalizeGdelt(raw: unknown, query: string, now: Date, hours = 24): NormalizedArticle {
  const row = rowSchema.safeParse(raw); if (!row.success) throw new NewsError("INVALID_ARTICLE");
  const value = row.data; let url: URL;
  try { url = new URL(value.url); } catch { throw new NewsError("INVALID_ARTICLE"); }
  const domain = value.domain.toLowerCase().replace(/^www\./, "");
  const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || hostname !== domain || !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(domain) || /[<>\u0000-\u001f]/u.test(value.title)) throw new NewsError("INVALID_ARTICLE");
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) if (/^utm_|^(?:fbclid|gclid)$/i.test(key)) url.searchParams.delete(key);
  const seenAt = gdeltDate(value.seendate);
  if (seenAt > now || seenAt.getTime() < now.getTime() - hours * 3600000) throw new NewsError("INVALID_ARTICLE");
  // DOC seendate is discovery time, not a verified publisher publication time.
  // Do not invent an excerpt, article body, license, or publisher timestamp.
  return { sourceName: domain, sourceUrl: url.href, canonicalUrl: url.href, titleOriginal: value.title, excerptOriginal: null, language: languageCode(value.language), publishedAt: null, collectedAt: now, discovery: { provider: "GDELT_DOC", domain, country: value.sourcecountry ?? null, seenAt, query, metadataUsage: "DISCOVERY_ONLY" } };
}

/** Metadata-only adapter. Never requests the returned publisher URLs. */
export class GdeltNewsProvider implements NewsProvider {
  readonly sourceSlug = "gdelt-doc-discovery";
  constructor(private query: string, private options: { fetch?: typeof fetch; now?: () => Date; hours?: 24 | 48; timeoutMs?: number } = {}) {}
  async fetchLatestArticles(input: { limit: number }): Promise<NewsPage> {
    const now = this.options.now?.() ?? new Date(); const hours = this.options.hours ?? 24;
    const url = new URL(gdeltConfig.endpoint);
    const limit = Math.min(gdeltConfig.maxPerQuery, Math.max(1, Math.trunc(input.limit)));
    for (const [key, value] of Object.entries({ query: this.query, mode: "ArtList", format: "json", maxrecords: String(limit), timespan: `${hours}h`, sort: "DateDesc" })) url.searchParams.set(key, value);
    let response: Response;
    const signal = AbortSignal.timeout(this.options.timeoutMs ?? gdeltConfig.timeoutMs);
    try { response = await (this.options.fetch ?? fetch)(url, { signal, redirect: "error", headers: { Accept: "application/json", "User-Agent": "FootballMorningBrief/0.1 (contact: footballmorningbrief@gmail.com)" } }); }
    catch { throw new NewsError(signal.aborted ? "TIMEOUT" : "NETWORK"); }
    if (response.status === 429) throw new NewsError("RATE_LIMITED");
    if (!response.ok) throw new NewsError(response.status === 401 || response.status === 403 ? "BLOCKED" : "HTTP_ERROR");
    let text: string;
    try {
      const reader = response.body?.getReader(); if (!reader) throw new NewsError("MALFORMED");
      const chunks: Uint8Array[] = []; let size = 0;
      try { for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > 256000) throw new NewsError("TOO_LARGE"); chunks.push(part.value); } }
      finally { await reader.cancel(); }
      text = Buffer.concat(chunks).toString("utf8");
    } catch (error) { throw error instanceof NewsError ? error : new NewsError(signal.aborted ? "TIMEOUT" : "NETWORK"); }
    let raw: unknown; try { raw = JSON.parse(text); } catch { throw new NewsError("MALFORMED"); }
    const parsed = z.object({ articles: z.array(z.unknown()).max(250) }).safeParse(raw);
    if (!parsed.success) throw new NewsError("MALFORMED");
    const articles: NormalizedArticle[] = []; let rejected = 0;
    for (const row of parsed.data.articles.slice(0, limit)) {
      try { articles.push(normalizeGdelt(row, this.query, now, hours)); } catch { rejected++; }
    }
    return { articles, rejected, cursor: {}, notModified: false };
  }
}
