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
import { AIProcessingStore } from "../services/ai-store";

export function createNewsRuntime(db: PrismaClient, options: { wikimediaUserAgent?: string } = {}) {
  const store = new NewsSyncStore(prismaSyncDatabase(db));
  return { store, createProvider: (source: NewsSourceConfig) => {
    if (vietnameseSource(source.slug)) return new VietnameseRssNewsProvider(source, async () => {
      const database = prismaSyncDatabase(db);
      const allowed = await database.query<{ id: string }>(`SELECT id FROM "League" WHERE slug IN ('premier-league','la-liga') UNION SELECT cs."clubId" FROM "ClubSeason" cs JOIN "League" l ON l.id=cs."leagueId" JOIN "Season" s ON s.id=cs."seasonId" WHERE l.slug IN ('premier-league','la-liga') AND now() BETWEEN s."startsAt" AND s."endsAt" UNION SELECT pc."playerId" FROM "PlayerClub" pc JOIN "ClubSeason" cs ON cs."clubId"=pc."clubId" JOIN "League" l ON l.id=cs."leagueId" WHERE l.slug IN ('premier-league','la-liga') AND pc."startsAt"<=now() AND (pc."endsAt" IS NULL OR pc."endsAt">=now())`);
      const ids = new Set(allowed.map((row) => row.id));
      return (await new AIProcessingStore(database).catalog()).filter((entity) => ids.has(entity.id));
    });
    if (source.slug === wikinewsConfig.slug) return new WikinewsNewsProvider(source, options.wikimediaUserAgent, { beforeRequest: async () => { await store.reserveWikimediaRequest(source.slug); } });
    const definition = definitionFor(source.slug);
    if (!definition) throw new NewsError("UNSUPPORTED");
    return new OfficialNewsProvider(source, definition);
  } };
}
