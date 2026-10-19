import type { BetterAuthOptions } from "better-auth";
import type { AuthSettings } from "./auth-policy";

// This factory has no environment singleton or privileged test helpers.
// Tests can supply a disposable adapter while exercising the same security policy.
export function authenticationOptions(database: BetterAuthOptions["database"], settings: AuthSettings, onLogin: (userId: string) => Promise<void>, production: boolean): BetterAuthOptions {
  const stripTokens = <T extends Record<string, unknown>>(account: T) => ({ ...account, accessToken: null, refreshToken: null, idToken: null, accessTokenExpiresAt: null, refreshTokenExpiresAt: null, scope: null, password: null });
  return {
    appName: "Football Morning Brief", baseURL: new URL(settings.NEXT_PUBLIC_APP_URL).origin, basePath: "/api/auth",
    secret: settings.AUTH_SECRET, database, trustedOrigins: [new URL(settings.NEXT_PUBLIC_APP_URL).origin],
    emailAndPassword: { enabled: false },
    socialProviders: { google: { clientId: settings.AUTH_GOOGLE_ID!, clientSecret: settings.AUTH_GOOGLE_SECRET!, accessType: "online", disableIdTokenSignIn: true, mapProfileToUser: (profile) => { if (!profile.email_verified) throw new Error("UNVERIFIED_GOOGLE_EMAIL"); return {}; } } },
    user: { modelName: "User", fields: { name: "displayName", image: "avatarUrl" } },
    session: { modelName: "AuthSession", expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24, cookieCache: { enabled: false } },
    account: { modelName: "AuthAccount", storeStateStrategy: "database", storeAccountCookie: false, updateAccountOnSignIn: false, accountLinking: { enabled: false } },
    verification: { modelName: "AuthVerification" },
    onAPIError: { errorURL: `${new URL(settings.NEXT_PUBLIC_APP_URL).origin}/login?error=1` },
    rateLimit: { enabled: true, storage: "database", modelName: "AuthRateLimit", window: 60, max: 60, customRules: { "/sign-in/social": { window: 60, max: 10 } } },
    advanced: { disableCSRFCheck: false, disableOriginCheck: false, database: { generateId: "uuid" }, cookiePrefix: "fmb", useSecureCookies: production || settings.NEXT_PUBLIC_APP_URL.startsWith("https:"), defaultCookieAttributes: { httpOnly: true, sameSite: "lax", path: "/" } },
    databaseHooks: {
      user: { create: { before: async (user) => ({ data: { ...user, image: null } }) }, update: { before: async (user) => ({ data: { ...user, image: null } }) } },
      account: { create: { before: async (account) => ({ data: stripTokens(account) }) }, update: { before: async (account) => ({ data: stripTokens(account) }) } },
      session: { create: { before: async (session) => ({ data: { ...session, ipAddress: null, userAgent: null } }), after: async (session) => onLogin(session.userId) } },
    },
    // Library messages may contain request/profile details. The boundary records controlled categories instead.
    logger: { disabled: true }, telemetry: { enabled: false },
  };
}
