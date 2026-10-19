import type { NewsProvider, NewsSourceConfig } from "../types/news-provider";
import { z } from "zod";
import { canIngest } from "../providers/news/sources";
import { normalizedArticleSchema } from "../providers/news/normalization";
import { NewsError, safeNewsError } from "../providers/news/errors";
import type { NewsSyncStore, NewsJob } from "./news-store";
import { parseReusableLicense } from "../lib/news-licenses";

type Logger = { info(fields: Record<string, unknown>, event: string): void; error(fields: Record<string, unknown>, event: string): void };
const cursorSchema = z.object({ etag: z.string().regex(/^[\x20-\x7E]{1,300}$/).optional(), lastModified: z.string().regex(/^[\x20-\x7E]{1,100}$/).optional() }).strict();
export async function syncNews(sources: NewsSourceConfig[], store: NewsSyncStore, createProvider: (source: NewsSourceConfig) => NewsProvider, options: { limit?: number; logger?: Logger } = {}) {
  const results: { source: string; status: "synced" | "cached" | "skipped" | "failed"; code?: string; created?: number; duplicates?: number; rejected?: number; conflicts?: number; processed?: number }[] = [];
  for (const source of sources) {
    let job: NewsJob | undefined;
    try {
      const gate = !source.enabled ? "DISABLED" : !canIngest(source) ? "RIGHTS_REQUIRED" : undefined;
      await store.ensureStatus(source, gate);
      if (gate) { results.push({ source: source.slug, status: "skipped", code: gate }); continue; }
      job = await store.claim(source);
      if (job.cached || job.cooldown) { results.push({ source: source.slug, status: job.cached ? "cached" : "skipped", code: job.cooldown ? "COOLDOWN" : undefined }); continue; }
      const provider = createProvider(source);
      if (provider.sourceSlug !== source.slug) throw new NewsError("UNSUPPORTED");
      const limit = Math.min(20, Math.max(1, options.limit ?? 20));
      const page = await provider.fetchLatestArticles({ cursor: job.cursor, limit });
      if (!Array.isArray(page.articles) || page.articles.length > limit || !Number.isInteger(page.rejected) || page.rejected < 0 || typeof page.notModified !== "boolean" || page.notModified && page.articles.length) throw new NewsError("MALFORMED");
      // Revalidate the internal DTO at the service boundary; discard any extra body fields.
      const validated = z.array(normalizedArticleSchema).safeParse(page.articles);
      const cursor = cursorSchema.safeParse(page.cursor);
      if (!validated.success) throw new NewsError("INVALID_ARTICLE");
      if (!cursor.success) throw new NewsError("MALFORMED");
      const articles = validated.data;
      for (const article of articles) {
        if (source.requiresReusableLicense && !article.license) throw new NewsError("MISSING_LICENSE");
        if (article.license) {
          Object.assign(article.license, parseReusableLicense(article.license.name, article.license.url));
          if (!article.publishedAt || !article.license.commercialReuseAllowed) throw new NewsError("UNSUPPORTED_LICENSE");
        }
      }
      const allowedUrl = (value: string) => { const url = new URL(value); return url.protocol === "https:" && url.hostname === source.domain && !url.username && !url.password && !url.port; };
      if (articles.some((article) => article.sourceName !== source.name || (article.excerptOriginal?.length ?? 0) > source.maxExcerptChars || !allowedUrl(article.sourceUrl) || article.canonicalUrl && !allowedUrl(article.canonicalUrl))) throw new NewsError("INVALID_ARTICLE");
      const counts = await store.complete(job, source, articles, page.rejected, cursor.data, page.notModified);
      results.push({ source: source.slug, status: "synced", ...counts });
      options.logger?.info({ source: source.slug, jobId: job.id, ...counts }, "news.sync_completed");
    } catch (error) {
      const safe = safeNewsError(error);
      if (job && !job.cached && !job.cooldown) { try { await store.fail(job, source, safe); } catch { /* Report safely and keep other sources independent even during DB errors. */ } }
      results.push({ source: source.slug, status: "failed", code: safe.code });
      options.logger?.error({ source: source.slug, code: safe.code }, "news.sync_failed");
    }
  }
  return results;
}
