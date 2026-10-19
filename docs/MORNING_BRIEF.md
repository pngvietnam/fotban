# Morning Brief Engine — Milestone 12

## Architecture and scope

`MorningBriefService → stored matches + M9 canonical news + M10 transfers + M11 video selection → deterministic ranking/sections → strict validation → DailyBrief / BriefRevision / BriefItem / BriefItemEvidence`.

No external API or AI model is called. The engine extracts approved titleVi/summaryVi and formats persisted match facts with Vietnamese templates. It invents no score, statistic, quote, injury, transfer, fee or fan reaction. No paid dependency, scheduler, final homepage, auth, notification or social ingestion is added.

## Dates and windows

Default locale vi-VN; timezone Asia/Ho_Chi_Minh. Asia/Bangkok and UTC are also accepted; arbitrary DST zones are not. One identity exists per local date + locale. Configuration/window/ranking/schema versions are frozen per revision.

Default logical cutoff is **08:00 local**, with 24-hour lookback and 24-hour upcoming horizon, following the explicit M12 request. Older specification defaults (07:00/48 hours) remain configurable. A delayed command still uses its stated editorial cutoff; use --as-of for a later regeneration. Future cutoffs and mismatched local dates are rejected. All stored timestamps stay UTC.

Example: 18 October 2026 at 08:00 Vietnam gives result kickoff window [17 October 01:00Z, 18 October 01:00Z), story publication through cutoff, upcoming after cutoff through the next 24 hours. Horizons support 1–48 hours; competition input accepts EPL/La Liga only.

**Completion-time limit:** Match has no reliable finishedAt. Results therefore use FINISHED status and kickoff inside the window, with an explicit warning. This is not an exact finish-time audit. Missing/invalid scores are skipped, never made 0–0. Cached provider/version timestamps remain visible; generation does not refresh them or claim realtime. Events require provider capability support.

## Sections, ranking and deduplication

SUMMARY has up to six concise exact headline references, targeting 3–6 only when available. RESULTS includes all eligible results, with a fail-safe bound of 60. TOP_STORIES and CLUB_PLAYER have six-item limits, OFF_FIELD three, TRANSFERS five, UPCOMING six. Limits/labels/storage mapping live in lib/brief-policy.ts. Highlights attach to results rather than duplicate match narratives. HIGHLIGHTS/COMMUNITY are representable; no current approved community data is invented. Empty sections disappear.

Canonical clusters appear once across content sections; summary points reference them. Transfers use M10's current supported relationship/state, consuming old stage clusters without duplicating interest/talks/signing narratives. Different destinations remain separate. Untracked raw transfer articles wait for safe M10 projection. Off-field requires reliable/official meaningful content, not weak personal rumor. Vietnamese text and uncertainty remain unchanged; source metadata is not a foreign-language substitute or full article body.

Ranking version brief-ranking-v1 has normalized components: source class 30%, recency 25%, competition relevance 15%, prominence 10%, novelty 10%, reviewed independent corroboration 10%. A repeated unchanged prior snapshot receives a novelty penalty. Corroboration uses M7/M8 lineage, with a cap; copied publishers/engagement cannot boost confirmation. This internal importance is **not a truth percentage**. Prominence uses centrally configured canonical club names/slugs and stored editorial features; it creates no identity or standings claim. Similarly meaningful candidates favor league/club diversity without padding a league with no news.

Safe input bounds: 120 match candidates, 60 results, 200 canonical news candidates, 100 tracked transfers and existing M8/M10 history bounds. Oversized inputs fail rather than return a partial trusted history. Large-corpus batching/query tuning remains hardening work.

## Provenance, permissions and highlights

Each content item freezes canonical IDs, exact Vietnamese text, source fingerprint, certainty/classification, explainable ranking and citations. Citations include evidence/article IDs, permitted URLs, source names, publication times, language, source tier, licence and attribution. Structured match evidence names exact persisted fields and cannot confirm unrelated news. Summary evidence covers every point.

Current M6 processing, M7 evidence/permissions, M8 canonicalization and M9 PUBLISHED/READY gates are reused. Reliability never overrides usage rights. Restricted/private/untranslated/stale processing, disputed or social-only factual content is withheld. Only new authoritative M10 evidence can confirm a transfer.

Immutable briefs retain only internal video references: **no frozen YouTube API title/snippet/channel metadata and no restrictive Video FK**. BriefQueryService resolves links through M11 on each read. Revocation/removal/expiry/changed primary gives **Chưa tìm thấy highlight từ nguồn được xác minh.** Valid output contains direct URL/channel/type; metadata retention cleanup can proceed without changing brief history. No video is downloaded or rehosted.

Public reads recheck selected source rights and facts; history does not grant publication permission. Corrected results/revoked stories withhold stale output until regeneration. Historical upcoming items remain schedules as of cutoff after kickoff; rescheduling/cancellation invalidates them. Latest queries preserve the true date/revision.

## Revisions and publication

Additive migration **20261018040000_morning_brief_engine** adds only nullable BriefRevision.generationMetadata and managed READY snapshot protection. Existing models, enum and evidence joins are reused; earlier data is untouched. Metadata freezes request/window, candidate inputs, section order, summary and versions; BriefItem stores indexed content snapshots. Input hashes are verified on read.

Advisory locking, existing date/locale + revision uniqueness and bounded serialization retries protect concurrent generation. Unchanged input reuses the latest revision. Changed input appends a revision, including corrections reverting to an earlier value. READY content/items/citations are immutable; publication changes lifecycle fields only. Published immutability remains intact.

Nonempty validated content becomes READY, including upcoming-only days. Empty input persists DRAFT with sparse warnings. Malformed generation rolls back with controlled failure logging; arbitrary malformed output is never stored as trusted content. The underlying FAILED/NEEDS_REVIEW lifecycle remains available for future orchestration.

Generation/CLI **never auto-publish**. Explicit internal MorningBriefService.publish requires the latest READY revision and revalidates content/provenance under source/fact locks. It is tested only with disposable data. No publication HTTP endpoint is added; already published history remains until an explicitly validated replacement. The [M13 scheduler](SCHEDULER.md) calls generation only and stores input freshness beside the revision reference in its job audit.

## Commands and internal query contract

```powershell
npm.cmd run db:migrate:deploy
npm.cmd run brief:generate -- today
npm.cmd run brief:generate -- 2026-10-18
npm.cmd run brief:generate -- smoke
npm.cmd run brief:generate -- 2026-10-18 --as-of 2026-10-18T01:20:00Z
npm.cmd run brief:generate -- today --cutoff-hour 7 --upcoming 48
```

DATABASE_URL is the only required existing variable; no new key/dependency/.env change. Commands do not invoke upstream sync/translation or grant permission. Smoke persists/reuses a real local revision and prints a safe structured preview without publishing.

BriefQueryService exposes getLatest, getByDate and getRevision. Defaults return valid PUBLISHED content only; explicit internal previews read READY/DRAFT through the same current gates. Output contains the structured document/current highlights, never the private candidate corpus. No homepage/API route is added.

## Validation and sample

```powershell
npx.cmd prisma validate
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```

Deterministic tests execute real migrations in disposable PGlite: results/score validation, highlight retention, canonical news/transfer evolution, source permission/Vietnamese gates, uncertainty, balance/ranking, UTC+7 windows/upcoming, revisions/reversions/concurrency, immutable evidence, publication and malformed-output guards. No live/paid AI is needed.

Real-data sample: [morning-brief-local.json](samples/morning-brief-local.json), 2026-10-18, READY with six sourced upcoming fixtures covering both leagues. Eligible results/published Vietnamese stories/transfers/videos were absent at that cutoff and were not fabricated. It is unpublished; repeated generation reuses the current revision. Deterministic fixtures separately validate richer sections.

Known limits: no exact completion timestamp, sparse real published content, conservative source-gate withholding, bounded initial corpus, three supported timezones and editorial prominence configuration. No AI prose polish or social ingestion. M13 adds orchestration separately; it does not modify these editorial gates or auto-publish.

M14 adds the [Morning Homepage](MORNING_HOMEPAGE.md) separately, reusing this public/current-source boundary in one read-only snapshot. Production remains PUBLISHED-only; an exact development-only preview can inspect READY without publication or source-permission bypass. The engine itself still has no UI/provider calls.
