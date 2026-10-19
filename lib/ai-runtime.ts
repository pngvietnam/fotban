import type { PrismaClient } from "@prisma/client";
import type { AIProvider } from "../types/ai-provider";
import { RuleBasedFallbackProvider } from "../providers/ai/fallback";
import { RemoteAIProvider } from "../providers/ai/remote";
import { AIProcessingStore } from "../services/ai-store";
import { prismaSyncDatabase } from "./sync-database";

type AIConfig = { AI_PROVIDER?: "fallback" | "remote" | "local"; AI_API_KEY?: string; AI_MODEL?: string; AI_ENDPOINT?: string };
export function configuredAIProvider(config: AIConfig): { provider: AIProvider; mode: string; identity: string } {
  if (config.AI_PROVIDER === "remote" && config.AI_MODEL && config.AI_ENDPOINT) {
    return { provider: new RemoteAIProvider(config.AI_MODEL, config.AI_ENDPOINT, config.AI_API_KEY), mode: "remote", identity: `REMOTE:${config.AI_MODEL}:${config.AI_ENDPOINT}` };
  }
  return { provider: new RuleBasedFallbackProvider(), mode: config.AI_PROVIDER === "remote" || config.AI_PROVIDER === "local" ? "fallback-configuration-unavailable" : "fallback", identity: "RULE_BASED:extractive-v1" };
}
export function createAIRuntime(db: PrismaClient, config: AIConfig) {
  return { store: new AIProcessingStore(prismaSyncDatabase(db)), ...configuredAIProvider(config) };
}
