import "server-only";
import { cache } from "react";
import { getDatabase } from "../lib/db";
import { logger } from "../lib/logger";
import { prismaSyncDatabase } from "../lib/sync-database";
import type { NewsFilters } from "../types/news-ui";
import { loadNewsDetail, loadNewsList, NewsQueryService } from "./news-ui-data";

function service() {
  const db = getDatabase();
  if (!db) throw new Error("Database unavailable");
  return new NewsQueryService(prismaSyncDatabase(db));
}
const failed = (event: "news.ui_list_failed" | "news.ui_detail_failed") => () => logger.error({ requestId: crypto.randomUUID() }, event);
// Request-only memoization shares the permission-checked result between HTML and metadata.
export const readNewsPage = cache((slug: string) => loadNewsDetail(slug, () => service().detail(slug), failed("news.ui_detail_failed")));
export const readNewsList = (filters: NewsFilters) => loadNewsList(() => service().list(filters), failed("news.ui_list_failed"));
