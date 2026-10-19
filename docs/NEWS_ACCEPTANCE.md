# Real-news and Vietnamese-first acceptance

Status: **Code validation PASS; real-news publication acceptance BLOCKED by source permissions/content, not a frontend defect.** Milestone 17 is not started.

Database snapshot: 2026-10-19T01:44:42.110Z (UTC); Monday, 19 October 2026 at 08:44:42 GMT+7 in Vietnam.

## Persisted stages

| Stage | Before | After |
| --- | ---: | ---: |
| sources | 5 | 18 |
| enabled | 1 | 1 |
| permissionAllowed | 1 | 1 |
| articles | 1 | 1 |
| collected24h | 0 | 0 |
| processedValidated | 1 | 1 |
| ready | 0 | 0 |
| withTitleVi | 0 | 0 |
| withSummaryVi | 0 | 0 |
| publishable | 0 | 0 |
| rejected | 0 | 0 |
| hiddenOrRejected | 0 | 0 |
| reviewRequired | 1 | 1 |
| clusters | 1 | 1 |
| publishableClusters | 0 | 0 |
| visibleClusters | 0 | 0 |

processedValidated counts valid structured processing, including fallback output with no translation. It is not READY/publication success. Rejected counts hidden articles with an ARTICLE_REJECT audit; hide-only records are separate.

## Actual counts by source

| Source | Enabled | Permission | Articles | 24h | Valid processing | titleVi | summaryVi | Publishable | Rejected | Review | Clusters | Publishable clusters | Visible |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Bóng đá 24h | no | RESTRICTED | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Tạp chí Bóng Đá | no | RESTRICTED | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Báo Dân trí | no | RESTRICTED | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Wikinews (English) | yes | ALLOWED | 1 | 0 | 1 | 0 | 0 | 0 | 0 | 1 | 1 | 0 | 0 |
| Lao Động Sport | no | UNREVIEWED | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| PLO Sport | no | UNREVIEWED | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Báo Thanh Niên | no | RESTRICTED | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Thể Thao 247 | no | RESTRICTED | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Tuổi Trẻ Sport | no | RESTRICTED | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| VietNamNet Sport | no | RESTRICTED | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| VnExpress Sport | no | RESTRICTED | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| VOV Sport | no | RESTRICTED | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| VTC News Sport | no | RESTRICTED | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| VTV Sport | no | RESTRICTED | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| FC Barcelona | no | UNREVIEWED | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| LALIGA | no | UNREVIEWED | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Liverpool FC | no | UNREVIEWED | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Premier League | no | UNREVIEWED | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

## Root cause and Wikinews

The only persisted article is **Man starts car collision at Liverpool FC trophy parade**, published 2025-06-01T00:00:00.000Z, collected 2026-10-16T09:55:40.564Z. It is an English, licensed Liverpool-related off-field story; there are no persisted La Liga entity associations. No Vietnamese processing passed. The fallback recorded TRANSLATION_REQUIRED and null titleVi/summaryVi. Current blockers: REVIEWED_EVIDENCE_REQUIRED, SOURCE_TIER_REQUIRES_REVIEW, VIETNAMESE_REQUIRED. Article state is DRAFT/NEEDS_REVIEW. Its existing cluster has NO_ELIGIBLE_CANONICAL_ARTICLE. Public reads independently require PUBLISHED/READY. Age explains poor morning relevance, but age alone is not the public news publication gate.

The live five-result Wikinews metadata query returned historical/off-topic pages with no revision in the current 24 hours. Its revision timestamps are not asserted publication times. No fresh coverage was manufactured. See [coverage](samples/wikinews-coverage-live.json).

## Vietnamese production policy and live run

Vietnamese RSS is the primary planned production news path. 11 terms reviews completed, 0 enabled grants, 13 blocked candidates. Eleven sources are RESTRICTED and two UNREVIEWED. No source was enabled just because RSS exists; no commercial reuse grant or official claim authority was invented. See the full [permission matrix and primary references](VIETNAMESE_NEWS.md). The bounded acceptance command ran once after validation. Every candidate was skipped before provider construction; **no publisher feed HTTP request was permitted**. Zero observed records does not mean publishers had no current stories.

| Acceptance count | Actual |
| --- | ---: |
| found | 0 |
| stored | 0 |
| duplicates | 0 |
| rejected | 0 |
| recentVietnameseArticles | 0 |
| processed | 0 |
| reviewRequired | 0 |
| clustersAssessed | 0 |
| clustersCreatedOrRevised | 0 |
| publishable | 0 |
| visible | 0 |
| epl | 0 |
| laLiga | 0 |
| transfer | 0 |
| offField | 0 |

Exact visible story titles/source classifications: **none**. All established publisher registry entries are media baselines, not OFFICIAL. Thethao247 remains COMMUNITY pending editorial-feed review because its current service is a social network. A reviewed source can still report RUMOR/INTEREST. Actual official source links may be retained from permitted feeds as unverified references; they confer no authority until reviewed.

## Optional GDELT

GDELT adapter, metadata validation, publisher identity separation, provenance storage, URL deduplication and bounded orchestration are implemented. The sandbox attempt failed with NETWORK (a connectivity probe reported EACCES). One approved-access metadata probe returned two real Thai publisher links; these were not ingested and are not counted as pipeline records. The subsequent bounded two-query pipeline finished FAILED: premier-league=NETWORK, la-liga=RATE_LIMITED. Stored/processed/clustered/visible discovery records: 0. No further retry was made after rate limiting. This is not evidence of zero GDELT news coverage.

## Validation and routes

- Prisma format/validate/generate: PASS. Both additive migrations applied; existing data preserved, no reset.
- npm.cmd run lint: PASS (zero warnings).
- npm.cmd run typecheck: PASS.
- npm.cmd test: PASS — **649 tests, 37 files**.
- npm.cmd run build: PASS.
- npm.cmd run news:accept-vietnamese: completed; live publication acceptance blocked as documented.
- npm.cmd run news:diagnose -- --output docs/samples/news-diagnostic-after.json: PASS, actual current-data gate evaluation.
- Browser /news: HTTP 200, correct Vietnamese empty state after reload; no rendering error. Desktop document width/scrollWidth both 1265px (1280px viewport with scrollbar).
- Real private cluster /news/tin-2b8ee617-52b3-4257-b839-7033a81cbba1: streamed HTTP 200 with safe not-found/noindex content; not a successful published-detail acceptance.
- Positive granted-feed publication/detail and subsequent revocation passed deterministic PGlite/AdminService tests only. Test fixtures never entered the visible local database.
- Public /news design was not changed. No scheduler timing, auto-publication or preview bypass was introduced.

## Files created

- `providers/gdelt/provider.ts`
- `providers/news/vietnamese-sources.ts`
- `providers/news/vietnamese-provider.ts`
- `lib/publisher-feed-permission.ts`
- `services/news-discovery.ts`
- `scripts/diagnose-news.ts`
- `scripts/discover-news.ts`
- `scripts/check-wikinews-coverage.ts`
- `scripts/accept-vietnamese-news.ts`
- `tests/news-discovery.test.ts`
- `tests/vietnamese-news.test.ts`
- `prisma/migrations/20261018150000_news_discovery/migration.sql`
- `prisma/migrations/20261019013000_vietnamese_rss/migration.sql`
- `docs/VIETNAMESE_NEWS.md`
- `docs/NEWS_ACCEPTANCE.md`
- `docs/samples/news-diagnostic-before.json`
- `docs/samples/news-diagnostic-after.json`
- `docs/samples/news-discovery-live.json`
- `docs/samples/wikinews-coverage-live.json`
- `docs/samples/vietnamese-news-acceptance.json`
- `docs/samples/vietnamese-news-empty.jpg`
- `docs/samples/news-route-validation.json`

## Files changed

- `PRODUCT_SPEC.md`
- `README.md`
- `.env.example`
- `docs/PROGRESS.md`
- `package.json`
- `prisma/schema.prisma`
- `types/news-provider.ts`
- `types/reliability.ts`
- `lib/news-runtime.ts`
- `lib/admin-policy.ts`
- `providers/news/normalization.ts`
- `providers/news/sources.ts`
- `services/news-store.ts`
- `services/ai-store.ts`
- `services/reliability-service.ts`
- `services/story-canonicalization.ts`
- `services/news-ui-data.ts`
- `services/admin.ts`
- `services/admin-query.ts`
- `components/admin/admin-view.tsx`
- `scripts/sync-news.ts`
- `tests/news-sync.test.ts`

## Remaining work before real-news acceptance

Obtain a compatible publisher feed grant or resolve the conflicting published terms; verify unresolved feed endpoints; enter the exact scope/attribution/commercial permission through the existing audited admin form; ingest, process, review source/evidence and explicitly approve. A configured safe translator or permitted editorial Vietnamese processing is still needed for the old English Wikinews record. Restricted metadata cannot become public through GDELT or Brief preview. Feed-grant version changes intentionally invalidate old snapshots and require explicit re-review; old proof is never silently rebased. No Milestone 17 work has begun.
