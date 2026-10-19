import { load } from "cheerio";
import { z } from "zod";
import type { NormalizedArticle, NewsSourceConfig } from "../../types/news-provider";
import type { SourceDefinition } from "./sources";
import { NewsError } from "./errors";
import { feedMetadataSchema } from "../../lib/publisher-feed-permission";

export const normalizedArticleSchema = z.object({
  sourceName: z.string().trim().min(1).max(200), sourceUrl: z.url().max(2048), canonicalUrl: z.url().max(2048).nullable(),
  titleOriginal: z.string().trim().min(1).max(500), excerptOriginal: z.string().max(280).nullable(),
  language: z.string().regex(/^[a-z]{2,3}(?:-[a-zA-Z]{2,8})?$/),
  publishedAt: z.date().nullable(), collectedAt: z.date(),
  publishedAtPrecision: z.enum(["DAY", "INSTANT"]).optional(),
  feed: feedMetadataSchema.optional(),
  // Do not silently strip discovery provenance into a normal editorial DTO.
  discovery: z.never().optional(),
  license: z.object({ name: z.string().min(1).max(100), url: z.url().max(2048), attribution: z.string().min(1).max(4000), evidenceUrl: z.url().max(2048), revisionUrl: z.url().max(2048), verifiedAt: z.date(), commercialReuseAllowed: z.literal(true) }).optional(),
});
export function plainText(value: unknown) {
  if (typeof value !== "string") return "";
  const $ = load(value); $("script,style,noscript,iframe,svg").remove();
  return $.text().replace(/\s+/g, " ").trim();
}
export function articleUrl(value: unknown, definition: SourceDefinition) {
  if (typeof value !== "string" || !value.trim() || value.length > 2048) throw new NewsError("INVALID_ARTICLE");
  const url = new URL(value, definition.endpoint);
  if (url.protocol !== "https:" || url.hostname !== definition.domain || url.username || url.password || url.port || !definition.articlePath.test(url.pathname)) throw new NewsError("INVALID_ARTICLE");
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) if (/^utm_/i.test(key) || ["fbclid", "gclid", "mc_cid", "mc_eid"].includes(key.toLowerCase())) url.searchParams.delete(key);
  url.searchParams.sort();
  return url.href;
}
function publicationDate(value: unknown) {
  if (typeof value !== "string" || !/(?:Z|[+-]\d{2}:?\d{2}|GMT|UTC)$/i.test(value.trim())) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}
export function normalizeNewsArticle(raw: { url: unknown; canonical?: unknown; title: unknown; excerpt?: unknown; published?: unknown }, source: NewsSourceConfig, definition: SourceDefinition, collectedAt: Date): NormalizedArticle {
  const sourceUrl = articleUrl(raw.url, definition);
  const canonicalUrl = raw.canonical ? articleUrl(raw.canonical, definition) : null;
  const excerpt = plainText(raw.excerpt).slice(0, source.maxExcerptChars);
  return normalizedArticleSchema.parse({ sourceName: source.name, sourceUrl, canonicalUrl,
    titleOriginal: plainText(raw.title), excerptOriginal: excerpt || null, language: source.language ?? "und",
    publishedAt: publicationDate(raw.published), collectedAt });
}
