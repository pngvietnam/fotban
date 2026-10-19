# Authentication and following — Milestone 15

Public reading remains available without an account. `/`, matches, news, transfers, published Briefs and source links retain their existing data/publication rules. Following prepares personalization; it does not change global Brief generation, public ranking, reliability, competition visibility or notification consent.

## Authentication boundary

Better Auth **1.7.10**, with its Prisma adapter and Google OpenID Connect/OAuth authorization-code flow, owns authentication. Configuration lives in `lib/auth-options.ts`; `lib/auth.ts` is the server-only, lazy application boundary. Services consume a validated session resolver rather than Google profile data. See the upstream [Next.js integration](https://better-auth.com/docs/integrations/next), [Google setup](https://better-auth.com/docs/authentication/google), [session management](https://better-auth.com/docs/concepts/session-management) and [security documentation](https://better-auth.com/docs/reference/security).

Only Google authorization start, Google callback and POST logout are exposed under `/api/auth`. Password registration, account linking, raw session/token endpoints and arbitrary user-profile updates are not exposed. Google emails must be verified. Existing users are never silently linked by matching email: provider identity is the unique `(providerId, accountId)` in AuthAccount. Adding another provider belongs in the central server configuration with explicit identity/linking review.

## Local configuration

The app builds and serves public content with all auth variables blank. `/account` sends guests to `/login`, which explains in Vietnamese when Google sign-in is unconfigured. No fake user, shared default secret, dev login endpoint or production bypass is installed.

For normal interactive local development:

1. Apply the additive migration with `npm.cmd run db:migrate:deploy`, then `npm.cmd run db:generate`.
2. Generate your own random secret locally: `node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"`. Put the result in the ignored `.env`, never in chat or source control.
3. Create a Google OAuth web client and configure the localhost origin `http://localhost:3000` and exact redirect URI `http://localhost:3000/api/auth/callback/google`. Configure OAuth consent/test users as required by Google. Request only the library's sign-in scopes: `openid`, `email`, `profile`.
4. Configure server-side `AUTH_SECRET` (at least 32 random characters), `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `DATABASE_URL`, and `NEXT_PUBLIC_APP_URL=http://localhost:3000`. Use that same hostname/port in the browser.
5. Run `npm.cmd run dev`, open `/account`, sign in and follow an existing canonical entity. Logout returns to `/`; login again retains following/preferences.

For production set `NEXT_PUBLIC_APP_URL` to the exact public **HTTPS origin**, configure its Google callback, use a separate OAuth client/secret and a stable server-side `AUTH_SECRET` from a secret manager. Authentication fails closed on production HTTP origins or missing/short secret/credentials/database configuration. Public reading continues. This is deliberate; use development mode for localhost HTTP. Reverse proxies must preserve the real public origin, restrict origin access and sanitize forwarded-IP headers. Better Auth uses trusted IP information for abuse counters; without it a shared per-path bucket is used. Do not weaken origin/CSRF checks to fix a deployment mismatch.

## Session and request security

- Database-backed revocable sessions, seven-day expiry and library renewal after one day. Every protected request validates the signed cookie and database expiry; cookie presence alone is never sufficient. Cookie caching is disabled. Logout deletes the session and expires cookies; replay/expired cookies are rejected.
- Cookies are httpOnly, SameSite=Lax, path `/`, Secure in production/HTTPS, host-scoped and prefixed `fmb` (library Secure prefix on HTTPS). Tokens are not put in browser storage or returned in application DTOs. Session secrets must be consistent across app instances.
- OAuth uses PKCE and persisted one-use state plus the library's state cookie. Origin/CSRF checks are explicitly enabled even under tests. Application POST/DELETE/PATCH boundaries additionally require exact configured Origin and reject cross-site Fetch Metadata. Callback GET handles the provider state flow; GET never follows/unfollows or logs out.
- Callback return paths are limited to local application pages, exclude auth/API loops, absolute/protocol-relative/backslash/encoded-separator redirects and control characters. Failed login has a generic Vietnamese message. Selected canonical follow targets survive the login redirect; follow still requires an explicit user action.
- Mutations accept strict validated target/preference payloads; user IDs, ownership IDs and roles cannot be supplied. Private APIs use `private, no-store` and `Vary: Cookie`; no private result enters shared content caches.
- Better Auth applies database-backed auth rate limiting (60 requests/minute by default, 10 social starts/minute). Body sizes are bounded. Logs contain controlled categories only; auth secrets/cookies/provider token fields are redacted. Library payload/error logging is disabled.

## User data and privacy

The existing User model is retained. Added fields: displayName, emailVerified, avatarUrl and lastLoginAt. The adapter maps library `name` to displayName and `image` to avatarUrl. Avatar data is deliberately discarded, so initials/text remain sufficient. Locale defaults to `vi-VN`, new users default to `Asia/Ho_Chi_Minh`; existing stored timezones/preferences remain unchanged. Existing role, legacy authProvider/authSubject identity columns and audit relations are preserved. New authSubject defaults are generated internal UUIDs; Google subjects are stored only in AuthAccount and are not internal primary keys.

Stored data is limited to Google subject/provider identity, email/name, login timestamp, signed-cookie session lookup/expiry, locale/timezone and canonical follows. No Google access/refresh/ID token or password is retained; hooks discard them and a database CHECK enforces null secret fields in AuthAccount. Optional schema fields exist for library compatibility. Google avatar URLs, session IP and session user-agent are discarded. No advertising analytics/profile, contact list, new notification opt-in or per-user Brief is added.

Abuse counters may contain a trusted client IP plus auth path; they are security controls, separate from user/profile history. OAuth verification rows are transient authentication state. Run `npm.cmd run auth:cleanup` periodically through your operational tooling: it deletes expired sessions/state and rate-limit counters inactive for over 24 hours, returns counts only, and never deletes users, follows or content. No scheduler/public maintenance endpoint is added. Operator backup/log retention and future account deletion tooling still need an operational policy.

## Following and preferences

FollowingService and UserPreferenceService resolve the current user server-side for each operation. Reuse UserPreference and UserFollow, the existing exactly-one-target CHECK, foreign keys and unique `(preferenceId, clubId/playerId/leagueId)` constraints. Follow uses conflict-safe insert, unfollow uses ownership-scoped delete; repeats are idempotent. No aliases/names create new entities.

Supported target types: CLUB → Club, PLAYER → Player, COMPETITION → League. Competition follows initially allow only `premier-league` and `la-liga`. Search uses canonical names and stored aliases, returns at most 30 canonical entries, and always includes the initial competition choices. Clubs/players absent from persisted data are not fabricated. Missing metadata or fees/stats remain unrelated to follow identity.

`/account` shows identity, all three followed groups, bounded entity search, language/timezone preferences and logout. `/following` redirects to its following section. Match detail has public club/competition follow links; permitted news detail has canonical club/player/competition links when IDs exist. Public links lead to account to resolve private state; they do not fetch a session per public card. Follow state/toggle is shown in the private account area. Public navigation adds a static account link and performs no auth query. No global middleware or SessionProvider is mounted on public content.

Account/login/following routes are noindex. Private pages/APIs require server validation. Public SEO/publication gates are unchanged. Vietnamese controls have text labels, minimum touch targets, visible focus, `aria-pressed`, status announcements and keyboard-operable forms. Account/sign-in have their own loading states; expired sessions and database errors produce safe Vietnamese feedback.

| Interface | Behavior |
| --- | --- |
| GET `/api/account?q=...` | Current identity, preferences, follows and bounded catalog; authenticated only. |
| GET `/api/following` | Current user's follows only. |
| POST / DELETE `/api/following` | `{type: CLUB / PLAYER / COMPETITION, entityId: canonical UUID}`; follow/unfollow. |
| GET / PATCH `/api/preferences` | Current preferences; update `{locale: vi-VN, timezone: Asia/Ho_Chi_Minh / Asia/Bangkok / UTC}` only. |

The preference timezone is stored for future personalized services. Public content continues to display Vietnamese time; changing it does not mutate UTC data, Brief snapshots or public presentation.

## Deterministic and runtime verification

```powershell
npm.cmd run db:validate
npm.cmd run db:generate
npm.cmd run db:migrate:deploy
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd run auth:smoke
```

Tests need no Google network call/paid service. Test-only Better Auth helpers exist solely in test instances, never in application configuration. Coverage includes real library signed sessions, PKCE/state, first-user OAuth callback and repeated identity reuse with a stubbed provider network boundary, expiry, logout/replay, secret absence, origin checks, safe redirects, tokens/avatars discarded, all follow types, canonical alias lookup, SQL constraints, ownership, private DTO/cache policy, persistence and Vietnamese accessible markup. Cleanup retention is tested against all real migrations in disposable PGlite PostgreSQL.

`auth:smoke` requires an existing production build, local loopback PostgreSQL and CREATE DATABASE permission; port **3018** must be available. It refuses `NODE_ENV=production` and remote database hosts. It creates an owned disposable database, applies all migrations, generates ephemeral test-only auth configuration and tests the real Next production routes. Google token/profile network boundaries are stubbed only in a separate test instance; the Next app has no bypass. A library-issued signed cookie is carried privately in test requests. A logical HTTPS origin models TLS termination over local HTTP: this validates Secure-cookie configuration, not certificate/proxy deployment. It tests anonymous routes, protected account, follow/unfollow uniqueness, CSRF/ownership, preferences, OAuth authorization URL/state, logout, expiry and relogin persistence. It removes the child server/database and verifies original content/user/follow counts remain unchanged. It never prints/stores cookies, credentials or database URLs. Evidence: [authentication runtime validation](samples/authentication-validation.json).

Real Google consent remains an optional deployment check requiring your own local OAuth setup above. No real OAuth credential was used or printed during milestone validation. Browser checks also confirmed anonymous redirect/return-target preservation, noindex, the configuration-unavailable state and no horizontal overflow at 360/768/1280px. Authenticated browser consent is not claimed by the deterministic session tests.

## Schema and deployment

Additive migration `20261018070000_authentication_following` adds four auth tables (AuthSession/AuthAccount/AuthVerification/AuthRateLimit), identity/session indexes and four User fields/default adjustments. Existing follow constraints are reused. No reset/content rewrite/publication occurred. Apply migrations before deploying the new app; use the generated Prisma client. Legacy accounts are preserved but not automatically linked by email.

No M16 admin, password auth, magic link email, complex recommendations, per-user Brief, PWA, push or community ingestion is implemented. The latest explicit M15 scope limits personalization to service readiness, overriding older planning examples that suggested ranking v2.

## File inventory

Created:

- `lib/auth-policy.ts`, `lib/auth-options.ts`, `lib/auth.ts`, `lib/account-http.ts`, `lib/request-body.ts`
- `services/following.ts`, `services/account-http.ts`, `services/auth-http.ts`, `services/auth-maintenance.ts`
- `app/account/page.tsx`, `app/account/loading.tsx`, `app/login/page.tsx`, `app/login/loading.tsx`, `app/following/page.tsx`
- `app/api/account/route.ts`, `app/api/following/route.ts`, `app/api/preferences/route.ts`, `app/api/auth/[...all]/route.ts`
- `components/account/account-view.tsx`, `components/account/account-controls.tsx`, `components/account/follow-link.tsx`
- `scripts/validate-auth.ts`, `scripts/clean-auth.ts`
- `tests/authentication.test.ts`, `tests/following.test.ts`, `tests/account-ui.test.tsx`
- `prisma/migrations/20261018070000_authentication_following/migration.sql`
- `docs/AUTHENTICATION_FOLLOWING.md`, `docs/samples/authentication-validation.json`

Changed:

- `prisma/schema.prisma`, `package.json`, `package-lock.json`, `.gitignore`, `.env.example`
- `lib/config.ts`, `lib/logging.ts`, `components/sports-shell.tsx`
- `components/matches/match-detail.tsx`, `types/match-ui.ts`
- `components/news/news-detail.tsx`, `types/news-ui.ts`, `services/news-ui-data.ts`, `tests/news-query.test.ts`
- `README.md`, `docs/PROGRESS.md`
