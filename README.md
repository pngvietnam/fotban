# Football Morning Brief

Vietnamese publisher RSS feeds are now the primary planned production news source strategy. All 13 requested candidates have a permission matrix and RSS adapter support; none is enabled without a compatible reviewed grant. GDELT remains optional discovery. See [Vietnamese news operations, review outcomes and acceptance commands](docs/VIETNAMESE_NEWS.md). Source reliability never substitutes for reuse rights or official claim evidence.

Vietnamese football morning brief for EPL and La Liga. `PRODUCT_SPEC.md` defines the product and `CODEX_PLAN.md` defines delivery order. Milestones 1–16 include match/news UI, evidence-aware transfers, optional Vietnam-first YouTube links, the deterministic Morning Brief engine, a deployment-neutral scheduler and the Vietnamese morning homepage. Free-first ingestion, AI fallback, reliability and clustering are implemented; league/club news sources remain disabled until reuse is allowed. Real public news/transfer details await approved Vietnamese content. Optional Google authentication and canonical club/player/competition following are implemented without gating public reading. See [schema decisions](docs/DATA_MODEL.md), [MatchProvider](docs/MATCH_PROVIDER.md), [news ingestion](docs/NEWS_INGESTION.md), [Wikinews setup](docs/WIKIMEDIA_NEWS.md), [Transfer Center](docs/TRANSFERS.md), [YouTube highlights](docs/VIDEO_HIGHLIGHTS.md), [Morning Brief](docs/MORNING_BRIEF.md), [scheduler](docs/SCHEDULER.md), [homepage](docs/MORNING_HOMEPAGE.md), [authentication/following](docs/AUTHENTICATION_FOLLOWING.md) [admin operations](docs/ADMIN.md) and [milestone evidence](docs/PROGRESS.md).

## Admin console

`/admin` and its sources/videos/stories/transfers/briefs/jobs areas require the current database ADMIN role through existing M15 sessions. Public reading remains open. Configure Google auth, sign in, then explicitly bootstrap the first existing user with `npm.cmd run admin:bootstrap -- <user-uuid> "Operator access reviewed" --confirm`. No email-domain grants or default admin account exist.

Reviewed source permissions, evidence-aware story/transfer actions, immutable edit/audit history and explicit READY → PUBLISHED Brief publication remain enforced server-side. Published Briefs record the publishing admin. Hide/revoke actions are reflected by current public news/Brief gates. Paginated lists show safe job/provider metadata without credentials. Manual morning reruns call the existing locked scheduler in stored-only mode and never auto-publish. See the [admin runbook](docs/ADMIN.md) for workflows, migrations and limitations.

After a build, `npm.cmd run admin:smoke` verifies signed admin/reader sessions and all routes/mutations against disposable local PostgreSQL fixtures; it leaves original content and permissions unchanged. Real Google consent is separate.

## Immediate local real-data acceptance

```powershell
# Inspect the current-time plan without provider calls or database writes:
npm.cmd run scheduler:morning -- now --dry-run
# One bounded real-provider workflow, regardless of time of day:
npm.cmd run scheduler:morning -- now
```

`now` requires non-production NODE_ENV and loopback PostgreSQL. It captures the current Asia/Ho_Chi_Minh cutoff once, uses the existing 24-hour Brief lookback/upcoming horizon, and calls the existing scheduler/services. Missing optional providers are recorded as degradation; stored valid data remains usable. No fixtures are inserted and no content is automatically published. An unchanged exact cutoff/input snapshot reuses its M12 revision; a new cutoff is itself a changed generation input.

Use the existing Next development server and open `http://localhost:<dev-port>/?preview=1` to view the latest eligible READY Brief. Preview is ignored in production and still enforces permission/current-data gates. Without `preview=1`, unpublished Briefs stay private. The acceptance server used port **3001**; do not stop another running dev server to start a duplicate. Regular production refresh at **07:30** and generation at **08:00** are unchanged. See [scheduler details](docs/SCHEDULER.md) and [recorded live acceptance](docs/samples/live-acceptance.json).

## Local setup

Use Node.js 22.12+ or Node.js 24 LTS, npm, and Docker Desktop with its Linux engine running and Compose v2 (`docker compose`) available. On Windows, enable Docker Desktop's WSL 2 backend and any virtualization/WSL prerequisites requested by its installer. Port 5432 must be free. From the repository directory:

```powershell
npm ci
# Only copy when .env does not already exist; preserve any existing local keys.
if (!(Test-Path .env)) { Copy-Item .env.example .env }
# Edit .env: set DATABASE_URL to the local development URL below.
npm run db:up
npm run db:validate
npm run db:generate
npm run db:migrate:deploy
npm run db:check
npm run dev
```

Open http://localhost:3000 for the public morning homepage. Missing optional provider/OAuth keys do not prevent startup; login shows a clear unavailable state until configured. Invalid environment values fail with field names, without echoing values. Keep local, staging and production databases and credentials separate.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Server-only PostgreSQL URL. Optional for the shell and schema validation; required for database readiness and migrations. |
| `FOOTBALL_DATA_API_KEY` | Server-only key for the primary free football-data.org v4 MatchProvider. Optional to build/read stored data; required for live sync. |
| `SPORTS_API_KEY` | Reserved legacy variable; not used by the selected provider and not a fallback. |
| `NEWS_API_KEY` | Reserved optional future credential; free-first news ingestion does not use or require it. |
| `WIKIMEDIA_USER_AGENT` | Server-only app/version plus actual reachable contact; required for Wikinews requests, optional for builds. No API key needed. |
| `YOUTUBE_API_KEY` | Optional server-only YouTube Data API v3 key for reviewed highlight discovery/refresh. Missing key skips sync; fresh stored verified links remain usable. |
| `OPENAI_API_KEY` | Optional server-only future AI provider credential. |
| `NEXT_PUBLIC_APP_URL` | Public HTTP(S) application URL; defaults to `http://localhost:3000`. Must not contain credentials, query parameters or fragments. |
| `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | Optional server-only Google OAuth configuration. Missing config disables auth; production needs HTTPS. |
| `LOG_LEVEL` | `fatal`, `error`, `warn`, `info` (default), `debug`, `trace`, or `silent`. |
| `APP_TIMEZONE` | Scheduler IANA zone, default `Asia/Ho_Chi_Minh`; also supports Bangkok/UTC consistently with M12. |
| `MORNING_BRIEF_HOUR` | Scheduler local target hour 1–23, default `8`; refresh begins 30 minutes earlier. |
| `SCHEDULER_ENABLED` | `true` enables automated ticks; default `false`. Explicit manual runs remain available. |

`.env` and other environment files are ignored; `.env.example` contains no credentials. Put production secrets in your host's secret manager. Never prefix secrets with `NEXT_PUBLIC_`. Server environment and DB modules use `server-only` to prevent accidental client imports.

## Commands and verification

```powershell
npm run dev                 # Development server
npm run lint                # ESLint, zero warnings
npm run typecheck           # Generate Next route types, then strict TypeScript
npm test                    # Deterministic foundation/schema/provider/UI tests
npm run build              # Generate Prisma client and production build
npm start                  # Run the production build
npm run db:up             # Start PostgreSQL and wait up to 60s for health
npm run db:down           # Remove containers/network, retaining named DB volume
npm run db:logs           # Follow PostgreSQL logs; Ctrl+C stops log following
npm run db:studio         # Open Prisma Studio for the configured database
npm run db:generate        # Generate Prisma client
npm run db:validate        # Validate Prisma schema without connecting
npm run db:check           # Verify actual PostgreSQL connectivity via SELECT 1
npm run db:migrate:deploy  # Apply checked-in pending migrations without reset
npm run db:seed            # Explicitly opted-in development reference seed only
npm run provider:sync -- smoke # Minimal PL/La Liga live smoke (needs server key)
npm.cmd run news:sync -- sources # Register/list disabled official news candidates
npm.cmd run news:sync -- all     # Sync eligible sources; permissions required
```

No remote fonts or data services are required to build. Use `npm ci` to reproduce the lockfile. On Windows PowerShell use `npm.cmd` / `npx.cmd` if ExecutionPolicy blocks the .ps1 shims; no policy change is needed. Tests execute migrations and constraint scenarios in disposable PostgreSQL WASM (PGlite); test fixtures never access DATABASE_URL. Scheduler commands are documented below. Do not add production demo data.

## PostgreSQL setup

`docker-compose.yml` defines a local-only PostgreSQL 16 service named `postgres`, database `football_morning`, development user `football`, and development password `football_dev`. It binds only to host loopback on port 5432, persists data in the project-scoped `postgres_data` named volume, checks readiness with `pg_isready`, and uses `restart: unless-stopped`. The password is a deliberately public development value; never reuse it for staging or production. The volume mount follows the [official PostgreSQL image guidance for version 16](https://hub.docker.com/_/postgres).

Set the following in your ignored `.env` file (already created for this local workspace):

```dotenv
DATABASE_URL=postgresql://football:football_dev@localhost:5432/football_morning?schema=public
```

`.env.example` intentionally contains no password or connection credentials; copying it requires filling in DATABASE_URL. The app runs on the host, so the URL uses `localhost`. A future containerized app would use service hostname `postgres` instead. Shell environment variables can override `.env`; remove stale DATABASE_URL values from your shell when troubleshooting.

Start the database with `npm run db:up`. This uses Compose's `--wait` flag to wait for container health, rather than assuming that a running container is ready. Inspect with `docker compose ps postgres`, `npm run db:logs`, or verify the expected database and user directly:

```powershell
docker compose exec postgres psql -U football -d football_morning -c "SELECT current_database(), current_user;"
npm run db:check
```

After starting the app, open `http://localhost:3000/api/health`. Success is HTTP 200 with `app: up` and `database: up`. A container healthcheck alone does not prove that the host application's password/URL is correct; `db:check` verifies Prisma access through the host connection.

Stop with `npm run db:down`; this preserves database data. Start again with `npm run db:up`. No reset script is provided. `docker compose down --volumes` is destructive and deletes the local database volume; do not run it to fix routine startup failures. Image initialization variables apply only to an empty data volume: changing the Compose password or database name does not update an existing cluster. Preserve needed data and explicitly plan any credential changes or resets.

If Docker is unavailable, install and start Docker Desktop (Linux containers, Compose v2), then reopen the terminal if needed. Alternatively, use an already available, dedicated development PostgreSQL instance and configure its actual DATABASE_URL. Do not change an unrelated local cluster, reuse production credentials, or claim Compose verification when using that fallback. For hosted connections, percent-encode special credential characters and use TLS as required by the service.

Run `npm run db:validate` and `npm run db:check`. The latter runs a read-only `SELECT 1` and exits nonzero on missing configuration or connection failure; it prints no raw driver errors or connection URL. Prisma 7 reads its CLI URL from `prisma.config.ts`; the application uses `@prisma/adapter-pg`. The application reuses one Prisma client per Node process, with a five-connection pool and three-second connection/query/statement timeouts. Size connection pools for your deployment and worker topology before release. This follows the [Prisma driver adapter guidance](https://docs.prisma.io/docs/orm/v7/core-concepts/supported-databases/database-drivers).

The schema has Milestone 2 domain models plus additive provider, processing, evidence, video, brief and scheduler migrations. Apply all twelve checked-in migrations with `npm.cmd run db:migrate:deploy`; repeat deployment only applies pending migrations. `db:migrate:dev` and `db:migrate:deploy` are reused instead of adding a duplicate alias. For future changes, create reviewed migrations with `npm.cmd run db:migrate:dev -- --name <name>` against a development database; inspect SQL before applying it elsewhere. Custom checks/triggers and NULLS NOT DISTINCT stat uniqueness must be retained. Before production migration, require a verified backup/recovery plan. Do not use migrate reset or db push against production. See [DATA_MODEL.md](docs/DATA_MODEL.md) for forward-recovery/restore guidance.

After migrations, optionally prepare the two development league references:

```powershell
$env:ALLOW_DEV_SEED = 'true'
npm.cmd run db:seed
Remove-Item Env:ALLOW_DEV_SEED
```

The seed refuses production, non-loopback hosts, other database names and missing opt-in. It upserts Premier League and La Liga by slug without overwriting existing editorial changes. It inserts no fake news/results, sources, users or videos. `.env.example` leaves ALLOW_DEV_SEED blank; never enable it in production. `npm.cmd run db:studio` opens the migrated database for inspection.

To reproduce Milestone 2 validation locally:

```powershell
npx.cmd prisma format
npx.cmd prisma validate
npx.cmd prisma generate
npm.cmd run db:migrate:deploy
npx.cmd prisma migrate status
npm.cmd run db:check
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```

Migration/seed commands need a reachable PostgreSQL database. Docker access is not necessary for deterministic tests, schema validation, generation or build. If the execution environment is isolated from your Windows Docker daemon, run only the live commands locally; do not reinstall Docker or treat isolation as a schema failure. Avoid storing backup dumps in the repository; see the recovery notes for binary-safe pg_dump/pg_restore usage on Windows.

## Free-first match synchronization

Set `FOOTBALL_DATA_API_KEY` in ignored `.env` locally. The primary adapter uses the free tier for Premier League (PL) and La Liga (PD). Services depend on the internal MatchProvider contract; provider DTOs stay inside the adapter. No mandatory paid provider or fake production fallback is used.

```powershell
npm.cmd run provider:sync -- competitions
npm.cmd run provider:sync -- teams PL
npm.cmd run provider:sync -- teams PD
npm.cmd run provider:sync -- matches PL
npm.cmd run provider:sync -- matches PD
npm.cmd run provider:sync -- standings PL
npm.cmd run provider:sync -- standings PD
```

Run these deliberately, not in a polling loop. Sync caches persist in PostgreSQL (6h matches, 24h competitions/teams/standings), with shared 7-second request spacing, resource leases, bounded transient retries and a persisted 429 cooldown. Detailed events/lineups/advanced statistics are unavailable in this free adapter. Partial responses preserve existing data. UTC timestamps are converted to local time only in presentation; stored timestamps are unchanged.

Visible attribution on populated match pages is **Football data provided by the Football-Data.org API**. Crest URLs are external metadata only; no graphics are downloaded, cached, rehosted or assumed licensed. Match cards/details use text/TLA badges and never require provider crests. See [provider terms](https://www.football-data.org/about) and the [provider runbook](docs/MATCH_PROVIDER.md) for licensing limits, normalized score semantics, all commands, internal APIs and exact minimal live validation steps.

For the minimal live test, run `npm.cmd run provider:sync -- smoke` twice on the same UTC day/window (initially two requests; repeat uses DB cache), then verify PL and La Liga with `/api/matches` as documented. Do not paste the key into chat. Milestone 3's local live-provider acceptance has been recorded in docs/PROGRESS.md; viewing matches does not rerun synchronization.

## Match UI

Open `/matches` for Premier League and La Liga, then select a card to open its canonical `/match/[slug]` detail route. The homepage links to the list. Both routes are dynamic Server Components using the existing internal match query service and PostgreSQL. They do not call football-data.org, trigger sync or require FOOTBALL_DATA_API_KEY. DATABASE_URL and previously synchronized data are needed to display matches.

The GET form supports league, inclusive date range and status; filters are shareable/bookmarkable. Example: `/matches?league=la-liga&from=2026-10-10&to=2026-10-20&status=finished`. League values are `all`, `premier-league`, `la-liga`; status values are `all`, `upcoming`, `live` (including halftime), `finished`. The default window is the current Vietnamese calendar date minus 7 days through plus 14 days. Ranges are limited to 32 calendar days, with 50 records per page and total-count pagination. Unknown/repeated/malformed filters show a recoverable validation state.

All display times and date grouping use **Asia/Ho_Chi_Minh (UTC+7)** explicitly, independent of the server/browser timezone. UI date filters use Vietnamese midnight boundaries, translated to UTC query instants. The existing `/api/matches` date contract remains UTC; its response additionally includes `total`. No stored timestamps or provider normalization changed.

Scores are shown only when both sides are available; upcoming matches show kickoff, and postponed/cancelled matches show their status without a misleading score. Regulation, extra-time totals and shootouts remain distinct. Metadata, update time and stale warnings reflect stored snapshots; LIVE means a persisted status and does not imply realtime polling. Missing team metadata uses neutral text and initials, missing venue uses a subtle unavailable state, and event/stat sections are omitted unless actual internal rows exist. There are no invented statistics or future-content placeholders.

Loading, empty, database-error, invalid-filter and invalid-slug states use Vietnamese copy. Unknown slugs call Next.js `notFound()` and receive noindex metadata; with streamed loading boundaries, Next.js may return HTTP 200 for that not-found page. Errors never render raw database messages. Semantic headings, native labeled controls, a skip link, visible focus outlines and full-card links support keyboard navigation; reduced-motion preferences are respected.

Local UI verification (no external API requests):

```powershell
npm.cmd run db:check
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd start
# Open http://localhost:3000/matches; select an existing card for /match/[slug].
# Check both leagues, status/date filters, pagination and /match/no-such-match.
# Empty state: /matches?from=2020-01-01&to=2020-01-02 (if that window has no stored rows).
```

UI tests use deterministic test-only fixtures and rendered components/query-service checks. They do not sync, write to the configured database or depend on live provider access. Browser review covers mobile (360px), tablet (768px) and desktop (1280px); a full assistive-technology audit remains part of later hardening.

## Free-first news ingestion

NewsProvider services normalize/validate metadata, deduplicate exact URLs and persist drafts. **Wikinews is enabled** via a public Wikimedia API, with programmatic licence/policy checks, attribution and revision evidence. One real CC BY 4.0 article passed live ingestion and rerun checks. The Premier League, LaLiga, Liverpool and FC Barcelona website candidates remain disabled; BBC/Guardian and other restricted feeds are not treated as unrestricted sources. No paid news API is required. See [Wikinews configuration and limitations](docs/WIKIMEDIA_NEWS.md).

```powershell
npm.cmd run db:migrate:deploy
npm.cmd run news:sync -- sources
npm.cmd run news:sync -- all
npm.cmd run news:sync -- source premier-league
npm.cmd run news:sync -- smoke
```

`all` skips disabled candidates and syncs eligible sources. `source wikinews-en` selects the permitted adapter; repeated smoke can explicitly verify stored licensed rows using the six-hour cache. Set WIKIMEDIA_USER_AGENT privately before live API calls. Other sources still require appropriate enable/review/permission fields, language, method and excerpt scope, as described in the [news runbook](docs/NEWS_INGESTION.md). No bypass flag exists; commit-time checks protect the approved scope.

Storage is limited to headline, original language, source/canonical URLs, actual publication time (nullable), collection time and a short excerpt **only when permitted**. Full article bodies, images and raw feed/page payloads are not stored. Missing dates are never inferred; incomplete items remain NEEDS_REVIEW, and all articles remain DRAFT. No translation, summarization, classification, publication or semantic clustering runs here.

Source failures are isolated with bounded timeouts/retries, safe structured logs and JobRun/ProviderStatus tracking. Permission and robots/technical blocks produce unavailable results; no paywall or redirect bypass. Successful snapshots cache for six hours with conditional validators; 429 records a persistent cooldown. Only one metadata snapshot per source is fetched after robots, with no article-link fan-out or continuous polling. See the runbook for limitations, rights evidence, source activation and minimal live acceptance steps.

## Free-first AI processing

Milestone 6 adds the internal AIProvider pipeline for stored, reusable Article drafts. Default RuleBasedFallbackProvider needs no key: already-Vietnamese text can be copied conservatively; English/Spanish remains untranslated with review required. An optional vendor-neutral HTTPS gateway and a future LocalAIProvider extension contract avoid a mandatory paid vendor. See [AI processing configuration, structured contract, safeguards and smoke procedure](docs/AI_PROCESSING.md).

```powershell
npm.cmd run db:migrate:deploy
npm.cmd run ai:process -- batch 10
npm.cmd run ai:process -- article <article-uuid>
# Explicit retry of failed/expired input, capped at three attempts:
npm.cmd run ai:process -- article <article-uuid> --retry-failed
```

Optional server-only variables: AI_PROVIDER (`fallback` by default; `remote` or future `local`), AI_ENDPOINT, AI_MODEL, AI_API_KEY. No AI key is needed to build or run core functionality. The remote endpoint must implement the documented JSON gateway contract; it is not a vendor-specific API URL. Source permissions/licences remain authoritative. Original fields remain intact; generated fields, exact-span evidence and versioned provider/hash/provenance are recorded separately. Repeated unchanged processing is cached. Every result remains DRAFT/NEEDS_REVIEW until the later reliability/publication gate; fallback does not invent translations or facts.

## Evidence-aware reliability

Milestone 7 adds a deterministic ReliabilityEngine and current-data assessment service. Source tier/score, evidence strength, story certainty, usage permission, publication label and freshness remain separate. Trusted media can report a rumor; official confirmation requires reviewed claim authority, and social engagement never confirms facts. Vietnamese badge/explanation metadata is ready for later UI. See the [reliability policy and operator runbook](docs/RELIABILITY.md).

```powershell
npm.cmd run db:migrate:deploy
npm.cmd run reliability:assess -- batch 10
npm.cmd run reliability:assess -- article <article-uuid>
```

No new environment variable or API key is required. Configure reviewed source tiers/authority and evidence metadata in PostgreSQL/Prisma Studio. Existing sources default to unverified; numeric scores and reuse permission do not grant editorial authority. Copied sources count once; reviewed contradictions become DISPUTED, and explicit official corrections preserve history. Permission denial, missing Vietnamese output, unreviewed claims or stale processing block eligibility. Assessments are versioned/idempotent and never publish an article or promote it to READY. Future publishing code must enforce a fresh gate; historical assessment JSON is not a publication token.

## Deterministic story clustering

Milestone 8 adds StoryClusteringService with separate candidate generation, similarity/decision and canonicalization modules. It groups exact URL/title duplicates before near matches, using linked identities, event wording, story type, transfer stage, time and reviewed lineage. Embeddings and paid AI are not required. See the [clustering strategy, history and manual operations runbook](docs/STORY_CLUSTERING.md).

```powershell
npm.cmd run db:migrate:deploy
npm.cmd run news:cluster
npm.cmd run news:cluster -- --since 24h
```

Only DATABASE_URL is required. Default work is bounded to 200 articles and includes complete membership of affected clusters; oversized work fails atomically. Similarity is not reliability. Transfer stages remain distinct; syndicated sources count once for independent corroboration. Canonical Vietnamese text is an exact paired copy from a currently eligible permitted member, never a synthesized fact. Disputes block public candidates. Source revocation is rechecked on current reads; clustering never publishes an article or grants permissions.

Versioned cluster snapshots preserve provenance and evolving membership. Audited backend merge/undo/split and grounded canonical/feature/dispute overrides prepare the later Admin workflow. The News UI uses one current published, eligible cluster rather than one card per member Article.

## Vietnamese news routes

Milestone 9 adds `/news` and `/news/tin-<cluster-uuid>` with canonical Vietnamese stories, EPL/La Liga filters, lightweight pagination, reliability/certainty badges, transfer previews and full permitted source attribution. The read-only server service rechecks PUBLISHED/READY status, current processing, permissions, evidence and grounded canonical text; clustering never grants publication. Badge colors distinguish official, reliable, social, rumor and disputed states without truth percentages. Copied sources do not inflate independent counts.

The browser uses internal rendered data only. No publisher photos or copyrighted club crests are requested: cards use text/TLA/initials. Dates display in Asia/Ho_Chi_Minh; UTC storage stays unchanged. Safe external citations include original title/language/date, source tier, licence, attribution and revision. Detail metadata is indexable only for currently permitted public Vietnamese stories; unavailable/private stories are noindex. See [News UI behavior, publication gates, limitations and local smoke instructions](docs/NEWS_UI.md).

Run `npm.cmd run dev` or `npm.cmd run build` then `npm.cmd run start` and visit `/news`. No additional environment variables or paid provider are required. Set the existing NEXT_PUBLIC_APP_URL to the deployment origin for canonical/Open Graph URLs. The real English Wikinews draft remains private until Vietnamese processing, editorial review and authorized publication are complete; an empty public list is expected in that state. The current milestone adds no publishing command, admin workflow or fake production story.

## Transfer Center

Milestone 10 adds `/transfers` and `/transfers/giao-dich-<transfer-uuid>` with separate Confirmed, Negotiation, Interest and Rumor states, league/status filters, deterministic ordering, source-backed timelines and Vietnamese cards. The server requires current reviewed authoritative completion evidence for confirmation; copied reports, AI confidence and cached statuses cannot manufacture it. An official announcement of talks remains negotiation. M7 transfer wording now uses versioned policy `reliability-v1.1.0`; prior assessments are retained.

```powershell
npm.cmd run db:migrate:deploy
npm.cmd run news:cluster
npm.cmd run transfers:sync
npm.cmd run dev
```

The additive migration extends existing TransferUpdate history with cluster links, unique input hashes, validated snapshots and append-only protection; there is no reset. Player/current/destination use existing canonical identities, destinations stay separate and source history is preserved. Page requests read internal data without provider calls or writes. Publishing/permissions remain governed by the existing News gates. Reported/confirmed fees are separate, raw source currency and qualifiers are retained, contract data needs exact reviewed evidence, and missing prices never mean free. Legacy fee/date columns are not automatically trusted.

No new environment variable, key or paid service is needed for Transfer Center. The configured real database remains empty of published Vietnamese transfers; incomplete mappings have honest fallbacks. See [Transfer Center workflow, fact evidence contract, guardrails, limits and validation](docs/TRANSFERS.md).

## YouTube highlights

Milestone 11 adds a small verified highlight panel to completed `/match/[slug]` pages. It uses persisted metadata and safe YouTube watch links; page rendering never calls YouTube. Original titles, channel, video type, Vietnam publication time and honest geo/language availability are shown. Missing video gives an explicit Vietnamese empty state. No video/thumbnail download, rehosting, embedding or random reupload fallback.

`VideoProvider` separates YouTube API DTOs from application services. The registry initially reviews FPT Bóng Đá for EPL and SCTV Thể Thao Official for La Liga, scoped to VN/2026–27 with finite rights dates. Stable IDs must resolve from publisher-reviewed handles before discovery. Source/season/market approval, both teams, competition, upload timing/type and public availability are checked before selection. Vietnamese authorized sources precede official/international fallbacks; reviews/rights can expire and revoked sources immediately disappear. One primary per match and platform/video identity uniqueness are enforced in PostgreSQL.

```powershell
npm.cmd run db:migrate:deploy
npm.cmd run video:sync -- registry
# Optional: configure server-only YOUTUBE_API_KEY in ignored .env after enabling YouTube Data API v3.
npm.cmd run video:sync -- smoke
npm.cmd run video:sync -- recent
# Use a real internal Match UUID instead of the angle-bracket argument:
npm.cmd run video:sync -- match <internal-match-uuid>
npm.cmd run video:sync -- refresh
npm.cmd run video:sync -- cleanup
```

Run refresh/cleanup at least daily while storing API metadata, including cleanup if the key is removed: stale managed records expire at 29 days to meet the API's refresh/delete requirement. No scheduler is added here. Discovery is bounded/cached with a ten-search daily application cap; quota failures persist cooldown and never wipe good data. Builds and core match pages work without a key. See [provider/source evidence, finite mappings, matching, availability, quota, retention and local smoke procedure](docs/VIDEO_HIGHLIGHTS.md). Live YouTube validation was skipped because the key was not configured; deterministic and isolated production-route checks passed.

## Morning Brief engine

Milestone 12 generates structured Vietnamese briefs from persisted internal data only. MorningBriefService reuses checked canonical News, Transfer and Video boundaries, adds explainable deterministic ranking, league/club balance and section limits, and preserves citations for every item and summary point. No live provider or paid AI call is needed. Empty sections/community are omitted; rumor language and confirmed/reported distinctions remain unchanged.

```powershell
npm.cmd run db:migrate:deploy
npm.cmd run brief:generate -- today
npm.cmd run brief:generate -- 2026-10-18
npm.cmd run brief:generate -- smoke
# Later regeneration of the same local date, with an explicit UTC cutoff:
npm.cmd run brief:generate -- 2026-10-18 --as-of 2026-10-18T01:20:00Z
```

Default: Asia/Ho_Chi_Minh, 08:00 editorial cutoff, last 24 hours plus next 24 hours of fixtures, EPL/La Liga only. --lookback, --upcoming, --cutoff-hour and --timezone configure supported windows; a delayed run still uses its stated cutoff. UTC remains stored unchanged. Results use FINISHED status plus a kickoff window because exact completion times are unavailable; source timestamps remain visible. Never infer missing scores, events or reactions.

One date/locale identity keeps immutable revisions. Identical current input reuses the latest revision; corrections/new data append history, including a return to an earlier value. Nonempty validated briefs become READY; empty input stays DRAFT. Generation never auto-publishes. An explicit internal publication operation rechecks current sources/facts, while BriefQueryService exposes latest/by-date/revision queries and protected internal previews. No API mutation route is added.

YouTube metadata is resolved at read time through M11; immutable briefs retain only internal references and do not prevent metadata retention cleanup. Existing source permission/Vietnamese/reliability gates remain authoritative. See the [Morning Brief runbook](docs/MORNING_BRIEF.md) and [real local structured sample](docs/samples/morning-brief-local.json). The sample is READY/unpublished, with six sourced upcoming fixtures; absent current results/news/transfers were not fabricated.

## Morning scheduler

Milestone 13 wraps existing services in ScheduledJobRunner. Default **07:30 Asia/Ho_Chi_Minh** refreshes matches, permitted news, eligible articles, reliability, clusters, transfers and verified videos; **08:00** generates the brief. All stored runtime timestamps are UTC. An external scheduler invokes one-shot ticks; nothing is installed into Windows or run inside Next dev. Set `SCHEDULER_ENABLED=true` in the worker environment to enable ticks.

```powershell
npm.cmd run scheduler:morning -- today --dry-run
npm.cmd run scheduler:morning -- today
npm.cmd run scheduler:morning -- today --stored-only
npm.cmd run scheduler:morning -- today --stored-only --rerun
npm.cmd run scheduler:morning -- 2026-10-17
npm.cmd run scheduler:tick
npm.cmd run scheduler:health
```

Manual full runs require the target time to be due; `--refresh` runs upstream work after 07:30. Historical dates read retained data without refreshing current state. Stored-only skips external providers and forces deterministic article fallback, making no external API/AI calls. A dedicated PostgreSQL session advisory lock prevents concurrent workflows; logical JobRun keys and service hashes prevent duplicate data/revisions. Completed runs are cached unless `--rerun` explicitly requests re-evaluation. Short transient failures have bounded retry/backoff; optional failures produce PARTIAL while a valid brief still becomes READY. Database/brief failures are critical. Publication remains explicit; no cron endpoint or auto-publication is exposed.

JobRun audits retain counts, statuses, safe errors, invocation history and provider freshness associated with the exact brief revision. See [scheduler configuration, retry/recovery, locking, freshness and deployment instructions](docs/SCHEDULER.md) for Linux cron, Windows Task Scheduler, GitHub Actions and hosted options. Automation requires registering that external trigger and a session-capable database connection; no scheduler secret is added.

## Morning homepage

`/` now presents the latest eligible **PUBLISHED** Morning Brief using internal persisted services only. It shows the Vietnamese date/update, a compact linked summary, results/verified highlights, canonical stories, club/player spotlight, Transfer Watch, off-field and upcoming fixtures wherever meaningful data exists. Empty sections/community are omitted. Reliability and independent-source labels come from the backend; rumors remain speculative. Source details and original links are visible without reproducing article bodies. Text/initials work without licensed imagery.

The layout starts with one mobile reading column and four-route navigation, expanding to a main column/secondary rail on desktop. Three summary points are immediately visible; additional points expand with native details. All displayed times use Asia/Ho_Chi_Minh. Old briefs keep their true date; exact-revision scheduler partial/stale flags show a gentle updating notice. Errors and no published content have safe Vietnamese fallbacks with links to matches, news and transfers.

```powershell
npm.cmd run dev
# Development-only READY preview: http://localhost:3000/?preview=1
npm.cmd run build
npm.cmd start
# Production / is PUBLISHED-only; ?preview=1 does not grant access.
```

The preview requires server NODE_ENV=development and the exact query value. It still checks current rights/facts, is visibly marked unpublished and is noindex. No draft/failed content, auto-publication, new environment secret, external render-time fetch or client-side provider call. The original local sample remains READY/unpublished, so production correctly shows preparation until a genuine eligible brief is explicitly published. See [homepage structure, preview/publication policy, responsive behavior and validation](docs/MORNING_HOMEPAGE.md).

## Authentication and following

Public reading stays open. Optional Google OAuth uses Better Auth 1.7.10 and revocable database sessions; no password registration or mandatory paid service. `/account` contains identity, follows, canonical alias-aware search and lightweight Vietnamese locale/timezone preferences. `/following` redirects there. Match/news detail links preserve canonical follow targets through login. Personalization is service readiness only; global Briefs and public ranking remain unchanged.

Set server-only `AUTH_SECRET` (random, at least 32 characters), `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` in ignored `.env`. Blank configuration disables sign-in with a clear Vietnamese state; builds and public routes still work. Local Google development: use `npm.cmd run dev`, `NEXT_PUBLIC_APP_URL=http://localhost:3000`, and register exact Google redirect `http://localhost:3000/api/auth/callback/google`. Production requires the exact HTTPS public origin, its registered callback and a separate production OAuth client. Never paste keys into chat or commit them.

Apply additive migration with `npm.cmd run db:migrate:deploy` and generate the client before deploying. Secure/httpOnly/SameSite cookies, PKCE/state, explicit origin checks, ownership-scoped mutations, private no-store DTOs and database uniqueness protect sessions/follows. No provider tokens, passwords, avatars or session IP/user-agent history are retained. Abuse counters and transient auth state need retention cleanup: `npm.cmd run auth:cleanup` removes expired records and counters inactive over 24 hours, without deleting users/follows/content.

For credential-free validation run the standard suite, build, then `npm.cmd run auth:smoke`. It requires local PostgreSQL CREATE DATABASE permission and port 3018; it creates/removes a disposable database and uses only ephemeral fixture identities and library-issued test sessions. No application dev-login bypass exists. The real Google consent flow remains a local/deployment check using your own credentials. See the [full auth/following runbook and file inventory](docs/AUTHENTICATION_FOLLOWING.md) for privacy, exact routes, setup, limits and test details.

## Health, logging and errors

`GET /api/health` is dynamic and uncached. It reports `app: up`, `database: up | unavailable | not_configured`, and a generated `requestId` also returned as `X-Request-Id`. HTTP 200 means app and DB are ready; HTTP 503 means the app responds but DB readiness failed. Missing DB is expected until configured. The endpoint never exposes credentials or database exception text. It is a readiness probe; do not use DB outages to trigger endless liveness restarts.

Pino emits JSON on stdout with timestamps, levels and controlled event identifiers. Credential fields and authorization/cookie fields are redacted. Call sites must allowlist metadata and never log arbitrary strings, raw errors, URLs, payloads or headers; key redaction cannot sanitize arbitrary free text. Next instrumentation records startup and request failures without serializing errors. Route and root error boundaries show generic Vietnamese messages with retry controls; loading and not-found states are included. Next.js/hosting runtime logs are separate from the application logger; configure host access and retention appropriately.

If startup fails, correct the named invalid environment fields and restart. If health returns 503, check the local DB service, URL, network and permissions, then run `db:check`. Provider keys are not needed to recover the foundation shell.

## Structure

`app/` routes, read APIs and boundaries; `components/` UI; `lib/` environment, logging, DB and composition utilities; `types/` shared contracts/job definitions; `providers/` adapters; `services/` normalized sync/persistence/queries and scheduler orchestration; `jobs/` execution-boundary notes; `prisma/` schema/migrations/seed; `scripts/` operational commands; `tests/` deterministic foundation, schema and provider checks. Verification evidence and remaining gates are recorded in `docs/PROGRESS.md`.

## Current limitations

Milestones 1–15 code validation is GO. The Morning Brief engine and scheduler pass deterministic SQL tests and real-data READY/unpublished generation with idempotent repeats. External cron/Task Scheduler registration is still an operator duty; homepage code and isolated populated journey checks pass. Transfer/video UI passes configured-database empty-state checks and isolated populated production routes. Live YouTube validation requires your optional server-side key; source reviews remain operational duties. Real published-news/transfer smoke still depends on approved Vietnamese content. Wikinews coverage is sparse/historical. Additional sources need rights checks. Free match data is delayed and lacks exact completion timestamps/advanced stats. Fallback cannot translate foreign-language articles. No existing draft was made public. Real Google consent needs your own OAuth configuration; deterministic auth and isolated production session/following validation pass. Milestone 16 is not started.

Code checks and real Wikinews ingestion/rerun checks pass. Scheduler declares the already installed/locked `pg` and `@types/pg` packages directly for its dedicated lock connection, without changing their versions. The prior runtime audit reported zero vulnerabilities after parser installation. Five previously documented development-tool advisories remain; no forced downgrade was applied. Responsive match review was performed; production deployment and a full accessibility audit remain outstanding.
