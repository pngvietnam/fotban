# Morning scheduler (Milestone 13)

`ScheduledJobRunner` orchestrates the existing services. It contains no provider normalization, editorial classification, publication or UI logic. `createSchedulerHandlers` is the composition boundary; deterministic tests replace handlers without paid services. Execution is a one-shot CLI process invoked by an external scheduler, independent of Next.js and any hosting vendor.

## Schedule and workflow

Default timezone is **Asia/Ho_Chi_Minh**, target **08:00** (01:00 UTC), refresh begins **07:30** (00:30 UTC). Server timezone is irrelevant. A tick before refresh is a no-op, ticks during refresh run upstream jobs, and ticks at/after the target complete generation. No sleeping process bridges the phases. If upstream work takes longer, the next tick resumes safely after its lock is released.

Order: `MATCH_SYNC` → `NEWS_SYNC` → `ARTICLE_PROCESS` → `RELIABILITY_UPDATE` → `STORY_CLUSTER` → `TRANSFER_UPDATE` → `VIDEO_SYNC` → `MORNING_BRIEF_GENERATE`.

- Matches: PL/La Liga, cutoff minus two days through plus one day, existing six-hour resource cache and provider limits; no force refresh.
- News: enabled, permitted sources only, ten items/source, existing source TTL/rights/license gates. Restricted official sources remain disabled. A failing source cannot stop other sources.
- Processing/reliability: at most 50 recent collected articles, a 48-hour window. Processing uses the existing permission/content-hash gates; unchanged articles avoid AI calls. Failed validation is not automatically retried; explicit existing `ai:process -- --retry-failed` is an operator decision. The recent candidate window is applied before the batch limit to avoid starvation behind old drafts.
- Clustering and transfers: existing deterministic services and immutable histories; current bounds/permission rules are unchanged.
- Video: existing recent mode, quota/cooldown, registry rights, matching and metadata-expiry behavior. A quota failure degrades the workflow instead of preventing a brief.
- Brief: existing M12 service, stable logical cutoff, Vietnamese/provenance/permission validation and immutable revisions. **Generation never calls publish.** Nonempty valid content stays READY/unpublished; empty DRAFT is recorded as a failed generation (`NOT_READY`), not a successful morning delivery. An already published cached revision is not unpublished or republished.

These explicit M13 instructions supersede the older multi-time baseline and automatic 08:00 publication examples in the planning documents. Scheduler does not change editorial publication policy.

## Configuration and commands

```dotenv
APP_TIMEZONE=Asia/Ho_Chi_Minh
MORNING_BRIEF_HOUR=8
SCHEDULER_ENABLED=false
```

The existing server-only `DATABASE_URL`, provider keys, Wikimedia contact and optional AI configuration apply. No new secret is required. Only supported M12 zones (Ho Chi Minh, Bangkok, UTC) are accepted; arbitrary DST zones are deliberately rejected. Hour is an integer 1–23. Refresh lead is centrally configured as 30 minutes. The enabled flag controls automated **ticks**; explicit manual runs remain available when it is false. Build needs no database or provider key.

```powershell
npm.cmd run db:migrate:deploy
# Inspect plan only; no database, API request or write:
npm.cmd run scheduler:morning -- today --dry-run
# Manual full workflow, at/after today's 08:00 target:
npm.cmd run scheduler:morning -- today
# Manual upstream phase, at/after 07:30:
npm.cmd run scheduler:morning -- today --refresh
# Zero external API calls, including remote AI; existing data + deterministic fallback:
npm.cmd run scheduler:morning -- today --stored-only
# Explicitly re-evaluate a completed/partial run using service caches:
npm.cmd run scheduler:morning -- today --stored-only --rerun
# Safe historical cutoff, reads persisted data only; no refresh of present-day state:
npm.cmd run scheduler:morning -- 2026-10-17
# Automated mode (set SCHEDULER_ENABLED=true in the worker environment first):
npm.cmd run scheduler:tick
npm.cmd run scheduler:health
```

Future/not-yet-due manual dates are rejected. Historical runs use a distinct date key and M12's immutable revisions; historical availability is limited to what is retained in the database, not an invented point-in-time reconstruction. `--stored-only` skips match/news/video refresh; processing explicitly uses fallback even if remote AI is configured. It does not refresh video metadata or manufacture provider success timestamps. Normal scheduled runs perform video maintenance. Existing M11 query-time expiration still withholds stale links.

Exit codes: **0** successful/cached/skipped/refresh pending; **2** partial (brief generated, optional dependencies degraded); **1** critical/invalid configuration/not-ready. Missing optional keys and no permitted sources are explicit SKIPPED results rather than code failures. A source cooldown/busy video job counts as degraded, allowing an operator to see a partial outcome. No permission gate is relaxed.

## Locking, recovery and idempotency

### Local immediate acceptance mode

`npm.cmd run scheduler:morning -- now` runs the same eight handlers immediately. The separate `manualMorningPlan` captures one current UTC instant with the Asia/Ho_Chi_Minh calendar date, uses a `manual-morning-v1:<instant>` logical key and does not call or alter the due-time policy. It refuses production NODE_ENV and a non-loopback database; `now --refresh` is rejected because acceptance is the full workflow. `--dry-run` inspects the plan without mutating data. Existing `--stored-only` remains an explicitly offline alternative, but the recorded live acceptance used real configured adapters.

The existing MorningBriefService receives the captured instant as `asOf`, keeping the normal 24-hour lookback and upcoming horizon. Storage remains UTC. Identical cutoff and input state reuse the M12 revision; a later cutoff/window is a new input and may append a revision. No hash/publication rule is relaxed. Current-time keys never satisfy/cache a scheduled 08:00 workflow, and the same PostgreSQL session lock prevents overlap with normal jobs.

In this manual mode only, unavailable optional adapters (`NOT_CONFIGURED` / `NO_PERMITTED_SOURCES`) contribute to PARTIAL/degraded-dependency metadata while generation continues. Other transient failures use existing bounded retry/cache policies. Do not run a repeated live acceptance loop. Exit 2 means partial/degraded, not that the generated Brief necessarily failed validation.

View READY using the existing development-only `/?preview=1` on the actual local dev-server port. Production ignores the flag; the public homepage still requires PUBLISHED. No local publish command, fixture injection, public preview endpoint, new environment variable, schema change or automated trigger is added. The normal 07:30 refresh / 08:00 generation schedule is unchanged.

Every production invocation acquires **one dedicated PostgreSQL session advisory lock**, key `91531113`. A second process immediately returns `WORKFLOW_RUNNING`, including overlapping backfills/different dates. A separate `pg.Client` holds the session across calls; queries are never sent to arbitrary pooled sessions. Connection death releases the PostgreSQL lock. A lost-session event stops further runner steps and success reporting. Existing services also retain their own transactional locks/idempotency protections. Use direct/session-pooled PostgreSQL connectivity for the scheduler; transaction-pooling proxies cannot preserve this session lock.

The existing unique `(jobName, logicalKey)` key identifies the workflow and each step. The key includes timezone and logical UTC target, not invocation time or secrets. Successful external refresh steps resume without repetition after a failed generation or between 07:30/08:00. Internal processing/projections are rechecked so a recovered source's new articles are not missed; their existing hashes avoid duplicate AI calls/records/revisions. A completed/partial same-mode invocation is cached. `--rerun` explicitly repeats handlers using their own caches and rechecks M12 input hashes; unchanged brief inputs reuse the revision, changed inputs append a revision. Changing stored-only to normal mode is not hidden by the cached completed run.

Audit JobRun ownership is fenced on updates. An abandoned RUNNING row can be recovered only after the next runner holds the global database lock; it never steals a live process's timed lease. Immutable per-invocation attempt rows preserve earlier success/partial/failure history even as logical job rows are reused. Final workflow state and attempt audit commit atomically. Database loss may prevent immediate failure audit persistence; logs report `auditPersisted=false`, and the next invocation recovers its abandoned row under the lock. Run a single scheduler process per CLI invocation and keep all scheduler entrypoints on this runner.

Runner retries only explicitly transient errors, maximum **two attempts**, exponential backoff starting at **500ms**, and no waiting beyond **5 seconds**. Longer provider Retry-After/cooldown is persisted as a UTC retry-not-before timestamp; phase changes and explicit reruns cannot bypass it. After expiry, an operator can rerun a completed partial workflow. Adapters already implement their own bounded network retries/rate limits; multi-source jobs report partial outcomes rather than blindly repeating successful providers. Permanent permission/auth/configuration/validation failures and partial external batches are retained across refresh/generation phases; correct the issue and use an explicit rerun. There is no infinite queue or hidden publication. Persisted FAILED jobs and safe error categories form the inspectable failed-job queue; recovery is manual or the next due tick for an incomplete transient failure. Completed PARTIAL runs require explicit rerun, avoiding repeated quota consumption every five minutes.

## Audit, freshness and health

Logical workflow and step JobRuns record scheduled time, logical date, UTC start/end, attempts, status, owner/correlation, safe error categories, processed/succeeded/failed counts and validated outcome. Steps have domain-specific record units (articles, clusters, matches/video records, or one generated brief); workflow totals are operational throughput, not unique editorial stories. SKIPPED entries explain unavailable configuration/mode. No raw error, provider payload, header, key, connection URL or user content is persisted by the scheduler.

Before generation, ProviderStatus supplies actual last-success and data-update timestamps, health and an explainable age flag (36-hour threshold). Missing/future timestamps are stale/unknown, not invented. Disabled sources stay visible as disabled. The brief-generation JobRun stores this snapshot **beside its exact BriefRevision reference**; the handler receives the context and logs stale-input count. This audit association gives internal consumers input freshness without changing M12's immutable content or causing a revision just because wall time advanced. Freshness does not imply current data exists or alter source reliability. `SchedulerStore.health()` / `scheduler:health` expose last successful, partial and failed attempts with safe checkpoint metadata. No public health/admin endpoint or HTTP mutating trigger is added.

Structured JSON logs include workflow/job IDs, job type, date, start/end events, counts, status and error code. Operators should capture stdout and alert on exit 1/2 or absence of a successful morning attempt. They must also monitor stale input flags and READY vs published separately. This milestone does not send notifications.

## Deployment-neutral invocation

One working path is the local CLI above. To automate, install dependencies/build, apply migrations, supply server environment, enable ticks, and register an external scheduler. Nothing is automatically installed into the user's operating system.

- **Linux cron**: run every five minutes with an absolute project path and Node path. Example: `*/5 * * * * cd /srv/football-morning && SCHEDULER_ENABLED=true /usr/bin/node --import tsx --env-file-if-exists=.env scripts/run-scheduler.ts tick >> /var/log/football-morning-scheduler.log 2>&1`. Adapt Node/log paths and permissions; log rotation is an operator duty. The runner resolves Vietnamese due times regardless of cron's timezone. Runtime includes `tsx`; do not prune dev dependencies on the worker unless compiling scripts separately.
- **Windows Task Scheduler**: repeat `npm.cmd run scheduler:tick` every five minutes, set Start in to the repository, enable the flag in the worker environment. Use a durable task/service account; no ExecutionPolicy change is needed.
- **GitHub Actions / hosted cloud scheduler**: invoke the same command with server secrets and database connectivity. Schedule 00:30 and 01:00 UTC (or frequent ticks for recovery); delayed execution still uses the logical cutoff. Protect scheduled/manual workflow permissions and database network access.
- **Vercel Cron / HTTP-only scheduler**: use a separate protected worker bridge if needed later. This milestone exposes no HTTP job trigger, so no public unauthenticated mutation or webhook secret exists. Any future bridge must authenticate POST requests and call this runner rather than duplicate it. Do not rely on Next dev timers or a suspended web instance.

The lock is global within a database; all workers must use that same database/session-capable connection. Scheduler audit retention and automatic external failed-job alerting are operational follow-ups, not an Admin UI. This milestone does not install a daemon, autoschedule publication, implement the homepage or begin Milestone 14.
