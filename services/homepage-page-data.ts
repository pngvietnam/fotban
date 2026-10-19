import "server-only";
import { getDatabase } from "../lib/db";
import { prismaSyncDatabase } from "../lib/sync-database";
import { logger } from "../lib/logger";
import { loadHomepage, MorningHomepageService } from "./morning-homepage";

export function readHomepage(preview: unknown) {
  return loadHomepage(async () => { const db = getDatabase(); if (!db) return { kind: "empty" }; return new MorningHomepageService(prismaSyncDatabase(db), process.env.NODE_ENV).read(preview); }, () => logger.error({ code: "HOMEPAGE_READ_FAILED" }, "homepage.read_failed"));
}
