// Deterministic runtime validation only. No privileged helper is imported by application code.
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { Client } from "pg";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { testUtils } from "better-auth/plugins";
import { createDatabaseClient } from "../lib/database-client";
import { authenticationOptions } from "../lib/auth-options";

let stage = "configuration";
async function main() {
  if (process.env.NODE_ENV === "production" || !process.env.DATABASE_URL) throw new Error("Run only against local development PostgreSQL with CREATE DATABASE permission.");
  const original = new URL(process.env.DATABASE_URL);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(original.hostname)) throw new Error("Runtime validation requires loopback PostgreSQL.");
  const name = `fmb_m15_smoke_${randomUUID().replaceAll("-", "")}`;
  assert.match(name, /^fmb_m15_smoke_[a-f0-9]{32}$/);
  stage = "database connection";
  const admin = new Client({ connectionString: original.toString() }); await admin.connect();
  const counts = async () => {
    const result: Record<string, number> = {};
    for (const table of ["Match", "Article", "ArticleCluster", "Transfer", "Video", "DailyBrief", "BriefRevision", "JobRun", "User", "UserFollow"]) result[table] = Number((await admin.query(`SELECT count(*) AS n FROM "${table}"`)).rows[0].n);
    return result;
  };
  const before = await counts();
  const isolated = new URL(original); isolated.pathname = `/${name}`;
  let created = false; let child: ReturnType<typeof spawn> | undefined;
  let db: ReturnType<typeof createDatabaseClient> | undefined;
  let sql: Client | undefined;
  const checks: Record<string, string> = {};
  try {
    stage = "isolated migration";
    await admin.query(`CREATE DATABASE "${name}"`); created = true;
    sql = new Client({ connectionString: isolated.toString() }); await sql.connect();
    for (const entry of readdirSync("prisma/migrations", { withFileTypes: true }).filter((entry) => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) await sql.query(readFileSync(`prisma/migrations/${entry.name}/migration.sql`, "utf8"));
    db = createDatabaseClient(isolated.toString());
    const club = await db.club.create({ data: { name: "Câu lạc bộ kiểm thử", slug: "test-only-club", aliases: ["Test Alias"] } });
    const player = await db.player.create({ data: { name: "Cầu thủ kiểm thử", slug: "test-only-player" } });
    const league = await db.league.create({ data: { name: "Premier League", slug: "premier-league", country: "England" } });
    await db.league.create({ data: { name: "La Liga", slug: "la-liga", country: "Spain" } });
    const port = 3018; const runtimeUrl = `http://127.0.0.1:${port}`;
    // Logical HTTPS origin models TLS termination; transport here remains local HTTP.
    const appUrl = `https://localhost:${port}`;
    const settings = { DATABASE_URL: isolated.toString(), NEXT_PUBLIC_APP_URL: appUrl, AUTH_SECRET: randomBytes(48).toString("base64url"), AUTH_GOOGLE_ID: "isolated-test-only", AUTH_GOOGLE_SECRET: randomBytes(32).toString("base64url") };
    const testAuth = betterAuth({ ...authenticationOptions(prismaAdapter(db, { provider: "postgresql", transaction: true }), settings, async (userId) => { await db!.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } }); }, true), plugins: [testUtils()] });
    stage = "library session";
    const ctx = await testAuth.$context;
    const provider = ctx.socialProviders.find((item) => item.id === "google"); assert.ok(provider);
    // Stub only the remote network boundary in this test instance. OAuth state,
    // callback, first-user transaction, identity reuse and sessions are real library code.
    provider.validateAuthorizationCode = async () => ({ accessToken: "test-only-access" });
    provider.getUserInfo = async () => ({ user: { email: "isolated-reader@example.test", name: "Người đọc kiểm thử", emailVerified: true }, data: { sub: "isolated-google-subject" } });
    for (let repeat = 0; repeat < 2; repeat++) {
      const start = await testAuth.handler(new Request(`${appUrl}/api/auth/sign-in/social`, { method: "POST", headers: { origin: appUrl, "content-type": "application/json" }, body: JSON.stringify({ provider: "google", callbackURL: "/account" }) }));
      assert.equal(start.status, 200);
      const state = new URL((await start.json()).url).searchParams.get("state")!;
      const stateCookie = start.headers.getSetCookie().map((part) => part.split(";")[0]).join("; ");
      const callback = await testAuth.handler(new Request(`${appUrl}/api/auth/callback/google?code=test-only-code&state=${encodeURIComponent(state)}`, { headers: { cookie: stateCookie } }));
      assert.equal(callback.status, 302); assert.equal(callback.headers.get("location"), "/account");
    }
    assert.equal(await db.user.count(), 1); assert.equal(await db.authAccount.count(), 1);
    const identity = await db.authAccount.findFirstOrThrow(); assert.equal(identity.accessToken, null); assert.equal(identity.refreshToken, null); assert.equal(identity.idToken, null);
    const user = await db.user.findFirstOrThrow();
    await db.authSession.deleteMany();
    checks.oauthCallback = "PASS: first-user callback, Google subject reuse, no stored provider tokens; network stubbed";
    const login = await ctx.test.login({ userId: user.id }); const cookie = login.headers.get("cookie")!;
    assert.ok(login.cookies[0].secure && login.cookies[0].httpOnly); assert.equal(login.cookies[0].sameSite, "Lax");
    assert.ok((await db.user.findUniqueOrThrow({ where: { id: user.id } })).lastLoginAt); checks.session = "PASS: library-issued signed database session, secure/httpOnly/SameSite, lastLoginAt";
    stage = "production server";
    let output = "";
    child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], { cwd: process.cwd(), env: { ...process.env, ...settings, NODE_ENV: "production", LOG_LEVEL: "silent" }, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    child.stdout!.on("data", (chunk) => { output = (output + chunk.toString()).slice(-8000); }); child.stderr!.on("data", (chunk) => { output = (output + chunk.toString()).slice(-8000); });
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      if (child.exitCode !== null) throw new Error("Isolated Next server exited before readiness.");
      try { if ((await fetch(`${runtimeUrl}/api/health`)).status === 200) { ready = true; break; } } catch {}
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    assert.ok(ready, "Next production server readiness"); stage = "public routes";
    const request = (path: string, options: { method?: string; body?: unknown; cookie?: string; origin?: string } = {}) => fetch(`${runtimeUrl}${path}`, { redirect: "manual", method: options.method ?? "GET", headers: { ...(options.cookie ? { cookie: options.cookie } : {}), origin: options.origin ?? appUrl, "Content-Type": "application/json" }, ...(options.body ? { body: JSON.stringify(options.body) } : {}) });
    for (const path of ["/", "/matches", "/news", "/transfers"]) { const response = await request(path); assert.equal(response.status, 200, path); assert.ok(!(await response.text()).includes("Đăng nhập bằng Google")); }
    checks.publicRoutes = "PASS: anonymous /, /matches, /news, /transfers remain HTTP 200";
    stage = "anonymous protection";
    const protectedPage = await request("/account");
    // Next may already be streaming when the authenticated boundary redirects.
    const protectedHtml = await protectedPage.text();
    assert.ok([200, 307].includes(protectedPage.status));
    assert.ok((protectedPage.headers.get("location") ?? protectedHtml).includes("/login?returnTo="));
    assert.ok(!protectedHtml.includes("Người đọc kiểm thử"));
    assert.equal((await request("/api/account")).status, 401); checks.protection = "PASS: anonymous account redirects and private API rejects";
    stage = "authenticated account";
    const privatePage = await request("/account", { cookie }); const accountHtml = await privatePage.text(); assert.equal(privatePage.status, 200); assert.ok(accountHtml.includes("Người đọc kiểm thử")); assert.ok(accountHtml.includes('content="noindex, nofollow"')); assert.ok(privatePage.headers.get("cache-control")?.includes("private"));
    checks.account = "PASS: authenticated production account HTML, noindex, private cache";
    stage = "follow";
    for (const [type, entityId] of [["CLUB", club.id], ["PLAYER", player.id], ["COMPETITION", league.id]]) {
      for (let repeat = 0; repeat < 2; repeat++) assert.equal((await request("/api/following", { cookie, method: "POST", body: { type, entityId } })).status, 200);
    }
    assert.equal(await db.userFollow.count(), 3); checks.follow = "PASS: club/player/competition follows and duplicate idempotency";
    stage = "unfollow";
    assert.equal((await request("/api/following", { cookie, method: "DELETE", body: { type: "CLUB", entityId: club.id } })).status, 200);
    assert.equal(await db.userFollow.count(), 2); checks.unfollow = "PASS";
    assert.equal((await request("/api/following", { cookie, method: "POST", body: { type: "CLUB", entityId: club.id }, origin: "https://attacker.example.test" })).status, 403);
    assert.equal((await request("/api/following", { cookie, method: "POST", body: { type: "CLUB", entityId: club.id, userId: randomUUID() } })).status, 400); checks.ownershipCsrf = "PASS: injected ownership and foreign origin rejected";
    stage = "preferences";
    assert.equal((await request("/api/preferences", { cookie, method: "PATCH", body: { locale: "vi-VN", timezone: "UTC" } })).status, 200);
    const state = await request("/api/account", { cookie }); const payload = await state.json(); assert.equal(payload.preferences.timezone, "UTC"); assert.equal(payload.follows.length, 2); assert.equal(state.headers.get("cache-control"), "private, no-store, max-age=0"); assert.ok(!JSON.stringify(payload).includes(login.token));
    checks.preferences = "PASS: persisted preferences, no session token in private DTO";
    stage = "OAuth start";
    const start = await request("/api/auth/sign-in/social", { method: "POST", body: { callbackURL: "/account" } }); assert.equal(start.status, 200); const authUrl = new URL((await start.json()).url); assert.equal(authUrl.hostname, "accounts.google.com"); assert.equal(authUrl.searchParams.get("code_challenge_method"), "S256");
    assert.equal(await db.authVerification.count(), 1); checks.oauthStart = "PASS: Google authorization redirect + PKCE + persisted state; Google not contacted";
    assert.equal((await request("/api/auth/get-session", { cookie })).status, 404);
    stage = "logout";
    const logout = await request("/api/auth/sign-out", { cookie, method: "POST", body: {} }); assert.equal(logout.status, 200); assert.ok(logout.headers.get("set-cookie")?.includes("Max-Age=0"));
    assert.equal((await request("/api/account", { cookie })).status, 401); assert.equal(await db.authSession.count(), 0); checks.logout = "PASS: revocation + cleared cookie + replay rejected";
    stage = "relogin and expiry";
    const again = await ctx.test.login({ userId: user.id }); const againState = await (await request("/api/account", { cookie: again.headers.get("cookie")! })).json(); assert.equal(againState.follows.length, 2); assert.equal(againState.preferences.timezone, "UTC");
    await db.authSession.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } }); assert.equal((await request("/api/account", { cookie: again.headers.get("cookie")! })).status, 401); checks.expiryPersistence = "PASS: follows survive relogin; expired session rejected";
    assert.ok(!output.includes(settings.AUTH_SECRET)); assert.ok(!output.includes(settings.AUTH_GOOGLE_SECRET));
  } finally {
    if (child && child.exitCode === null) { const stopped = once(child, "exit"); child.kill(); await stopped; }
    await db?.$disconnect(); await sql?.end();
    if (created) await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    const after = await counts(); await admin.end(); assert.deepEqual(after, before, "Original database counts must remain unchanged");
  }
  checks.cleanup = "PASS: disposable server/database removed; original content/user/follow counts unchanged";
  writeFileSync("docs/samples/authentication-validation.json", `${JSON.stringify({ date: new Date().toISOString(), mode: "isolated production Next + PostgreSQL; test-only library session helper", realGoogleConsent: "NOT RUN: no real OAuth credentials used", checks }, null, 2)}\n`);
  console.log(JSON.stringify(checks, null, 2));
}
main().catch((error: unknown) => { console.error(`Authentication runtime validation failed at ${stage} (${error instanceof Error ? error.name : "UNKNOWN"}); no credential or raw database/provider error is logged.`); process.exitCode = 1; });
