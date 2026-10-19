import { randomUUID } from "node:crypto";
import { z } from "zod";
import { AdminError } from "../lib/admin-policy";
import type { SqlExecutor, SyncDatabase } from "../lib/sync-database";
import type { SessionResolver } from "./following";

export async function requireAdmin(tx: SqlExecutor, session: SessionResolver, lock = false) {
  const user = await session();
  if (!user || !z.uuid().safeParse(user.id).success) throw new AdminError("FORBIDDEN", 403);
  const [actor] = await tx.query<{ id: string; name: string }>(`SELECT id,"displayName" AS name FROM "User" WHERE id=$1::uuid AND role='ADMIN'${lock ? " FOR SHARE" : ""}`, [user.id]);
  if (!actor) throw new AdminError("FORBIDDEN", 403);
  return actor;
}
export const scopedDatabase = (tx: SqlExecutor): SyncDatabase => ({ query: tx.query.bind(tx), transaction: (work) => work(tx) });
export async function adminAudit(tx: SqlExecutor, actorId: string, action: string, targetType: string, targetId: string, reason: string, before: unknown, after: unknown) {
  const id = randomUUID();
  await tx.query('INSERT INTO "AdminAuditLog" (id,"actorId",action,"targetType","targetId",reason,before,after) VALUES ($1::uuid,$2::uuid,$3,$4,$5,$6,$7::jsonb,$8::jsonb)', [id, actorId, action, targetType, targetId, reason, JSON.stringify(before ?? null), JSON.stringify(after ?? null)]);
  return id;
}
