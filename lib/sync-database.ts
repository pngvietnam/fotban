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
  return { ...wrap(client), transaction: (work) => client.$transaction((tx) => work(wrap(tx)), { timeout: 30000, maxWait: 5000 }) };
}
