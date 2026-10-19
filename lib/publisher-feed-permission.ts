import { z } from "zod";
import { vietnameseFeedUrls } from "../providers/news/vietnamese-sources";

/** A feed article may come from the source's primary feed or one of its registered extra feeds. */
export const feedUrlAllowed = (slug: string | undefined, sourceFeedUrl: string | null | undefined, url: string) => url === sourceFeedUrl || Boolean(slug && vietnameseFeedUrls(slug).includes(url));

export const feedScopeSchema = z.enum(["NONE", "DISCOVERY_METADATA", "RSS_METADATA", "RSS_SUMMARY"]);
export const feedMetadataSchema = z.object({
  url: z.url(), termsUrl: z.url(), scope: z.enum(["RSS_METADATA", "RSS_SUMMARY"]), attribution: z.string().trim().min(1).max(4000), reviewedAt: z.date(),
  categories: z.array(z.string().max(100)).max(10), evidenceReferences: z.array(z.url().max(2048)).max(10), imageUrl: z.url().max(1000).optional(),
});
type FeedSource = { id?: string; slug?: string; domain: string; enabled: boolean; termsReviewed: boolean; ingestionAllowed: boolean; permissionStatus: string; commercialReuseAllowed?: boolean; reviewer: string | null; reviewedAt: Date | string | null; permissionReference: string | null; ingestionMethod?: string; permissionScope?: string; feedUrl?: string | null; attributionRequirement?: string | null; lastTermsReviewAt?: Date | string | null; maxExcerptChars?: number };
const instant = (date: unknown) => date instanceof Date ? date.getTime() : typeof date === "string" ? Date.parse(date) : NaN;
export function publisherFeedAllowed(source: FeedSource) {
  try {
    const feed = new URL(source.feedUrl ?? ""); const terms = new URL(source.permissionReference ?? "");
    return source.enabled && source.termsReviewed && source.ingestionAllowed && source.permissionStatus === "ALLOWED" && source.commercialReuseAllowed === true && source.ingestionMethod === "RSS" && ["RSS_METADATA", "RSS_SUMMARY"].includes(source.permissionScope ?? "") &&
      // A summary grant with a zero excerpt cap would silently store no summary at all.
      (source.permissionScope !== "RSS_SUMMARY" || (source.maxExcerptChars ?? 0) > 0) && Boolean(source.reviewer?.trim() && source.attributionRequirement?.trim()) && Number.isFinite(instant(source.reviewedAt)) && Number.isFinite(instant(source.lastTermsReviewAt)) && feed.protocol === "https:" && feed.hostname === source.domain && !feed.username && !feed.password && !feed.port && terms.protocol === "https:" && !terms.username && !terms.password;
  } catch { return false; }
}
const snapshotSchema = z.object({ articleId: z.uuid(), sourceId: z.uuid(), feedUrl: z.url(), termsUrl: z.url(), permissionScope: z.enum(["RSS_METADATA", "RSS_SUMMARY"]), attributionText: z.string(), reviewedAt: z.string(), title: z.string(), excerpt: z.string().nullable(), publishedAt: z.string() });
const feedSourceSchema = z.object({ id: z.uuid(), slug: z.string().optional(), domain: z.string(), enabled: z.boolean(), termsReviewed: z.boolean(), ingestionAllowed: z.boolean(), permissionStatus: z.string(), commercialReuseAllowed: z.boolean(), reviewer: z.string().nullable(), reviewedAt: z.union([z.date(),z.string()]).nullable(), permissionReference: z.string().nullable(), ingestionMethod: z.string(), permissionScope: z.string(), feedUrl: z.string().nullable(), attributionRequirement: z.string().nullable(), lastTermsReviewAt: z.union([z.date(),z.string()]).nullable(), maxExcerptChars: z.number().int() });
/** Non-CC publisher permission is exact and revocable, never a synthetic CC licence. */
export function permittedFeedSnapshot(article: { id: string; sourceId?: string; sourceUrl: string; titleOriginal: string; excerptOriginal: string | null; publishedAt: unknown; contentOriginal?: string | null }, rawSource: unknown, raw: unknown) {
  const parsedSource = feedSourceSchema.safeParse(rawSource); if (!parsedSource.success) return null;
  const source = parsedSource.data;
  const parsed = snapshotSchema.safeParse(raw);
  if (!parsed.success || !publisherFeedAllowed(source)) return null;
  const snapshot = parsed.data;
  if (snapshot.articleId !== article.id || snapshot.sourceId !== source.id || article.sourceId && article.sourceId !== source.id || !feedUrlAllowed(source.slug, source.feedUrl, snapshot.feedUrl) || snapshot.termsUrl !== source.permissionReference || snapshot.permissionScope !== source.permissionScope || snapshot.attributionText !== source.attributionRequirement || instant(snapshot.reviewedAt) !== instant(source.lastTermsReviewAt) || snapshot.title !== article.titleOriginal || snapshot.excerpt !== article.excerptOriginal || instant(snapshot.publishedAt) !== instant(article.publishedAt) || article.contentOriginal || source.permissionScope === "RSS_METADATA" && snapshot.excerpt !== null) return null;
  try { const url = new URL(article.sourceUrl); if (url.protocol !== "https:" || url.hostname !== source.domain || url.username || url.password) return null; } catch { return null; }
  return snapshot;
}
