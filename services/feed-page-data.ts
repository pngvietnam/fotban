import "server-only";
import { cache } from "react";
import { getDatabase } from "../lib/db";
import { logger } from "../lib/logger";
import { prismaSyncDatabase } from "../lib/sync-database";
import type { FeedFilters } from "../types/feed-card";
import { FeedCardQueryService, loadFeedDetail, loadFeedList } from "./feed-card-query";

function service() {
  const db = getDatabase();
  if (!db) throw new Error("Database unavailable");
  return new FeedCardQueryService(prismaSyncDatabase(db));
}
const failed = (event: "feed.ui_list_failed" | "feed.ui_detail_failed") => () => logger.error({ requestId: crypto.randomUUID() }, event);
// Request-only memoization shares one checked read between HTML and metadata.
export const readFeedPage = cache((articleId: string) => loadFeedDetail(() => service().detail(articleId), failed("feed.ui_detail_failed")));
export const readFeedList = (filters: FeedFilters) => loadFeedList(() => service().list(filters), failed("feed.ui_list_failed"));
