import type { PrismaClient } from "@prisma/client";
import type { parseEnvironment } from "./config";
import { FootballDataMatchProvider } from "../providers/football-data/provider";
import { FOOTBALL_DATA } from "../providers/football-data/config";
import { MatchSyncStore, prismaSyncDatabase } from "../services/match-store";
import { HighlightlyProvider } from "../providers/highlightly/provider";
import { HIGHLIGHTLY } from "../providers/highlightly/config";
import { exhaustQuota } from "../services/match-details";

/** The detail provider spends from a persisted daily allowance and stops for the day on HTTP 429. */
export function createMatchDetailApi(db: PrismaClient, apiKey: string) {
  const database = prismaSyncDatabase(db);
  let nextAt = 0;
  return new HighlightlyProvider(apiKey, {
    beforeRequest: async () => { const wait = nextAt - Date.now(); if (wait > 0) await new Promise<void>((resolve) => setTimeout(resolve, wait)); nextAt = Date.now() + HIGHLIGHTLY.requestIntervalMs; },
    onRateLimit: () => exhaustQuota(database, new Date()),
  });
}
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
