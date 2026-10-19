# Admin operations — Milestone 16

The internal console operates existing persisted data and services. Public reading remains anonymous. There are no new paid providers, auth secrets, default administrators, development-login endpoints or external calls during admin page rendering.

## Setup and authorization

1. Configure the existing M15 Google authentication (`AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `DATABASE_URL`, exact `NEXT_PUBLIC_APP_URL`). See [authentication setup](AUTHENTICATION_FOLLOWING.md). Production requires HTTPS.
2. Apply the additive migrations with `npm.cmd run db:migrate:deploy`. Back up production before deployment; never reset the database.
3. Sign in normally to create your User. Copy its canonical UUID from the local/operator User record (Prisma Studio can be used read-only). Bootstrap the **first** administrator explicitly:

   ```powershell
   npm.cmd run admin:bootstrap -- <existing-user-uuid> "Initial operator access reviewed" --confirm
   ```

   This operator-only command requires database access, locks concurrent bootstrap attempts and refuses to run if any ADMIN already exists. It records the original/new role and reason in AdminAuditLog. It is not an HTTP endpoint or email/domain allowlist. Subsequent role administration is deliberately outside this lightweight console; use a controlled operator procedure.
4. Open `/admin`. Only the current database `ADMIN` role is accepted. Existing `USER` and legacy `EDITOR` roles receive 403. Revoking ADMIN takes effect with the existing session; no sign-out is needed.

The Next.js Proxy matches only `/admin/*` and `/api/admin/*`, returning an actual safe 403 for unauthorized requests. Every page query and mutation independently resolves the server session and database role. Mutations recheck and lock the actor within the committing transaction. Proxy/navigation are not the authorization boundary by themselves. Public routes have no new session lookup or login gate.

Private HTML/APIs are noindex and `private, no-store`. POST mutations require the exact configured Origin, reject cross-site requests and validate a bounded 32 KiB JSON body with strict Zod schemas. Actor/role fields from browsers are rejected. All operational changes require a reason and explicit confirmation; risky forms also request browser confirmation. Source/video forms reject stale `updatedAt` versions, preserving millisecond precision.

## Routes and common operations

| Route | Operations |
| --- | --- |
| `/admin` | Review queue size, disabled/restricted sources, active video channels, provider freshness/status, latest Brief and scheduler success/partial/failure. Quota values are not invented when no safe metric exists. |
| `/admin/sources` | Search name/domain, filter enabled/permission/tier, edit existing source identity/language/country/reliability/authority scopes/permission/ingestion metadata. |
| `/admin/videos` | Edit or add reviewed YouTube whitelist entries. Configure canonical channel ID/handle, verification date, type, priority and review reference. |
| `/admin/videos?type=MAPPINGS` | Edit season/competition/market/date rights mappings. Add a mapping from its channel card. No perpetual or hard-coded broadcaster entitlement. |
| `/admin/stories` | Search/review processed articles and their canonical clusters, filter publication/processing/type/league. `?id=<article-uuid>` opens evidence, processing history, canonical entities and audit history. |
| `/admin/transfers` | Filter league/status, search player/clubs. `?id=<transfer-uuid>` opens evidence timeline, explicitly sourced fees/contracts and safe review. |
| `/admin/briefs` | Filter date/state, inspect immutable revisions, protected READY preview, generate/regenerate and explicitly publish. `?id=<revision-uuid>` selects a revision. |
| `/admin/jobs` | Filter status/date, inspect safe job type/logical date/start/end/attempts/processed count/error category, trigger the stored-data morning workflow. |

Lists fetch **20 rows plus one lookahead**, with bounded page/search/filter inputs and stable ID tie-breaks. Story evidence/timeline/history panels are bounded. Technical identifiers are visible only where operators need them for evidence or reversible cluster actions. No source body, provider checkpoint, raw exception, environment value, token or credential is included in job DTOs. Errors use a controlled allowlist; unknown categories become `JOB_FAILED`.

## Permissions and reliability

Reuse the existing permission enum: **UNREVIEWED / ALLOWED / RESTRICTED**. Prohibited, permission-required or otherwise incompatible sources remain RESTRICTED/disabled; the reason/reference belongs in the reviewed policy metadata. This avoids adding redundant statuses across all ingestion/publication gates.

Enabling a source or ingestion requires ALLOWED, reviewed terms, a permission reference and review rationale. Commercial-reuse approval additionally requires reviewed ALLOWED terms. The current administrator/date are recorded as reviewer/reviewedAt. Reliability score/tier/official flags cannot substitute for permission. The individual article's reusable license, attribution, provenance and existing publication gates still apply. Saving the registry does not fetch an arbitrary URL or create a new ingestion adapter. Existing restricted league/club sources are not enabled by this implementation or smoke test.

Video enabling requires a verified canonical YouTube channel and a non-future verification less than 180 days old. Rights mappings must reference a stored source and Premier League/La Liga, valid consecutive season years, reviewed HTTPS evidence, and an ordered bounded date window. Expired mappings can be retained disabled; they cannot be enabled. Existing M11 selection rechecks season/date/source verification on use. The console stores metadata/links only and grants no redistribution rights.

## Editorial review and corrections

1. Open a story, inspect the original title/excerpt/source, current permission, reliability, certainty and processing history.
2. Edit Vietnamese headline/summary/classification if necessary, giving exact persisted source spans. Transfer extraction corrections select canonical player/club IDs actually present in source content and an existing proof reference. The same M6 structured-output, numeric/entity, quote and uncertainty validation runs server-side. The edit creates a **new EDITORIAL AIProcessingRun**; the original generated version and original source fields remain unchanged.
3. Edited statements return to DRAFT/NEEDS_REVIEW. Review their new evidence records explicitly. Official evidence additionally requires an official tier-0 source and an authority scope present in both the source's reviewed scope and the article entities. Copied sources must retain the same lineage key.
4. Approve only when all current permission, processing, evidence, Vietnamese and conflict checks pass. Approval creates an immutable audit tied to the **exact run ID, text and classification** and links it from Article. Public reliability evaluation accepts that exact approval while the manual lock still prevents unattended AI reprocessing. A later edit/review/rejection clears approval atomically. Admin confidence alone cannot produce CONFIRMED.
5. Reject/mark for review to withdraw public eligibility. Source/evidence and processing history are retained. Feature/disputed controls update canonical metadata with audit. Disputed stories cannot be published by clearing an AI flag alone.

The public news, transfer and Brief read boundaries re-evaluate current data on each dynamic read. Hiding or revoking a source invalidates its public eligibility immediately; a frozen published Brief containing revoked/changed content is withheld rather than silently rewritten. Regenerate a validated correction revision and explicitly publish it. Previously published immutable content/history is retained. No public cache is introduced by this milestone.

Cluster merge/split/undo controls reuse StoryClusteringService, canonicalization, locks and immutable membership audits. They refuse published members or clusters referenced by published Briefs. Use the cluster/article IDs in the review panel. Keep the returned audit ID to undo a merge; undo refuses to overwrite later changes. These operations never delete articles or evidence.

Transfer review re-projects the selected relationship through TransferTrackingService. The requested status must match reviewed current evidence; CONFIRMED requires an exact authoritative confirmation proof for the canonical player/club pair. Source count, engagement, AI output and admin intent cannot upgrade a rumor. Current/reported fee distinctions and currencies remain evidence-derived. Correct an extraction through the originating article, then review its new proof and approve.

## Brief publication and jobs

READY previews use BriefQueryService with an **authorized internal** option and the same current-fact/permission checks. Public READY preview policy is unchanged. Publishing calls MorningBriefService, checks the current newest READY revision and input facts/permissions, then atomically sets PUBLISHED, publishedAt, publishedById and an audit record. The existing snapshot trigger now permits publisher attribution only during READY → PUBLISHED. Published snapshots remain immutable. **Unpublish is not exposed**; withdrawal uses underlying content gates and an explicitly reviewed new revision.

Generate/regenerate and morning rerun record durable REQUEST/RESULT/FAILED audits. Domain execution happens outside the short audit transaction. Morning rerun uses the existing ScheduledJobRunner and dedicated PostgreSQL advisory lock; it cannot run concurrently with the regular scheduler. The console uses **stored-only mode**, skipping external match/news/video refresh and using deterministic AI fallback. Brief hashing prevents duplicate revisions for unchanged inputs. Brief publication remains separate. Long jobs should run through the existing CLI/worker; this lightweight HTTP path is awaited and deployment execution limits still apply.

## Schema and audit

- `20261018090000_admin_publication`: nullable unique `Article.approvalAuditId` FK to immutable AdminAuditLog; nullable indexed `BriefRevision.publishedById` FK to User. Existing rows stay null and existing publications remain valid.
- `20261018091000_admin_publication_guard`: additive publisher-state CHECK and replacement of the existing READY snapshot guard to allow attribution only with the explicit publication transition. No content immutability, evidence constraint or historical row is removed.
- `20261018092000_admin_registry_identity`: nullable unique VideoSource.registryKey, backfilled only for the two existing initial handles. This stable identity prevents changed handles from recreating enabled defaults. Initial mappings are inserted only when that source/competition has no stored mapping; edited windows are never replaced. News registry initialization recognizes the existing slug after domain edits.
- Existing append-only AdminAuditLog stores actor/action/entity/reason/timestamp and bounded before/after summaries. All sensitive console mutations are audited transactionally; long operations also record their durable intent/result. No standard action deletes evidence, revisions, JobRuns or users.

## Validation

```powershell
npm.cmd run db:migrate:deploy
npm.cmd run db:validate
npm.cmd run db:generate
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd run admin:smoke
```

`admin:smoke` requires loopback development PostgreSQL with CREATE DATABASE and a built app; it refuses production NODE_ENV. It creates an owned disposable database, applies all migrations, inserts deterministic fixtures, issues real signed Better Auth test sessions **in the test process only**, and starts production Next on loopback port 3019. It verifies all console routes, access denial, CSRF, source/video edits, story and transfer gates, protected READY preview/publication, hide propagation, scheduler concurrency and role revocation. It never contacts Google/providers or edits production permissions/publications. The disposable server/database are removed and original content/user/audit counts plus source-permission fingerprint must match. Evidence is saved in [admin-validation.json](samples/admin-validation.json). Real Google consent and real editorial decisions remain operator responsibilities.

32 new deterministic tests cover authorization, CSRF, input validation, permission safety, source/video persistence, expired rights, exact editorial approval, revision/review history, rumor protection, Brief publisher attribution, public withdrawal, reversible cluster membership, pagination, secret DTO isolation, bootstrap, registry preservation after edits and existing-runner concurrency. Existing milestone tests remain required.

## File inventory

Created: `proxy.ts`; `lib/admin-policy.ts`, `lib/admin-runtime.ts`; `services/admin-access.ts`, `admin-query.ts`, `admin-editorial.ts`, `admin.ts`, `admin-http.ts`, `admin-bootstrap.ts`; `components/admin/{admin-shell,admin-form,admin-view,admin-unavailable,cluster-operation}.tsx`; `app/admin/{layout,page,loading}.tsx`, `app/admin/[section]/page.tsx`, `app/api/admin/[...path]/route.ts`; `scripts/bootstrap-admin.ts`, `scripts/validate-admin.ts`; the three migrations above; `tests/admin.test.ts`, `tests/admin-ui.test.tsx`; this runbook and runtime evidence.

Changed: `prisma/schema.prisma`; `services/reliability-service.ts`, `story-clustering.ts`, `transfer-service.ts`, `morning-brief.ts`, `news-store.ts`, `video-store.ts`; `providers/youtube/sources.ts`; `package.json`; `.env.example`; `README.md`; `docs/PROGRESS.md`.

Milestone 17 (PWA) is a possible next milestone and is not implemented here.
