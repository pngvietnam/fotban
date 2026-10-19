import type { PrismaClient } from "@prisma/client";
import type { NewsSourceConfig } from "../types/news-provider";
import { prismaSyncDatabase } from "./sync-database";
import { NewsSyncStore } from "../services/news-store";
import { OfficialNewsProvider } from "../providers/news/provider";
import { definitionFor } from "../providers/news/sources";
import { NewsError } from "../providers/news/errors";
import { WikinewsNewsProvider } from "../providers/wikimedia/provider";
import { wikinewsConfig } from "../providers/wikimedia/config";
import { vietnameseSource } from "../providers/news/vietnamese-sources";
import { VietnameseRssNewsProvider } from "../providers/news/vietnamese-provider";
import { vietnameseCatalogFrom } from "../services/vietnamese-catalog";

/** Current EPL/La Liga leagues, clubs and squad players used for Vietnamese relevance filtering. */
export async function vietnameseCatalog(db: PrismaClient) {
  return vietnameseCatalogFrom(prismaSyncDatabase(db));
}
export function createNewsRuntime(db: PrismaClient, options: { wikimediaUserAgent?: string } = {}) {
  const store = new NewsSyncStore(prismaSyncDatabase(db));
  return { store, createProvider: (source: NewsSourceConfig) => {
    if (vietnameseSource(source.slug)) return new VietnameseRssNewsProvider(source, () => vietnameseCatalog(db));
    if (source.slug === wikinewsConfig.slug) return new WikinewsNewsProvider(source, options.wikimediaUserAgent, { beforeRequest: async () => { await store.reserveWikimediaRequest(source.slug); } });
    const definition = definitionFor(source.slug);
    if (!definition) throw new NewsError("UNSUPPORTED");
    return new OfficialNewsProvider(source, definition);
  } };
}
