import type { PrismaClient, Prisma } from "@prisma/client";

export interface SqlExecutor {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
}
export interface SyncDatabase extends SqlExecutor {
  transaction<T>(work: (tx: SqlExecutor) => Promise<T>): Promise<T>;
}
export function prismaSyncDatabase(client: PrismaClient): SyncDatabase {
  const wrap = (db: Prisma.TransactionClient): SqlExecutor => ({
    query: <T>(sql: string, params: unknown[] = []) => db.$queryRawUnsafe<T[]>(sql, ...params),
  });
  // The limit is generous because the database can sit an ocean away from the worker (GitHub runners in the US, Supabase in
  // Sydney): saving a few dozen articles is hundreds of round trips. Single queries still stop at 3 seconds (database-client).
  return { ...wrap(client), transaction: (work) => client.$transaction((tx) => work(wrap(tx)), { timeout: 180_000, maxWait: 15_000 }) };
}
