import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import type { SyncDatabase } from "../lib/sync-database";
import { FollowingService, UserPreferenceService, type ActiveUser } from "../services/following";
import { accountRequest } from "../services/account-http";
import { cleanExpiredAuthentication } from "../services/auth-maintenance";
import { resetTransferDatabase, transferDatabase, transferIds } from "./fixtures/transfer-store";

describe("canonical following and private preference ownership", () => {
  let db: PGlite; let database: SyncDatabase; let current: ActiveUser | null;
  const a = randomUUID(); const b = randomUUID();
  const session = async () => current; let follows: FollowingService; let prefs: UserPreferenceService;
  const club = { type: "CLUB", entityId: transferIds.arsenal };
  beforeAll(async () => { ({ db, database } = await transferDatabase()); }, 30000);
  beforeEach(async () => {
    await resetTransferDatabase(db); await db.exec('TRUNCATE "User" CASCADE');
    for (const id of [a, b]) await db.query('INSERT INTO "User" (id,"authProvider","authSubject",email,"updatedAt") VALUES ($1::uuid,\'test-only\',$1,$2,now())', [id, `${id}@example.test`]);
    current = { id: a, name: "Người đọc A" }; follows = new FollowingService(database, session); prefs = new UserPreferenceService(database, session);
  });
  afterAll(async () => { await db?.close(); });
  it("authenticated club follow and repeated follow remain unique", async () => {
    await follows.set(club, true); await follows.set(club, true);
    expect(await follows.list()).toEqual([{ ...club, name: "Arsenal", following: true, crestUrl: null }]);
    expect((await db.query('SELECT * FROM "UserFollow"')).rows).toHaveLength(1);
  });
  it("unfollow is idempotent and scoped to the active user", async () => {
    await follows.set(club, true); current = { id: b }; await follows.set(club, true);
    current = { id: a }; await follows.set(club, false); await follows.set(club, false); expect(await follows.list()).toEqual([]);
    current = { id: b }; expect(await follows.list()).toHaveLength(1);
  });
  it("supports canonical players and initial competitions", async () => {
    for (const target of [{ type: "PLAYER", entityId: transferIds.player }, { type: "COMPETITION", entityId: transferIds.league }]) await follows.set(target, true);
    expect((await follows.list()).map((e) => e.type).sort()).toEqual(["COMPETITION", "PLAYER"]);
  });
  it("alias search resolves to the same canonical club and player, never a new entity", async () => {
    expect((await follows.catalog("ARS")).filter((e) => e.type === "CLUB")).toEqual([{ ...club, name: "Arsenal", following: false }]);
    const player = (await follows.catalog("Player Alias")).find((e) => e.type === "PLAYER")!;
    expect(player.entityId).toBe(transferIds.player); await follows.set({ type: player.type, entityId: player.entityId }, true);
    expect((await follows.list())[0].entityId).toBe(transferIds.player);
  });
  it("rejects free-text, malformed, nonexistent and unsupported targets", async () => {
    for (const input of [{ type: "CLUB", entityId: "Man Utd" }, { type: "MANAGER", entityId: a }, { type: "CLUB", entityId: a }, { ...club, userId: b }]) await expect(follows.set(input, true)).rejects.toThrow();
    expect(await follows.list()).toEqual([]);
  });
  it("database enforces exactly one canonical target and per-user uniqueness", async () => {
    await follows.set(club, true); const rows = await db.query<{ id: string }>('SELECT id FROM "UserPreference" WHERE "userId"=$1::uuid', [a]);
    await expect(db.query('INSERT INTO "UserFollow" (id,"preferenceId","clubId","playerId","updatedAt") VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,now())', [randomUUID(), rows.rows[0].id, transferIds.arsenal, transferIds.player])).rejects.toThrow();
  });
  it("preferences and follows persist across logout/login and remain user-specific", async () => {
    await follows.set(club, true); await prefs.update({ locale: "vi-VN", timezone: "UTC" });
    current = null; await expect(follows.list()).rejects.toThrow("LOGIN_REQUIRED"); await expect(prefs.get()).rejects.toThrow("LOGIN_REQUIRED");
    current = { id: b }; expect(await follows.list()).toEqual([]); expect((await prefs.get()).timezone).toBe("Asia/Ho_Chi_Minh");
    current = { id: a }; expect(await follows.list()).toHaveLength(1); expect(await prefs.get()).toEqual({ locale: "vi-VN", timezone: "UTC" });
  });
  it("does not accept ownership or role fields in preferences", async () => { await expect(prefs.update({ locale: "vi-VN", timezone: "UTC", userId: b, role: "ADMIN" })).rejects.toThrow("INVALID_INPUT"); });

  const request = (path: string, method = "GET", body?: unknown, origin = "http://localhost:3000") => new Request(`http://localhost:3000${path}`, { method, headers: { origin, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const handle = (req: Request) => accountRequest(req, { database, session, appUrl: "http://localhost:3000" });
  it("anonymous private APIs/mutations return 401 without leaking account data", async () => {
    current = null;
    for (const req of [request("/api/account"), request("/api/following"), request("/api/preferences"), request("/api/following", "POST", club)]) expect((await handle(req)).status).toBe(401);
  });
  it("cannot read or change another user's following through injected ownership", async () => {
    await follows.set(club, true); current = { id: b };
    expect((await handle(request(`/api/following?userId=${a}`))).status).toBe(400);
    expect((await handle(request("/api/following", "DELETE", { ...club, userId: a }))).status).toBe(400);
    expect((await (await handle(request("/api/following"))).json()).follows).toEqual([]);
    current = { id: a }; expect(await follows.list()).toHaveLength(1);
  });
  it("private HTTP mutations and reads share the canonical service with no-store responses", async () => {
    expect((await handle(request("/api/following", "POST", club))).status).toBe(200);
    const response = await handle(request("/api/account?q=ARS")); const data = await response.json();
    expect(data.follows[0].name).toBe("Arsenal"); expect(data.user.id).toBe(a); expect(response.headers.get("cache-control")).toContain("no-store"); expect(response.headers.get("vary")).toBe("Cookie");
    expect((await handle(request("/api/preferences", "PATCH", { locale: "vi-VN", timezone: "UTC" }))).status).toBe(200);
    expect((await handle(request("/api/following", "DELETE", club))).status).toBe(200); expect(await follows.list()).toEqual([]);
  });
  it("rejects cross-site mutations, malformed payloads and missing entities safely", async () => {
    expect((await handle(request("/api/following", "POST", club, "https://evil.test"))).status).toBe(403);
    expect((await handle(request("/api/following", "POST", { ...club, entityId: a }))).status).toBe(404);
    expect((await handle(request("/api/following", "POST", { entityId: "invalid" }))).status).toBe(400);
  });
  it("database errors produce safe Vietnamese unavailable state", async () => {
    const response = await accountRequest(request("/api/account"), { database: { ...database, query: async () => { throw new Error("private-database-credential"); } }, session, appUrl: "http://localhost:3000" });
    expect(response.status).toBe(503); expect(await response.text()).not.toContain("private-database-credential");
  });
  it("retention cleanup deletes only expired sessions/state and old abuse counters, preserving users/follows", async () => {
    await follows.set(club, true); const now = new Date("2026-10-18T01:00:00Z");
    for (const expired of [true, false]) {
      const date = new Date(now.getTime() + (expired ? -1 : 1) * 86400000).toISOString();
      await db.query('INSERT INTO "AuthSession" (id,"userId",token,"expiresAt","updatedAt") VALUES ($1::uuid,$2::uuid,$3,$4::timestamptz,now())', [randomUUID(), a, randomUUID(), date]);
      await db.query('INSERT INTO "AuthVerification" (id,identifier,value,"expiresAt","updatedAt") VALUES ($1::uuid,$2,\'test-only-state\',$3::timestamptz,now())', [randomUUID(), randomUUID(), date]);
      await db.query('INSERT INTO "AuthRateLimit" (id,key,count,"lastRequest") VALUES ($1::uuid,$2,1,$3::bigint)', [randomUUID(), randomUUID(), now.getTime() - (expired ? 2 : 0) * 86400000]);
    }
    expect(await cleanExpiredAuthentication(database, now)).toEqual({ sessions: 1, verifications: 1, counters: 1 });
    expect(await cleanExpiredAuthentication(database, now)).toEqual({ sessions: 0, verifications: 0, counters: 0 });
    expect(await follows.list()).toHaveLength(1); expect((await db.query('SELECT id FROM "User"')).rows).toHaveLength(2);
  });
});
