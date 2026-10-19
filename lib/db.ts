import "server-only";
import type { PrismaClient } from "@prisma/client";
import { createDatabaseClient } from "./database-client";
import { env } from "./env";

const globalDb = globalThis as unknown as { prisma?: PrismaClient };

export function getDatabase() {
  if (!env.DATABASE_URL) return null;
  if (!globalDb.prisma) {
    globalDb.prisma = createDatabaseClient(env.DATABASE_URL);
  }
  return globalDb.prisma;
}
