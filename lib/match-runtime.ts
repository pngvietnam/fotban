import type { PrismaClient } from "@prisma/client";
import type { parseEnvironment } from "./config";
import { FootballDataMatchProvider } from "../providers/football-data/provider";
import { FOOTBALL_DATA } from "../providers/football-data/config";
import { MatchSyncStore, prismaSyncDatabase } from "../services/match-store";

// Composition root only: business services take MatchProvider, never this adapter.
export function createMatchRuntime(db: PrismaClient, env: ReturnType<typeof parseEnvironment>) {
  const store = new MatchSyncStore(prismaSyncDatabase(db));
  const provider = new FootballDataMatchProvider(env.FOOTBALL_DATA_API_KEY, {
    beforeRequest: async () => {
      await store.ensureProvider(FOOTBALL_DATA.id, "structured-matches-free");
      const delay = await store.reserveRequest(FOOTBALL_DATA.id, FOOTBALL_DATA.requestIntervalMs);
      if (delay > 0) await new Promise<void>((resolve) => setTimeout(resolve, delay));
    },
    onRateLimit: (ms) => store.cooldown(FOOTBALL_DATA.id, ms),
  });
  return { provider, store };
}
