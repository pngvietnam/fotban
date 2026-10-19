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
const pad = (value: string | number) => String(value).padStart(2, "0");
/** Naive feed dates are only accepted with an explicitly configured publisher offset.
 * Supported: US "M/D/YYYY h:mm[:ss] AM|PM" and "YYYY/MM/DD HH:mm[:ss]" / ISO without offset. */
function naiveDate(value: string, offset: string) {
  let parts: number[];
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4}) (\d{1,2}):(\d{2})(?::(\d{2}))? ?(AM|PM)$/i.exec(value);
  const ymd = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (us) {
    const hour12 = Number(us[4]);
    if (hour12 < 1 || hour12 > 12) return null;
    parts = [Number(us[3]), Number(us[1]), Number(us[2]), hour12 % 12 + (us[7].toUpperCase() === "PM" ? 12 : 0), Number(us[5]), Number(us[6] ?? 0)];
  } else if (ymd) parts = ymd.slice(1, 7).map((part) => Number(part ?? 0));
  else return null;
  const [year, month, day, hour, minute, second] = parts;
  // Reject calendar overflow such as 2/31 that Date would silently roll forward.
  const calendar = new Date(Date.UTC(year, month - 1, day));
  if (calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day || hour > 23 || minute > 59 || second > 59) return null;
  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:${pad(second)}${offset}`;
}
function publicationDate(value: unknown, naiveOffset?: string) {
  if (typeof value !== "string") return null;
  // Some .NET/ICU feeds put a narrow no-break space (U+202F) before AM/PM.
  const trimmed = value.replace(/[   ]/g, " ").trim();
  const input = /(?:Z|[+-]\d{2}(?::?\d{2})?|GMT|UTC)$/i.test(trimmed) ? trimmed : naiveOffset ? naiveDate(trimmed, naiveOffset) : null;
  if (!input) return null;
  const date = new Date(input);
  return Number.isFinite(date.getTime()) ? date : null;
}
/** Shortens permitted text at a sentence or word boundary and marks the cut. */
export function boundedExcerpt(text: string, max: number) {
  if (text.length <= max) return text;
  if (max < 2) return "";
  const cut = text.slice(0, max - 1);
  const sentence = Math.max(...[". ", "! ", "? ", "… "].map((mark) => cut.lastIndexOf(mark)));
  if (sentence >= max / 2) return cut.slice(0, sentence + 1);
  const space = cut.lastIndexOf(" ");
  return `${(space >= max / 2 ? cut.slice(0, space) : cut).replace(/[\s,;:–-]+$/u, "")}…`;
}
export function normalizeNewsArticle(raw: { url: unknown; canonical?: unknown; title: unknown; excerpt?: unknown; published?: unknown }, source: NewsSourceConfig, definition: SourceDefinition, collectedAt: Date, options: { naiveOffset?: string } = {}): NormalizedArticle {
  const sourceUrl = articleUrl(raw.url, definition);
  const canonicalUrl = raw.canonical ? articleUrl(raw.canonical, definition) : null;
  const excerpt = boundedExcerpt(plainText(raw.excerpt), source.maxExcerptChars);
  return normalizedArticleSchema.parse({ sourceName: source.name, sourceUrl, canonicalUrl,
    titleOriginal: plainText(raw.title), excerptOriginal: excerpt || null, language: source.language ?? "und",
    publishedAt: publicationDate(raw.published, options.naiveOffset), collectedAt });
}
