import type { NewsIngestionMethod, SourceType } from "@prisma/client";
import type { z } from "zod";
import type { feedMetadataSchema } from "../lib/publisher-feed-permission";

export type NewsCursor = { etag?: string; lastModified?: string };
export type NormalizedArticle = {
  sourceName: string; sourceUrl: string; canonicalUrl: string | null;
  titleOriginal: string; excerptOriginal: string | null; language: string;
  publishedAt: Date | null; collectedAt: Date;
  publishedAtPrecision?: "DAY" | "INSTANT";
  /** Discovery permission is not a publisher content-reuse license. */
  discovery?: { provider: "GDELT_DOC"; domain: string; country: string | null; seenAt: Date; query: string; metadataUsage: "DISCOVERY_ONLY" };
  feed?: z.infer<typeof feedMetadataSchema>;
  license?: { name: string; url: string; attribution: string; evidenceUrl: string; revisionUrl: string; verifiedAt: Date; commercialReuseAllowed: true };
};
export type NewsSourceConfig = {
  id: string; slug: string; name: string; domain: string; type: SourceType;
  reliabilityScore: number; enabled: boolean; language: string | null; country: string | null;
  official: boolean; termsReviewed: boolean; ingestionAllowed: boolean;
  reviewer: string | null; reviewedAt: Date | null; permissionReference: string | null;
  maxExcerptChars: number; ingestionMethod: NewsIngestionMethod;
  permissionStatus: "UNREVIEWED" | "ALLOWED" | "RESTRICTED";
  commercialReuseAllowed: boolean; requiresReusableLicense: boolean;
  permissionScope?: string; feedUrl?: string | null; attributionRequirement?: string | null; lastTermsReviewAt?: Date | null; newsPriority?: number; ingestionNotes?: string | null;
};
/** stats: optional bounded per-run counters (e.g. examined/relevant/stale) recorded in the job checkpoint. */
export type NewsPage = { articles: NormalizedArticle[]; rejected: number; cursor: NewsCursor; notModified: boolean; stats?: Record<string, number> };
export interface NewsProvider {
  readonly sourceSlug: string;
  fetchLatestArticles(input: { cursor?: NewsCursor; limit: number }): Promise<NewsPage>;
}
