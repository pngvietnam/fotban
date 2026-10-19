import { randomBytes, randomUUID } from "node:crypto";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { testUtils } from "better-auth/plugins";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { authenticationOptions } from "../lib/auth-options";
import { authReadiness, safeReturnPath, sameOriginMutation } from "../lib/auth-policy";
import { authRequest } from "../services/auth-http";
import { createLogger } from "../lib/logging";
import { readSmallJson } from "../lib/request-body";

const appUrl = "http://localhost:3000";
const settings = { AUTH_SECRET: randomBytes(32).toString("base64url"), AUTH_GOOGLE_ID: "test-only-client", AUTH_GOOGLE_SECRET: "test-only-secret", DATABASE_URL: "postgresql://unused.invalid/test", NEXT_PUBLIC_APP_URL: appUrl };
function testAuth() {
  const rows: Record<string, Record<string, unknown>[]> = { User: [], AuthSession: [], AuthAccount: [], AuthVerification: [], AuthRateLimit: [] };
  const onLogin = vi.fn(async () => {});
  const options = authenticationOptions(memoryAdapter(rows), settings, onLogin, false);
  // Helpers exist only in this disposable test instance, never in lib/auth.ts.
  const auth = betterAuth({ ...options, plugins: [testUtils()] });
  return { auth, onLogin, options, rows };
}
describe("Google authentication and revocable sessions", () => {
  let fixture: ReturnType<typeof testAuth>;
  beforeEach(() => { fixture = testAuth(); });
  async function login() {
    const ctx = await fixture.auth.$context;
    const user = await ctx.test.saveUser(ctx.test.createUser({ id: randomUUID(), email: "reader@example.test", name: "Người đọc", image: "https://images.example.test/private-avatar" }));
    return ctx.test.login({ userId: user.id });
  }
  it("validates a signed cookie against the session store and records login", async () => {
    const signedIn = await login();
    const session = await fixture.auth.api.getSession({ headers: signedIn.headers });
    expect(session?.user.id).toBe(signedIn.user.id); expect(fixture.onLogin).toHaveBeenCalledWith(signedIn.user.id);
    expect(fixture.rows.AuthSession[0].ipAddress).toBeNull(); expect(fixture.rows.AuthSession[0].userAgent).toBeNull();
    expect(fixture.rows.User[0].avatarUrl).toBeNull();
  });
  it("logout deletes the session and old/replayed cookies no longer authenticate", async () => {
    const signedIn = await login(); const headers = new Headers(signedIn.headers); headers.set("origin", appUrl);
    const response = await fixture.auth.handler(new Request(`${appUrl}/api/auth/sign-out`, { method: "POST", headers }));
    expect(response.status).toBe(200); expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(await fixture.auth.api.getSession({ headers: signedIn.headers })).toBeNull();
  });
  it("expired sessions and forged cookies fail safely", async () => {
    const signedIn = await login(); fixture.rows.AuthSession[0].expiresAt = new Date(Date.now() - 1000);
    expect(await fixture.auth.api.getSession({ headers: signedIn.headers })).toBeNull();
    expect(await fixture.auth.api.getSession({ headers: new Headers({ cookie: "fmb.session_token=forged" }) })).toBeNull();
  });
  it("uses httpOnly SameSite cookies, seven-day expiry and secure production cookies", async () => {
    const signedIn = await login(); const cookie = signedIn.cookies[0];
    expect(cookie.httpOnly).toBe(true); expect(cookie.sameSite).toBe("Lax");
    expect(fixture.options.session?.expiresIn).toBe(604800); expect(fixture.options.session?.cookieCache?.enabled).toBe(false);
    expect(authenticationOptions(memoryAdapter({}), settings, async () => {}, true).advanced?.useSecureCookies).toBe(true);
  });
  it("strips Google provider tokens before create and update", async () => {
    const ctx = await fixture.auth.$context;
    const user = await ctx.test.saveUser(ctx.test.createUser({ id: randomUUID(), email: "tokens@example.test" }));
    await ctx.internalAdapter.createAccount({ userId: user.id, accountId: "external-id", providerId: "google", accessToken: "private-access", refreshToken: "private-refresh", idToken: "private-id" });
    const account = fixture.rows.AuthAccount[0];
    expect(account.accessToken).toBeNull(); expect(account.refreshToken).toBeNull(); expect(account.idToken).toBeNull();
    await ctx.internalAdapter.updateAccount(account.id as string, { accessToken: "replacement" });
    expect(fixture.rows.AuthAccount[0].accessToken).toBeNull(); expect(fixture.options.account?.accountLinking?.enabled).toBe(false);
  });
  it("framework rejects cross-origin logout and social sign-in", async () => {
    const signedIn = await login(); const headers = new Headers(signedIn.headers); headers.set("origin", "https://attacker.example.test");
    const response = await fixture.auth.handler(new Request(`${appUrl}/api/auth/sign-out`, { method: "POST", headers }));
    expect(response.status).toBe(403); expect(await fixture.auth.api.getSession({ headers: signedIn.headers })).not.toBeNull();
  });
  it("creates a Google authorization request with PKCE and rejects missing/tampered OAuth state", async () => {
    const start = await fixture.auth.handler(new Request(`${appUrl}/api/auth/sign-in/social`, { method: "POST", headers: { origin: appUrl, "Content-Type": "application/json" }, body: JSON.stringify({ provider: "google", callbackURL: "/account" }) }));
    const url = new URL((await start.json()).url);
    expect(url.hostname).toBe("accounts.google.com"); expect(url.searchParams.get("code_challenge_method")).toBe("S256"); expect(url.searchParams.get("state")).toBeTruthy();
    expect(url.searchParams.get("redirect_uri")).toBe(`${appUrl}/api/auth/callback/google`);
    expect(fixture.rows.AuthVerification).toHaveLength(1);
    const callback = await fixture.auth.handler(new Request(`${appUrl}/api/auth/callback/google?code=invalid&state=tampered`));
    expect(callback.status).toBe(302); expect(new URL(callback.headers.get("location")!, appUrl).pathname).toBe("/login"); expect(fixture.rows.AuthSession).toHaveLength(0);
  });
  it("completes first-time OAuth and reuses the same canonical user on a later login", async () => {
    const ctx = await fixture.auth.$context;
    const provider = ctx.socialProviders.find((item) => item.id === "google");
    if (!provider) throw new Error("Missing configured provider");
    vi.spyOn(provider, "validateAuthorizationCode").mockResolvedValue({ accessToken: "test-only-access" });
    vi.spyOn(provider, "getUserInfo").mockResolvedValue({ user: { name: "Người đọc", email: "oauth-reader@example.test", emailVerified: true }, data: { sub: "stable-test-google-subject" } });
    for (let repeat = 0; repeat < 2; repeat++) {
      const start = await fixture.auth.handler(new Request(`${appUrl}/api/auth/sign-in/social`, { method: "POST", headers: { origin: appUrl, "Content-Type": "application/json" }, body: JSON.stringify({ provider: "google", callbackURL: "/account" }) }));
      const state = new URL((await start.json()).url).searchParams.get("state")!;
      const cookie = start.headers.getSetCookie().map((part) => part.split(";")[0]).join("; ");
      const callback = await fixture.auth.handler(new Request(`${appUrl}/api/auth/callback/google?code=test-only-code&state=${encodeURIComponent(state)}`, { headers: { cookie } }));
      expect(callback.status).toBe(302); expect(callback.headers.get("location")).toBe("/account");
    }
    expect(fixture.rows.User).toHaveLength(1); expect(fixture.rows.AuthAccount).toHaveLength(1); expect(fixture.rows.AuthSession).toHaveLength(2);
    expect(fixture.rows.AuthAccount[0].accessToken).toBeNull(); expect(fixture.onLogin).toHaveBeenCalledTimes(2);
  });
});

describe("authentication boundary and safe configuration", () => {
  const post = (path: string, body: unknown = {}, origin = appUrl) => new Request(`${appUrl}${path}`, { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });
  it("missing secret/credentials disables auth clearly in development without blocking builds", async () => {
    expect(authReadiness({ NEXT_PUBLIC_APP_URL: appUrl }, "development")).toEqual({ ready: false, reason: "SECRET" });
    expect(authReadiness({ ...settings, AUTH_GOOGLE_ID: undefined }, "development").reason).toBe("GOOGLE");
    expect(authReadiness(settings, "production").reason).toBe("HTTPS");
    expect(authReadiness({ ...settings, NEXT_PUBLIC_APP_URL: "https://football.example.test" }, "production").ready).toBe(true);
    const response = await authRequest(post("/api/auth/sign-in/social"), { appUrl, handler: null });
    expect(response.status).toBe(503); expect(await response.text()).toContain("nội dung công khai");
  });
  it.each(["https://evil.test", "//evil.test", "/\\evil.test", "/%2f%2fevil.test", "/login?returnTo=/login", "/api/auth/sign-out", "/x\nheader"])("rejects unsafe OAuth return %s", (path) => { expect(safeReturnPath(path)).toBe("/account"); });
  it("preserves an intended local follow destination", () => { expect(safeReturnPath("/account?type=CLUB&entityId=abc")).toBe("/account?type=CLUB&entityId=abc"); expect(safeReturnPath("/news/example")).toBe("/news/example"); });
  it("does not expose library session tokens, account linking or registration endpoints", async () => {
    const handler = vi.fn(async () => Response.json({}));
    for (const path of ["/api/auth/get-session", "/api/auth/sign-up/email", "/api/auth/link-social", "/api/auth/update-user"]) {
      expect((await authRequest(post(path), { appUrl, handler })).status).toBe(404);
    }
    expect(handler).not.toHaveBeenCalled();
  });
  it("blocks missing Origin and cross-origin mutations", async () => {
    expect(sameOriginMutation(new Headers(), appUrl)).toBe(false);
    expect((await authRequest(post("/api/auth/sign-out", {}, "https://evil.test"), { appUrl, handler: vi.fn() })).status).toBe(403);
  });
  it("pins Google, bounds payloads, sanitizes redirect destinations and returns no-store", async () => {
    const handler = vi.fn(async (request: Request) => Response.json(await request.json()));
    const response = await authRequest(post("/api/auth/sign-in/social", { callbackURL: "//evil.test" }), { appUrl, handler });
    expect(await response.json()).toEqual({ provider: "google", callbackURL: "/account", errorCallbackURL: "/login?error=1" }); expect(response.headers.get("cache-control")).toContain("no-store");
    expect((await authRequest(post("/api/auth/sign-in/social", { idToken: "injected" }), { appUrl, handler })).status).toBe(400);
    expect((await authRequest(post("/api/auth/sign-in/social", { callbackURL: "x".repeat(3000) }), { appUrl, handler })).status).toBe(400);
  });
  it("never returns raw provider errors or logs auth credentials", async () => {
    const response = await authRequest(post("/api/auth/sign-out"), { appUrl, handler: async () => { throw new Error("private-key"); } });
    expect(await response.text()).not.toContain("private-key");
    const lines: string[] = []; const log = createLogger("info", { write: (line) => { lines.push(line); } });
    log.info({ AUTH_SECRET: "private-secret", AUTH_GOOGLE_SECRET: "private-google", account: { accessToken: "private-access", idToken: "private-id" }, cookie: "private-cookie" }); expect(lines.join("")).not.toContain("private-");
  });
  it("cancels oversized chunked bodies before buffering and rejects malformed JSON", async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({ pull(controller) { controller.enqueue(new Uint8Array(1024)); }, cancel() { cancelled = true; } });
    const request = new Request(`${appUrl}/api/auth/sign-in/social`, { method: "POST", body: stream, duplex: "half" } as RequestInit);
    await expect(readSmallJson(request, 2048)).rejects.toThrow(); expect(cancelled).toBe(true);
    await expect(readSmallJson(new Request(appUrl, { method: "POST", body: "{" }), 2048)).rejects.toThrow();
  });
});
