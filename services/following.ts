import { randomUUID } from "node:crypto";
import { z } from "zod";
import { AccountError, followTargetSchema, preferenceSchema, type FollowTarget } from "../lib/auth-policy";
import type { SyncDatabase } from "../lib/sync-database";

export type ActiveUser = { id: string; name?: string; email?: string };
export type SessionResolver = () => Promise<ActiveUser | null>;
/** crestUrl: the club crest for followed clubs (sidebar "Đội bóng của tôi"), null otherwise. */
export type FollowedEntity = FollowTarget & { name: string; following: boolean; crestUrl?: string | null };
const targets = { CLUB: { table: "Club", column: "clubId" }, PLAYER: { table: "Player", column: "playerId" }, COMPETITION: { table: "League", column: "leagueId" } } as const;

export async function requireAccount(resolve: SessionResolver) {
  const user = await resolve();
  if (!user || !z.uuid().safeParse(user.id).success) throw new AccountError("LOGIN_REQUIRED", 401);
  return user;
}

export class FollowingService {
  constructor(private db: SyncDatabase, private session: SessionResolver) {}
  async list(): Promise<FollowedEntity[]> {
    const user = await requireAccount(this.session);
    const rows = await this.db.query<{ type: FollowTarget["type"]; entityId: string; name: string; crestUrl: string | null }>(`SELECT
      CASE WHEN f."clubId" IS NOT NULL THEN 'CLUB' WHEN f."playerId" IS NOT NULL THEN 'PLAYER' ELSE 'COMPETITION' END AS type,
      COALESCE(f."clubId",f."playerId",f."leagueId") AS "entityId", COALESCE(c.name,p.name,l.name) AS name, c."externalCrestUrl" AS "crestUrl"
      FROM "UserFollow" f JOIN "UserPreference" u ON u.id=f."preferenceId"
      LEFT JOIN "Club" c ON c.id=f."clubId" LEFT JOIN "Player" p ON p.id=f."playerId" LEFT JOIN "League" l ON l.id=f."leagueId"
      WHERE u."userId"=$1::uuid ORDER BY name, f.id`, [user.id]);
    return rows.map((row) => ({ ...row, following: true }));
  }
  async set(input: unknown, following: boolean) {
    const user = await requireAccount(this.session);
    const parsed = followTargetSchema.safeParse(input);
    if (!parsed.success) throw new AccountError("INVALID_INPUT", 400);
    const target = parsed.data; const config = targets[target.type];
    return this.db.transaction(async (tx) => {
      // Table/column identifiers come exclusively from the fixed enum registry.
      const [entity] = await tx.query<{ name: string }>(`SELECT name FROM "${config.table}" WHERE id=$1::uuid${target.type === "COMPETITION" ? " AND slug IN ('premier-league','la-liga','champions-league')" : ""}`, [target.entityId]);
      if (!entity) throw new AccountError("NOT_FOUND", 404);
      if (following) {
        await tx.query(`INSERT INTO "UserPreference" (id,"userId",locale,timezone,"updatedAt") SELECT $1::uuid,id,locale,timezone,now() FROM "User" WHERE id=$2::uuid ON CONFLICT ("userId") DO NOTHING`, [randomUUID(), user.id]);
        await tx.query(`INSERT INTO "UserFollow" (id,"preferenceId","${config.column}","updatedAt") SELECT $1::uuid,id,$3::uuid,now() FROM "UserPreference" WHERE "userId"=$2::uuid ON CONFLICT ("preferenceId","${config.column}") DO NOTHING`, [randomUUID(), user.id, target.entityId]);
      } else {
        await tx.query(`DELETE FROM "UserFollow" f USING "UserPreference" p WHERE f."preferenceId"=p.id AND p."userId"=$1::uuid AND f."${config.column}"=$2::uuid`, [user.id, target.entityId]);
      }
      return { ...target, name: entity.name, following };
    });
  }
  async catalog(search = ""): Promise<FollowedEntity[]> {
    await requireAccount(this.session);
    const term = search.trim().slice(0, 80);
    // Search canonical rows and their aliases; never insert an entity from an alias/name.
    const rows = await this.db.query<{ type: FollowTarget["type"]; entityId: string; name: string }>(`SELECT * FROM (
      SELECT 'COMPETITION' AS type,id AS "entityId",name FROM "League" WHERE slug IN ('premier-league','la-liga','champions-league')
      UNION ALL SELECT 'CLUB',id,name FROM "Club" WHERE $1<>'' AND (strpos(lower(name),lower($1))>0 OR EXISTS (SELECT 1 FROM unnest(aliases) a WHERE strpos(lower(a),lower($1))>0))
      UNION ALL SELECT 'PLAYER',id,name FROM "Player" WHERE $1<>'' AND (strpos(lower(name),lower($1))>0 OR EXISTS (SELECT 1 FROM unnest(aliases) a WHERE strpos(lower(a),lower($1))>0))
      ) e ORDER BY type,name,"entityId" LIMIT 30`, [term]);
    const follows = new Set((await this.list()).map((row) => `${row.type}:${row.entityId}`));
    return rows.map((row) => ({ ...row, following: follows.has(`${row.type}:${row.entityId}`) }));
  }
}

export class UserPreferenceService {
  constructor(private db: SyncDatabase, private session: SessionResolver) {}
  async get() {
    const user = await requireAccount(this.session);
    const [row] = await this.db.query<{ locale: string; timezone: string }>(`SELECT COALESCE(p.locale,u.locale) AS locale,COALESCE(p.timezone,u.timezone) AS timezone FROM "User" u LEFT JOIN "UserPreference" p ON p."userId"=u.id WHERE u.id=$1::uuid`, [user.id]);
    if (!row) throw new AccountError("LOGIN_REQUIRED", 401);
    return row;
  }
  async update(input: unknown) {
    const user = await requireAccount(this.session);
    const parsed = preferenceSchema.safeParse(input);
    if (!parsed.success) throw new AccountError("INVALID_INPUT", 400);
    const prefs = parsed.data;
    await this.db.transaction(async (tx) => {
      await tx.query(`UPDATE "User" SET locale=$2,timezone=$3,"updatedAt"=now() WHERE id=$1::uuid`, [user.id, prefs.locale, prefs.timezone]);
      await tx.query(`INSERT INTO "UserPreference" (id,"userId",locale,timezone,"updatedAt") VALUES ($1::uuid,$2::uuid,$3,$4,now()) ON CONFLICT ("userId") DO UPDATE SET locale=EXCLUDED.locale,timezone=EXCLUDED.timezone,"updatedAt"=now()`, [randomUUID(), user.id, prefs.locale, prefs.timezone]);
    });
    return prefs;
  }
}
