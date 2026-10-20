# Milestone progress

## More RSS sources and publisher images (Claude)

Date: 2026-10-19, Asia/Ho_Chi_Minh. Milestone 17 not started.

- Owner list reviewed. Added **Bongda.com.vn** (football-only; English football, Spanish football and transfer feeds) through new multi-feed support. Thethao247's league/transfer feeds return 403 to the bot and are left out; the Feedspot directory is all English sites/fan blogs (not cleared, not reliable media), so nothing from it was added. Per-source cap raised to 120 per run with dropped items counted.
- Owner decision: publisher article images may be used. Additive migration `20261019170000_article_images` (`ArticleFeedSnapshot.imageUrl` with an https CHECK, `NewsSource.imagesAllowed` default false). Images come from the feed item only, are allowlisted to the publisher's own hosts (checked on read and on display), hotlinked, credited, switchable per source (`news:grant -- images`), and vanish on revoke.
- Defect found and fixed while verifying live: re-running `news:grant` to switch images on also moved every source's terms review date, so older stories (whose snapshots carry the old date) were hidden by design. The grant now moves that date only on a real terms change, snapshots refresh when a story is seen again unchanged, and the dates were restored from the stored snapshots with an audit entry. Regression tests added.
- Image sizes: Tuổi Trẻ and Dân trí images are requested in a small size (1.2 MB to 255 KB and 560 KB to 58 KB); VnExpress images are signed and keep the publisher's size.
- Live: Bongda.com.vn 88 relevant items per run (cap raised to 120), 133 story groups, 44 with an image; VnExpress, Dân trí, Tuổi Trẻ, Thanh Niên, VOV and Thể Thao 247 images load from their own hosts; VTV and VTC had no image stored yet at the time of the check.
- Validation: lint PASS, typecheck PASS, tests **745 / 49 files PASS** (16 new).

## Club crests and player photos (Claude)

Date: 2026-10-19, Asia/Ho_Chi_Minh. Milestone 17 not started. Details: [IMAGES.md](IMAGES.md).

- Owner decision: crests and player photos must be shown, no abbreviations. **Crests**: the stored football-data crest link is shown by the reader's browser on standings, fixtures, club/player/match pages, card chips and homepage match cards (letters only when missing or failing; host allowlist; no rehosting). The provider's terms say consent must come from the crest owners; the owner accepted the risk.
- **Photos**: no provider has them, so a Wikimedia Commons pipeline was added (migration `20261019150000_player_images`, additive): Wikidata match only with an identical birth date, free licences only, credit enforced by a CHECK, hotlinked thumbnails, credit on the player page, `/ghi-cong-anh` credits page and a footer link. Players without a free photo show a neutral outline. Live run in progress: first 83 players gave 49 photos (59%).
- Worker now also runs a small time-boxed photo batch per pass.
- Validation: lint PASS, typecheck PASS, tests **729 / 48 files PASS** (15 new), production build pending the final run.

## Admin access and the homepage "Đội của tôi" block (Claude)

Date: 2026-10-19, Asia/Ho_Chi_Minh. Milestone 17 not started.

- Google sign-in configured on the owner machine (local sign-in works only in dev mode over http://localhost:3001; production mode requires HTTPS by design). The owner signed in and followed Man City and the Premier League.
- First administrator assigned with the audited bootstrap command to the owner Google account (ADMIN_BOOTSTRAP audit entry). Guests still get 403 on /admin. The held publisher cards have no admin screen yet: use `npm.cmd run news:cards -- held | approve | hide` until one is built.
- Homepage "Đội của tôi" block for signed-in readers (followed clubs/leagues, three next matches, three newest stories); guests unaffected and free of any session lookup.
- The red "2 Issues" badge in dev is a hydration warning caused by a browser extension adding bis_* attributes; not an application defect.
- Validation: lint PASS, typecheck PASS, tests **714 / 46 files PASS** (2 new).

## Worker installed as a Windows task (Claude)

Date: 2026-10-19, Asia/Ho_Chi_Minh.

- Registered the scheduled task **FotBan News Worker** (starts at logon, restarts on failure, one instance) with `install-news-worker.ps1` at the owner request, and started it; the earlier manually started worker was stopped first because only one may hold the lock. Verified: state Running, log written, new articles stored.
- Fix found while verifying: one failing/BUSY source made the whole loop back off. The loop now backs off only when every attempted source failed, and BUSY is not counted as a failure. After the task started, VOV recovered once the old 5-minute lease expired.

## Player page (Claude)

Date: 2026-10-19, Asia/Ho_Chi_Minh. Milestone 17 not started.

- Added `/player/player-<id>` (the spec's `/player/[slug]`) with provider-only facts (club, league, position line, nationality, age, data-as-of) and tabs Tổng quan, Tin tức, Chuyển nhượng. Pages exist only for players in a current EPL/La Liga squad. Player names now link from squads, card chips and the personal feed.
- Live check: Erling Haaland page 200 with 2 stories, transfer tab empty, bad tab/offset rejected, 27 player links on the Real Madrid squad tab.
- Validation: lint PASS, typecheck PASS, tests **712 / 45 files PASS** (4 new), production build PASS.

## Personal feed (Claude)

Date: 2026-10-19, Asia/Ho_Chi_Minh. Milestone 17 not started.

- `/following` is now the reader's personal feed (it used to redirect to the account page): followed clubs' next/last matches, new stories for followed clubs/players/leagues, followed transfers and fun pieces, with links to the club and league hubs. Guests go to sign-in and back; empty follows get a "pick clubs" state. Private, `noindex`, `no-store`, no new tracking or stored data. Navigation link changed to "Bảng tin của tôi".
- Feed filter `follow` (entities or leagues) added; data helpers `summarizeFollows` and `followFixtures`.
- Tab "Vui" kept as is (owner chose to accept sparse publisher-written lighthearted content; no fan/social ingestion).
- Validation: lint PASS, typecheck PASS, tests **708 / 44 files PASS** (3 new), production build PASS. Production server: guest redirected to `/login?returnTo=/following` with no private content; `/news` unaffected. The signed-in rendering was not exercised against real Google sign-in in this environment.

## Product direction + club hub (Claude)

Date: 2026-10-19, Asia/Ho_Chi_Minh. Milestone 17 not started.

- Owner direction: FotBan as a compact football "social network" without likes/comments: news kept together per club, schedule, table, transfers, news and off-field items, and lighthearted/satirical pieces about clubs and players.
- Added the club hub `/club/club-<id>` (the spec's `/club/[slug]`): header with table position/form/next match/follow plus tabs Tổng quan, Tin tức, Lịch thi đấu, Chuyển nhượng, Cầu thủ, Vui. Club names now link to it from standings, league club grids, card chips and context blocks.
- New story type FUN for publisher-written lighthearted pieces (never fan/social content), shown only in the Vui tab with an entertainment notice. None of the current 51 live cards qualifies, so the tab honestly shows its empty state.
- Live check on Real Madrid: all six tabs 200, 12 news groups, 27-player squad, form W W L W W; an unknown tab is rejected and noindex.
- Validation: lint PASS, typecheck PASS, tests **705 / 43 files PASS** (6 new club tests), production build PASS.

## Vietnamese news step 4 — league hubs and the continuous worker (Claude)

Date: 2026-10-19, Asia/Ho_Chi_Minh. Milestone 17 not started.

- **Continuous worker** (`news:worker`), no fixed schedule: every ~60 s pass asks each source whether it is due (15-minute RSS window, conditional requests, robots crawl-delay, cooldowns, leases); also refreshes results every 30 min and standings every 6 h under the free-tier pacing. Backoff on failure, one instance per database (advisory lock 91531121), clean stop on SIGINT. `scripts/install-news-worker.ps1` registers a start-at-logon task with restart-on-failure (not run automatically). Live check: first pass found a new VnExpress article immediately.
- **League hub** `/league/[slug]` with tabs Tin tức, Tổng quan, Bảng xếp hạng (with last-five form), Lịch thi đấu (7-day windows), Đội bóng (follow), Chuyển nhượng; "Giải đấu" added to the navigation. Own-data tabs are indexable, publisher-text tabs `noindex`; no crests/logos.
- Data: standings synced for both leagues; season matches backfilled in 31-day windows (6 requests) so form shows five results (live: Man City W W W W W, Arsenal W W L W W, matching the reference table). Earlier "latest result" gaps came from the short sync window.
- Validation: lint PASS, typecheck PASS, tests **699 / 42 files PASS** (8 new league tests, 3 worker-loop tests), production build PASS. All six tabs return 200 on the production server; invalid tab/date fall into the invalid-filter state.

## Vietnamese news step 3 — ranking, context, homepage (Claude)

Date: 2026-10-19, Asia/Ho_Chi_Minh. Milestone 17 not started.

- Review fixes from the owner screenshot: importance ranking (coverage, media over community, recency) with roundups last and source diversity, full-width lead story, display-only credit-prefix stripping, question-mark hedge only on headlines. Live order now starts with Real–Sevilla (5 publishers), MU–Leeds, Arsenal–Forest; Thể Thao 247 no longer fills the first row.
- Card detail page adds stored club context (standing, last result, next fixture, data-as-of time and football-data attribution), related stories and follow links. Standings synced live for both leagues (20 rows each) and matches refreshed (stale results from 11/10 were being shown as the latest before the refresh).
- Homepage shows a compact publisher-news block; Morning Brief unchanged (immutable, evidence-gated). `news:tick` added; scheduling needs the Task Scheduler entries in VIETNAMESE_NEWS.md.
- Validation: lint PASS, typecheck PASS, tests **691 / 41 files PASS**, production build PASS.

## Vietnamese news step 2 — attributed publisher cards on /news (Claude)

Date: 2026-10-19, Asia/Ho_Chi_Minh. **Step 2: DONE — Vietnamese publisher news is public on `/news`.** Milestone 17 not started.

- New publication class `FeedCard` (additive migration `20261019120000_feed_cards`, no drift): publisher's exact headline + RSS description with attribution, labels "Báo chí"/"Cộng đồng" and "Đang đưa tin"/"Chưa xác nhận", wording-only transfer stage; `OFFICIAL` and `CONFIRMED` are impossible by CHECK. Evidence-gated verified stories, M7/M8 and Brief evidence rules are unchanged.
- Auto-publish with sensitive-term holds; audited operator approve/hide via `news:cards`; every public read rechecks status, hidden article and the current publisher grant. `news:sync -- vietnamese` publishes cards after ingestion.
- Duplicate grouping and Vietnamese story types. Real data: 51 cards, 0 held, **39 groups**; the 4 merged groups were all correct (Real–Sevilla ×5 publishers, Arsenal–Forest ×4, MU–Leeds ×5, EPL table ×2) while interview/controversy angles stayed separate. Types: 29 match, 6 interview, 4 off-field, 2 manager, 2 discipline, 1 transfer, 1 injury, 6 other.
- UI: `/news` section "Tin từ báo chí Việt Nam" (24 groups/page; league filter), `/news/bao-<uuid>` detail with other coverage, entities, match link and a small footer "Xem bài gốc" (`nofollow`); card pages `noindex` with the original as canonical.
- Production server check: `/news` 200 with 24 + 15 groups across two pages, La Liga filter 15, no empty state; detail of the Dân trí Arsenal report lists 3 other publishers and links the Forest–Arsenal match.
- Validation: lint PASS, typecheck PASS, tests **685 / 41 files PASS** (17 new), production build PASS. Visual browser review at 360px/1280px is still to be done by the owner (no browser automation in this session).

## Vietnamese news step 1 — live RSS ingestion (Claude)

Date: 2026-10-19, Asia/Ho_Chi_Minh. Implementation moved from Codex to Claude; the project is now a git repository (baseline commit `8b6eb12`). **Step 1 (ingestion): DONE. Publication of RSS cards: next step.** Milestone 17 not started.

- Owner decision after legal review: Vietnamese publisher RSS title + description, attributed, link to the original. Recorded per source with the new audited `news:grant` command (reviewer `FotBan`); `revoke` withdraws it. See [VIETNAMESE_NEWS.md](VIETNAMESE_NEWS.md).
- Feeds verified on 2026-10-19: 8 live (VnExpress, Thanh Niên, VTV, Dân trí, Thể Thao 247, Tuổi Trẻ, VTC, VOV). Bóng đá 24h (stale since 2022), Bóng Đá Plus, Lao Động (no RSS), VietNamNet (no response) and PLO (404) stay disabled.
- Fixes found against real feeds: `+07` offsets and timezone-less Tuổi Trẻ dates (with U+202F before AM/PM) were rejected; Thể Thao 247 items carry a second `<link>` (atom self-link) and were all rejected; VOV's 20-second crawl-delay exceeded the old 10-second cap. `RSS_SUMMARY` with `maxExcerptChars=0` silently stored no summary and is now refused. Excerpts cut at sentence/word boundaries. RSS refresh 30 minutes instead of 6 hours. Livestream/betting pieces excluded. Per-source examined/relevant/stale/overLimit counters in job checkpoints.
- Entity matching: Vietnamese club aliases/nicknames keyed by football-data ID; upper-case codes case-sensitive ("san bằng" is no longer Racing Santander, "che" no longer Chelsea); Latin accent folding; short alias inside another club's name ignored ("Real" in "Real Betis"); surname next to a different capitalised name ignored ("Roy Keane", "David Beckham").
- Squads: football-data teams sync now stores players, PLAYER identities and observed PlayerClub memberships. Live: **1,066 players** (EPL 545, La Liga 521), 992 with a surname alias.
- Real run: `news:sync -- vietnamese` stored **51 articles** (VnExpress 11, Thanh Niên 2, Dân trí 4, Thể Thao 247 20, Tuổi Trẻ 3, VTC 4, VOV 7, VTV 0), 0 rejected, 0 conflicts, all with feed snapshots and decoded Vietnamese text, all `PENDING`. Nothing is public yet; `/news` is unchanged.
- No schema migration. New: `services/news-grant.ts`, `providers/news/vietnamese-aliases.ts`, `scripts/grant-news-source.ts`, `scripts/preview-vietnamese-news.ts`, `tests/vietnamese-ingestion.test.ts`, `tests/player-squads.test.ts`.
- Validation: lint PASS, typecheck PASS, tests **668 / 39 files PASS** (19 new), production build PASS.

## Vietnamese-first news pipeline and real-news acceptance

Date: 2026-10-19, Asia/Ho_Chi_Minh. **CODE VALIDATION: PASS. REAL-NEWS PUBLICATION ACCEPTANCE: BLOCKED by source rights/content.** Milestones 1–16 remain recorded GO; **Milestone 17 has not started**. This is a focused data acceptance/policy update, not a new milestone or publication-policy change.

- Vietnamese publisher RSS is the primary planned production news path. All 13 requested candidates are registered with source priority, separate reliability/permission metadata, reviewed terms references and per-source attribution. Eleven reviews completed: RESTRICTED pending compatible production grants/clarification. PLO and Lao Động remain UNREVIEWED. All 13 remain disabled; commercial reuse is false. No written permission was supplied or invented.
- VietnameseRssNewsProvider uses existing robots-aware HTTP, normalization, canonical entity matching, 24-hour relevance filtering and JobRun/cache/lease persistence. It ignores full bodies/images, retains only permitted feed fields/categories and actual unverified source references, and invokes existing processing/reliability/clustering services. Already-Vietnamese text is preserved extractively. Scoped publisher terms are distinct from CC licences and revalidated against exact ArticleFeedSnapshot evidence on processing/public reads. Existing official adapters remain available; media reporting never becomes official without authoritative evidence.
- GDELT remains optional metadata-only discovery. ArticleDiscovery records provenance separately from publisher permission; no article bodies or photos are fetched. Bounded live workflow returned NETWORK and RATE_LIMITED; zero records stored. No live success is claimed or retry loop used.
- Additive migrations `20261018150000_news_discovery` and `20261019013000_vietnamese_rss` applied safely. No reset, fake stories, source permission bypass, production scheduler change or automatic publication.
- **Validation:** Prisma format/validate/generate PASS; lint PASS; typecheck PASS; **649 tests / 37 files PASS**; production build PASS. Tests include positive granted-feed processing → reviewed admin publication → public list/detail, rumor preservation and immediate withdrawal on permission revocation, plus blocked activation and discovery idempotency/security.
- **Actual real Vietnamese pass at 08:44 Vietnam time:** 13 source candidates skipped before HTTP because none has a compatible enabled grant. Found/stored/processed/EPL/La Liga/transfers/off-field/new clusters/publishable/visible: all **0**. This does not assert that blocked publishers have no current coverage.
- **Current database:** 18 NewsSources; 1 enabled and permission-allowed (Wikinews). Articles 1; collected24h 0; valid fallback processing 1; READY/titleVi/summaryVi/publishable/rejected 0; review-required 1; clusters 1; publishable/visible clusters 0. The only article is the English Liverpool trophy-parade story published 2025-06-01. It fails VIETNAMESE_REQUIRED, REVIEWED_EVIDENCE_REQUIRED and SOURCE_TIER_REQUIRES_REVIEW, remains DRAFT/NEEDS_REVIEW, and its cluster has no eligible canonical article. The five-result live Wikinews coverage query produced historical/off-topic pages, not a current football feed.
- **Browser:** `/news` correctly renders the unchanged Vietnamese empty state; document width equals scroll width. The real private cluster detail renders safe not-found/noindex. A live published detail remains unverified because there is no permitted published Vietnamese story. No fixture was inserted to conceal this gap.

See [full acceptance report and per-source stage counts](NEWS_ACCEPTANCE.md), [publisher permission matrix/runbook](VIETNAMESE_NEWS.md), [actual Vietnamese run](samples/vietnamese-news-acceptance.json), [database evidence](samples/news-diagnostic-after.json), [HTTP route checks](samples/news-route-validation.json) and [screenshot](samples/vietnamese-news-empty.jpg). `/news` returned HTTP 200; the real private detail streamed HTTP 200 with not-found/noindex content, as expected for this Next.js boundary. Next action is publisher permission/feed clarification plus grounded editorial publication, **not Milestone 17**.

## Temporary pre-M17 frontend + real-data acceptance

Date: 2026-10-18 (Asia/Ho_Chi_Minh). **Code/route/responsive validation: PASS. Real-content coverage: PARTIAL.** Milestone 16 remains GO. **Milestone 17 is not started.** This is a separate on-demand acceptance pass, not a production scheduling/publication change.

### Implementation and validation

- Added local-only `npm.cmd run scheduler:morning -- now` (and optional --dry-run) using the same ScheduledJobRunner, global database lock, eight existing handlers, provider services and MorningBriefService. It captures the current Vietnam-date/UTC cutoff and has a separate manual-morning-v1 job key. It refuses production NODE_ENV/non-loopback PostgreSQL and does not introduce an HTTP mutation endpoint.
- Normal refresh remains 07:30, generation 08:00 Asia/Ho_Chi_Minh. Current-time mode is never selected by tick. M12 receives the captured asOf and retains its 24-hour lookback/upcoming horizon, UTC storage, input hashing and immutable revision behavior. Same exact cutoff/input state reuses a revision; a later cutoff changes the input window. No fixtures, permission changes or automatic publication.
- Existing development-only /?preview=1 is reused. Production still ignores preview and shows only PUBLISHED content. The current local server is http://localhost:3001; the attempted port 3000 bind was denied, and a second dev start discovered the existing server, which was reused rather than stopped.
- Manual mode explicitly records skipped unconfigured optional sources as degradation/PARTIAL while continuing generation. Normal scheduler status behavior is unchanged. No schema/migration/dependency/environment changes.
- Changed: types/scheduler.ts, lib/scheduler-policy.ts, scripts/run-scheduler.ts, services/scheduler.ts, tests/scheduler.test.ts, README.md, docs/SCHEDULER.md and this progress record. Added safe JSON/visual evidence under docs/samples/live-*.
- lint PASS; typecheck PASS; tests **611 / 35 files PASS** (five new policy/orchestration/window/idempotency tests); production build PASS. Existing development-only/production-hidden preview tests remain passing.

### One bounded real-provider workflow

- Workflow f66ceeae-5866-48f0-8f45-fc82a53350f2 ran once, 21:27:56–21:28:37 Vietnam time, with cutoff **2026-10-18 21:27:56.504 Asia/Ho_Chi_Minh** (14:27:56.504Z). Primary window: previous day 21:27:56 through cutoff; upcoming horizon ends next day 21:27:56. Provider retries/caches were bounded by existing adapters; no live rerun loop was performed.
- Real football-data.org PL and La Liga refresh attempts returned NETWORK in this execution. Permitted Wikinews refresh returned NETWORK. YouTube was NOT_CONFIGURED (no API call). No new external records were synced; provider/error/JobRun metadata recorded the degradations. No API key values were printed, exposed to browser code or changed.
- Processing, reliability, clustering and transfer handlers ran safely with zero recent eligible items; the existing English article is DRAFT/NEEDS_REVIEW. No processing/review/permission gate was relaxed to fill the frontend.
- Existing real persisted data: **79 mapped FOOTBALL_DATA matches**, Premier League 39 and La Liga 40; 29 FINISHED and four LIVE snapshots. Last successful stored data update was 20:32 Vietnam time, not the failed refresh time. No persisted transfer/video records and no published Vietnamese article.
- MorningBriefService appended **revision 5, READY**, id fe1f3dda-1b51-4865-a932-5e869b62abea, generated 21:28:37.237 Vietnam. Includes three summary points, three result cards and three upcoming fixtures. Empty news/transfer/off-field/community sections are omitted. publishedAt remains null; previous revisions remain intact. Workflow status is PARTIAL with MATCH_SYNC, NEWS_SYNC and VIDEO_SYNC degradation.

### Frontend and real-data evidence

- /, /?preview=1, /matches, /news and /transfers all returned HTTP 200. Root without preview displays the correct unpublished-Brief empty state. Preview shows 18/10/2026, update 21:28, real results/upcoming, preview label and optional-source degradation notice.
- Match filtering was exercised through the UI: Premier League 33 cards and La Liga 34 within the chosen date range. Default list is paginated (50 cards on the first page). Both internal match APIs returned persisted data. Team visuals are clean text/TLA fallbacks, no mandatory crest download.
- Two real detail routes returned HTTP 200: /match/match-08199ec2-50cb-4d71-a840-4920c5137b47 and /match/match-94ebaaf3-c574-4ecb-92ca-3cf1b1e94a7b. La Liga detail was visually checked at all five widths. DB/DOM agreement: Real Betis 2–5 Barcelona and Newcastle 0–1 Aston Villa, stored kickoff 16:30Z → displayed 23:30 Vietnam. Missing venue/highlight are honest empty states. Data timestamps remain visible.
- News shows “Chưa có tin được xuất bản”; transfers shows “Chưa có chuyển nhượng phù hợp”. No raw English content, restricted source, fabricated rumor, translated headline, invented fee or community reaction was inserted. News/transfer detail pages, live reliability badges, source clustering and long published Vietnamese headlines cannot be fully real-data accepted until permitted Vietnamese stories are reviewed/published. Deterministic tests are not presented as live-content evidence.
- No stored verified highlight exists; clean verified-source fallback is shown in homepage and detail. A present-video CTA/channel cannot be live accepted without a configured key or eligible stored video. The public match attribution destination loaded successfully; external link attributes are safe. News-source links cannot be live accepted while no story is public.
- **20 fully loaded route/width combinations** (/preview, /matches, /news, /transfers × 360/390/430/768/1280) have scrollWidth equal to clientWidth and no overflowing main elements. Real match detail also passed all five widths. Screenshots confirm readable wrapped team names, clear score hierarchy, compact filters/navigation and useful morning-summary facts in the first mobile viewport. No browser console error/warning was observed. Temporary viewport override was reset; preview tab retained for review.
- Existing M12 completion-time limitation remains: FINISHED status plus kickoff inside the 24-hour window is used because no reliable finishedAt exists. This is not an exact finish-time audit. No unrelated Brief ranking or UI redesign was made.

Evidence: [database/workflow/route report](samples/live-acceptance.json), [responsive measurements](samples/live-layout-validation.json), [mobile homepage](samples/live-home-360.jpg), [desktop homepage](samples/live-home-1280.jpg), [match detail](samples/live-match-detail-360.jpg). Exact review URL: **http://localhost:3001/?preview=1**. The existing server was left running. The remaining acceptance gaps are external connectivity/configuration and eligible published Vietnamese content, not hidden fixture substitutions. No automatic second live run or Milestone 17 work.

## Current decision — Milestone 16: GO

Updated: 2026-10-18 (Asia/Ho_Chi_Minh). **Milestone 16: GO — code validation, 606 deterministic tests / 35 files, production build and isolated PostgreSQL/production admin-route validation pass.** Public Core Product v1 and M15 authentication/following remain available without a public login gate. No production source permissions, original publications or user roles were changed for runtime tests. **Milestone 17 is not started.**

### Admin architecture and authorization

- Added server-rendered Vietnamese operational pages at /admin, /admin/sources, /admin/videos, /admin/stories, /admin/transfers, /admin/briefs and /admin/jobs. Paginated internal APIs are under /api/admin/*; mutations use same-origin POST /api/admin/action with bounded strict Zod validation, explicit reason and confirmation. Lists fetch 20 rows plus one lookahead, with stable pagination, search and section-specific filters.
- Reused M15 Better Auth signed database sessions and existing UserRole. Only current database ADMIN is accepted; USER and legacy EDITOR do not gain access. Next.js Proxy matches admin paths only and returns safe real HTTP 403. Every read/mutation also independently checks the server session/current role; committing mutations lock/recheck the actor. Private HTML/APIs are noindex/private/no-store. Existing public pages remain dynamic and do not load sessions because of admin integration.
- Added an explicit operator-only first-admin bootstrap command for an existing User UUID. No email/domain inference, fake production administrator, default secret, new auth provider or development-login endpoint. Bootstrap is locked, audited and refused once an ADMIN exists. No full user-management UI is added.

### Operational workflows and safeguards

- Source forms manage identity, language/country, reliability/tier/official/scope notes, enabled/ingestion flags and reviewed permission metadata. Existing UNREVIEWED / ALLOWED / RESTRICTED states are reused; prohibited or permission-required sources stay RESTRICTED/disabled. Invalid enabling requires correction, and reliability never replaces permission. Source reviewer/date are recorded; canonical authority scopes are validated.
- Video whitelist forms manage reviewed channel identities, verification, source type/priority and notes. Season/date/competition/market rights mappings are editable and can be added without hard-coded permanent entitlements. Expired windows and stale/future verification cannot enable a source. A stable registry identity prevents handle edits from reintroducing defaults; edited rights windows are not recreated by sync. News registry respects existing slug identity after domain edits. All content remains metadata/links only.
- Story review exposes current permission/reliability/certainty, canonical entities, source spans, processing history and audit reasons. Vietnamese edits create a new validated EDITORIAL processing revision and new evidence without changing original/generated history. Fresh evidence review is required after editing. Publication needs an immutable approval audit linked to the exact latest run/text/classification; later edit/review/rejection clears approval. Existing permission, grounding, uncertainty and conflict gates remain authoritative.
- Feature/dispute controls and reversible merge/split/unmerge reuse existing canonicalization and audited membership services. Published membership cannot be silently changed. Transfer review reuses canonical identities, evidence timelines, fee/contract snapshots and TransferTrackingService; arbitrary CONFIRMED upgrades are refused without authoritative exact-pair proof. Extraction corrections go through reviewed article revisions.
- Protected READY Brief previews reuse BriefQueryService and current-fact/permission validation. Explicit publication calls MorningBriefService and atomically records publishedAt/publishedById plus audit. Generation/rerun never publishes. Published revisions remain immutable; no unpublish/delete capability is exposed. Hiding a story revokes public news and previously published Brief eligibility; corrections require a new validated/published revision, retaining old history.
- Jobs show logical date, type, status, start/end, attempts, processed count and controlled error category. Checkpoints, raw errors, provider payloads and secret configuration are not returned. Stored-only manual morning rerun calls the existing ScheduledJobRunner, deterministic AI fallback and dedicated PostgreSQL lock. Long operations have durable request/result/failure audits and run outside short audit transactions. Longer production jobs should use the existing CLI/worker path.
- All sensitive mutations retain actor/action/entity/reason/timestamp and bounded before/after summaries in append-only AdminAuditLog. No UI deletes evidence, sources, revisions, jobs or users. Native accessible forms, keyboard focus, semantic headings/navigation and Vietnamese loading/empty/error states are included. No new external search, paid dependency or external render-time provider call.

### Database, environment and files

- Applied three additive migrations: 20261018090000_admin_publication (exact Article approval-audit FK and Brief publisher FK/index), 20261018091000_admin_publication_guard (publisher attribution only at READY → PUBLISHED, preserving existing immutable snapshot protections), and 20261018092000_admin_registry_identity (nullable unique VideoSource registry identity, backfilled only for existing initial handles). **16 migrations applied; no schema drift or reset.** Existing content/roles/permissions/publications are preserved.
- No new environment variables. Reuses DATABASE_URL, AUTH_SECRET, AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET and exact NEXT_PUBLIC_APP_URL; production auth requires HTTPS. .env was not modified. .env.example contains optional placeholders and admin setup comments. Generated browser JavaScript contains zero references to secret configuration names checked for DB/auth/match/video/AI.
- **28 created / 12 changed files**, fully listed in [admin runbook](ADMIN.md#file-inventory). Created admin routes/components/policy/runtime/services, Proxy, bootstrap/smoke scripts, three migrations, two test files, runbook and [runtime evidence](samples/admin-validation.json). Changed schema, existing reliability/clustering/transfer/Brief integration hooks, news/video registry initialization, YouTube source identity configuration, package scripts, README/environment example and this progress record. No new dependencies. This checkout has no .git metadata, so commit/history inspection is unavailable and no commit is claimed.

### CODE VALIDATION

| Check | Result |
| --- | --- |
| Prisma format / validate / generate | PASS. |
| npm.cmd run db:migrate:deploy | PASS; three additive migrations applied. |
| Prisma migrate status / diff | PASS; 16 migrations current; no difference detected. |
| npm.cmd run lint | PASS; zero warnings. |
| npm.cmd run typecheck | PASS. |
| npm.cmd test | PASS; **606 tests / 35 files**, including **32 new admin tests**. |
| npm.cmd run build | PASS; production Next 16.4.2 build includes admin routes and scoped Proxy. |
| Browser configuration scan | PASS; no DB/auth/match/video/AI secret variable names in generated client JS. |

New deterministic tests cover anonymous/USER rejection, ADMIN reads, role revocation, CSRF/ownership injection, invalid input, permissions, reliability persistence, optimistic concurrency, video/rights edits, expired windows, registry preservation, immutable approval/rejection audits, manual edit/evidence history, hallucination guards, rumor protection, authoritative confirmation, Brief publication attribution, public hide propagation, reversible merge/unmerge, pagination, secret DTO isolation, bootstrap and scheduler delegation/concurrency. Existing 574 tests remain passing.

### ISOLATED LOCAL RUNTIME VALIDATION

npm.cmd run admin:smoke: **PASS**, using production Next plus disposable PostgreSQL and real signed Better Auth test sessions issued only in the test process. No real Google/provider request or production credentials were required.

- All seven admin routes and the rights-mapping view: HTTP 200 for ADMIN, safe HTTP 403 for anonymous/USER. Foreign-origin mutation rejected; role revocation invalidated the existing session's admin access.
- Source list/edit and invalid enable guard; video source edit and rights mapping creation; story review and original processing version retained after manual Vietnamese editing. Approval failed before fresh proof review, then succeeded with immutable exact approval audit.
- Transfer timeline/review loaded; rumor → CONFIRMED attempt rejected; legitimate rumor-state review persisted.
- READY Brief preview remained private; explicit publication persisted the publishing admin and appeared on the public homepage. Story rejection then withdrew invalid news and frozen Brief content from public reads.
- Manual stored-data workflow used existing services and produced a READY revision. A separately held real PostgreSQL scheduler lock caused a safe WORKFLOW_RUNNING skip. JobRuns and request/result audits persisted; safe job DTOs omitted raw checkpoints.
- Anonymous /, /matches, /news and /transfers remained HTTP 200. Disposable server/database removed. Original match/news/cluster/transfer/video/Brief/job/user/follow/audit counts and source-permission fingerprint were identical before/after.

Runtime evidence is HTTP/service validation with signed sessions and deterministic component rendering; real interactive Google consent and a visual browser walkthrough are not claimed. No default admin was added to the original database. Operator setup: configure existing auth if needed, sign in, and run the documented explicit bootstrap for the intended existing User UUID. Deployment execution limits may require CLI/worker execution for long reruns. No unpublish, full role-management UI, PWA, notifications or Fan Pulse is included. Recommended next milestone: **Milestone 17 — PWA**, only after a separate user request.

## Current decision — Milestone 15: GO

Updated: 2026-10-18 (Asia/Ho_Chi_Minh). **Milestone 15: GO — authentication/following code validation, 574 deterministic tests / 33 files, production build and isolated PostgreSQL/production-route session validation pass.** Public Core Product v1 remains open to anonymous readers. Real Google consent was not attempted and requires the operator's own OAuth client; no real OAuth credentials were used or disclosed, and no credentials were added to source. **Milestone 16 is not started.**

### Authentication and session security

- Added pinned **Better Auth 1.7.10** with its Prisma adapter and Google OAuth/OpenID Connect authorization-code flow. Server-only lazy configuration builds without credentials and disables sign-in clearly when secret/Google/database config is missing. Production authentication requires the configured HTTPS public origin. No default secret, password cryptography, fake production user, dev-login endpoint or mandatory paid authentication service.
- Central auth options and session resolver keep account/following services independent of Google payloads. OAuth uses PKCE, persisted one-use state, state cookies and verified Google email. Google subjects are unique external account identifiers; generated UUIDs remain internal User IDs. Email matching never silently links accounts or upgrades existing roles.
- Database sessions are revocable, expire after seven days and renew through the library after one day. Cookie cache is disabled; each protected access checks signed cookie and stored expiry. Cookies are httpOnly, SameSite=Lax, host-scoped and Secure in production/HTTPS. Normal logout deletes the session, expires the cookie and returns to the public homepage. Expiry/replay tests pass.
- Explicit library CSRF/origin checks also run in tests. Application mutations require exact configured Origin, reject cross-site requests and strictly validate bounded JSON streams. Ownership/role/user IDs cannot be injected. OAuth return destinations are safe local pages; selected canonical follow targets survive login. Errors are generic Vietnamese, and logs use controlled categories/redact auth credentials.
- Provider access/refresh/ID tokens and passwords are discarded before persistence, with a database CHECK preventing accidental storage. Avatar URLs, session IP and session user-agent are discarded. Database abuse counters may retain a trusted IP/path separately from user profiles; `auth:cleanup` removes expired sessions/state and counters inactive over 24 hours. No analytics/ad profiling or notification opt-in is added.

### Following, preferences and UI

- Reused **UserPreference / UserFollow**, existing exactly-one-target CHECK, canonical foreign keys and unique per-user target constraints. FollowingService uses conflict-safe inserts and ownership-scoped deletes; repeated follow/unfollow is idempotent. Alias search returns canonical Club/Player IDs without creating entities. Competition follows allow Premier League and La Liga.
- UserPreferenceService stores vi-VN and supported timezone preferences server-side, updating existing User/preference fields consistently. Follows/preferences survive logout/login and cannot be read/changed by another user. The latest explicit user scope limits personalization to readiness: global Briefs, public ranking, reliability, stored UTC timestamps and competition visibility are unchanged.
- Added Vietnamese `/login`, protected `/account`, `/following` alias and private `/api/account`, `/api/following`, `/api/preferences`. The account shows identity, followed clubs/players/competitions, bounded alias-aware entity search, timezone/language and logout. Account/sign-in have dedicated loading and unavailable states. Private routes are noindex; private API DTOs have `private, no-store` and `Vary: Cookie`, and expose no session token.
- Match detail exposes canonical club/competition follow links. Permitted news detail exposes canonical club/player/competition links where available; its internal DTO now retains public canonical entity IDs. Public links open the private account area to resolve actual follow state. Public shell adds a static account link and never loads sessions/follows. No global auth middleware or client SessionProvider changes public query/cache behavior.
- Buttons expose Vietnamese labels, `aria-pressed`, status announcements, visible focus and minimum touch targets. Browser checks confirmed anonymous account redirect, selected Real Madrid canonical ID preserved through the login return URL, public homepage/match navigation, configuration-unavailable sign-in state and noindex. Sign-in at **360/768/1280px** had exact matching client/scroll widths and no horizontal overflow. Real interactive Google consent/authenticated browser UI is not claimed by fixture session tests.

### Schema, configuration and files

- Applied additive migration **20261018070000_authentication_following**. Added User displayName/emailVerified/avatarUrl/lastLoginAt, safe new-user defaults and AuthSession/AuthAccount/AuthVerification/AuthRateLimit with identity/session/expiry indexes. Existing follow constraints, identities, roles, content, Brief revisions and scheduler records are preserved. **13 migrations applied, no schema drift, no reset.**
- Added optional server-side `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` placeholders to `.env.example`. Existing `DATABASE_URL` and exact `NEXT_PUBLIC_APP_URL` apply. `.env` was unchanged; local secret files and the workspace npm cache are ignored. No secret variable names were found in generated browser bundles. This checkout has no `.git` metadata, so commit/diff/history verification is unavailable; no commit is claimed.
- Added `auth:smoke` and `auth:cleanup`. The [authentication/following runbook](AUTHENTICATION_FOLLOWING.md) documents Google localhost/HTTPS deployment, privacy, cookie/session behavior, follow services, public/private boundaries and the complete inventory of **29 created / 16 changed files**. README/environment examples are updated. No M16 implementation is included.

### CODE VALIDATION

| Check | Result |
| --- | --- |
| Prisma format / validate / generate | PASS. |
| `npm.cmd run db:migrate:deploy`, Prisma migrate status | PASS; all 13 migrations applied without reset. |
| Prisma migrate diff | PASS; no difference. |
| `npm.cmd run lint` | PASS; zero warnings. |
| `npm.cmd run typecheck` | PASS. |
| `npm.cmd test` | PASS; **574 tests / 33 files**, including **40 new auth/following/UI tests**. |
| `npm.cmd run build` | PASS; builds without production OAuth credentials. |
| `npm.cmd audit --omit=dev` | PASS; zero production advisories. Full audit retains the five previously documented development-tool advisories; no forced framework downgrade. |

Deterministic tests cover signed/forged/expired sessions, logout/replay, first OAuth callback/repeated subject reuse with a fake remote boundary, PKCE/state rejection, missing configuration, safe redirects/CSRF, streamed payload limits, all follow types, uniqueness, canonical aliases, invalid targets, cross-user ownership, preference persistence, token/avatar discard, cleanup retention and Vietnamese accessible markup. Existing anonymous homepage/public route tests continue passing. No paid/live OAuth dependency is required.

### LOCAL RUNTIME VALIDATION

`npm.cmd run auth:smoke`: **PASS** against an owned disposable PostgreSQL database and the actual Next production server. Test-only library helpers are separate from application configuration; no production bypass/fixture user is shipped. A logical HTTPS origin over local HTTP models a TLS-terminating proxy; production certificate/proxy operation is not claimed.

- Real migrations and Prisma adapter: first-user OAuth callback, repeat subject mapping, null provider tokens and lastLoginAt verified with only remote token/profile methods stubbed.
- Actual production routes: anonymous `/`, `/matches`, `/news`, `/transfers` HTTP 200; protected account redirects, private API HTTP 401. Authenticated account HTML, noindex/private cache, club/player/competition follow/unfollow, duplicate uniqueness, preferences, injected ownership/cross-origin rejection and private token-free DTO pass.
- Google authorization URL/PKCE and database state persist without contacting Google. Logout removes session/clears cookie; replay and expiry fail safely; re-login retains follows/preferences.
- Child server and temporary database removed. Original Match/Article/Cluster/Transfer/Video/Brief/Revision/JobRun/User/UserFollow counts unchanged. No draft was published, no Docker command or external content-provider request was made. Evidence: [runtime validation](samples/authentication-validation.json).

### Remaining configuration and next milestone

Real Google consent needs your own Google web client, test users/consent configuration, exact localhost callback, random stable AUTH_SECRET and production HTTPS origin/callback. Public content works while auth remains unconfigured. Production proxy/IP trust, secret rotation, auth-retention invocation and broader deployment/accessibility review remain operational duties. Magic links, full preferences/recommendations, account deletion UI, per-user Briefs, admin, PWA/push and social ingestion are outside M15.

**Next recommended: Milestone 16 — Admin, only after an explicit request. Stop after Milestone 15.**

## Milestone 14 — Morning Homepage (previous GO)

Updated: 2026-10-18 (Asia/Ho_Chi_Minh). **Milestone 14: GO — Morning Homepage code validation, 534 deterministic tests / 30 files, production build, real READY preview and isolated published production journey validation pass.** Production remains PUBLISHED-only; the original local database's three READY revisions were not published. **Milestone 15 is not started.** No external provider/API call, new dependency, schema migration, authentication, social ingestion or production data fixture was added.

### Homepage architecture and content

- Replaced the setup screen at `/` with the Vietnamese morning experience. `MorningHomepageService` composes the latest eligible Morning Brief inside one repeatable-read **read-only transaction**, reusing the BriefQueryService current-fact/rights gate and M11 verified-video read. Only selected items are enriched through existing checked canonical news/transfer services; UI components contain no Prisma/provider calls and no separate news ranking engine.
- Extracted shared `readLatestBrief` without changing the public default of BriefQueryService.getLatest. PUBLISHED publication time and generation time must not be in the future. Selection examines at most ten recent candidates and withholds stale/revoked/invalid snapshots. Current-source checks still apply to old history and previews. Internal enrichment and brief selection share one database snapshot.
- Morning header shows actual Vietnamese target date/update time and initial competition scope. Summary copies M12's existing points into card-anchor links; first three show immediately, up to six remain accessible through a native expansion. Sparse days show fewer without inventing content. No full card is repeated in the summary.
- Results retain exact teams, final score, kickoff, finished status and match-detail links. Existing prominence metadata or a sourced total of at least five goals controls visual emphasis; no invented title/rivalry interpretation. A single result uses the full main column. Penalties appear only when present. Unavailable scores never become 0–0.
- Selected verified highlight links show channel, type and publication time; result cards have the exact clean no-highlight fallback when missing. A compact highlight section lists viewing links without repeating complete narratives. No embed/download/rehost, external image or assumed Vietnam playback. Structured-data attribution comes from persisted citation metadata, including the required Football-Data.org credit.
- Canonical top stories, club/player spotlight, transfers, off-field/culture and upcoming fixtures use brief section membership/order and existing internal entities. A transfer cluster does not reappear as unrelated club news. M10 player/current/target club, status and explicitly sourced fee fields are reused. Confirmed/reported fees remain distinct, source currency is retained and missing fees are omitted. No certainty promotion.
- Backend reliability labels map to Vietnamese badges: Chính thức / Đã xác nhận, Báo chí uy tín, Cộng đồng / Mạng xã hội, Tin đồn, Có thông tin trái chiều. There is no client reliability calculation/truth percentage. Source names, independent counts, source-detail links and native expanded original links preserve lineage and attribution. No full third-party body is reproduced.
- Empty sections are hidden. Community/disputed presentation contracts are ready without relaxing M12's factual gates or fabricating fan content. Existing data has no approved community module; no Fan Pulse ingestion is added. Upcoming times use Asia/Ho_Chi_Minh/UTC+7, with stored UTC unchanged. Cards use text/initials and no required copyrighted logos/photos.

### Publication, freshness and UI behavior

- Production `/` serves **eligible PUBLISHED only**. READY is private; DRAFT/FAILED never enter the homepage. No publication call occurs on render, and no state was changed to make a smoke test pass.
- Exact scalar `?preview=1` works only with server **NODE_ENV=development**, through the same rights/fact validation. It visibly states Bản xem trước · Chưa xuất bản. Production ignores the flag and does not expose READY text. Every preview-query URL has noindex,nofollow and canonical `/`; there is no public unrestricted preview, new secret or admin/auth scope.
- No published data shows Bản tin sáng hôm nay đang được chuẩn bị with working matches/news/transfers navigation. Read errors show a safe Vietnamese unavailable state. Older briefs keep their actual date and Cập nhật gần nhất notice rather than pretending to be today's. Scheduler audit is matched to the **exact revision**, exposing only partial/stale booleans through Một số nguồn đang cập nhật; unrelated failures and raw scheduler details remain private.
- Shared navigation now has Trang chủ / Trận đấu / Tin tức / Chuyển nhượng, active state and flexible four-column mobile layout. The latest explicit user scope overrides older Following/Search examples; no inactive authentication navigation is built. The layout is one mobile reading column, a desktop main/secondary rail when appropriate, and a flexible card grid for schedule-only days.
- Semantic H1/H2/H3 hierarchy, named sections, unique anchors, keyboard-native details, 3px focus, focusable main skip target, text-plus-color badges and safe named external links were checked. No horizontal-scroll masking, newspaper grid, ticker, giant hero, new Client Component, remote font or image dependency. Loading retains navigation and a status announcement. SEO is generic Vietnamese title/description/canonical/Open Graph without private/stale source snippets.

### CODE VALIDATION

| Check | Result |
| --- | --- |
| `npm.cmd run lint` | PASS; zero warnings. |
| `npm.cmd run typecheck` | PASS. |
| `npm.cmd test` | PASS; **534 tests / 30 files**, including **42 new homepage tests**. |
| `npm.cmd run build` | PASS; final optimized production build, route set unchanged. |
| Prisma/schema | No schema/migration change; build's Prisma Client generation passes. |

New deterministic tests cover published/READY/DRAFT policy, production preview denial and exact dev allowance, source withdrawal and safe older published selection, stale/partial revision-specific state, summary anchors/deduplication, canonical cards, all five badges/four transfer states, fee/source-count distinction, independent lineage, Vietnam date rollover, verified/missing highlights, empty/no-community behavior, no-image mobile structure, metadata, safe failures, and end-to-end persisted service plus server markup with external fetch forbidden. SQL tests apply all actual migrations in disposable PGlite. Original-language text is never substituted for missing Vietnamese content.

### Runtime, responsive and core journey validation

- Original database: development **`/?preview=1` HTTP 200**, showing the six real persisted EPL/La Liga upcoming fixtures from READY revision 3. `/` shows preparation. Production `/` and **`/?preview=1` both HTTP 200 with preparation**, no READY banner/team content; preview metadata is noindex,nofollow. `/matches`, `/news`, `/transfers` return HTTP 200 in development and production. No source API key was requested, printed or used for an external request.
- Browser DOM/layout checks: real READY preview and populated published fixture at **360, 390, 430, 768, 1280px**; original navigation routes at **360, 768, 1280px**. **No horizontal overflow** in the 22 recorded viewport checks. The final populated 360px page shows three key facts and the first result card within an 800px viewport (card begins about 600px); real READY preview first fixture begins about 654px despite preview/freshness notices. Visible raw internal enums/undefined/null were absent.
- Keyboard verification: 3px visible outline on skip link; Enter moves focus to `morning-content` (tabindex −1). Native summary/source disclosures work without client state. Browser viewport overrides were reset and temporary tabs closed.
- A separately created disposable PostgreSQL database ran existing deterministic permitted fixtures through normalization/processing/reliability/clustering/transfers/video persistence, then the **actual ScheduledJobRunner** generated a valid brief with an intentional optional video failure (**PARTIAL**). Explicit publication was performed **only in that isolated database**. The production homepage stayed usable, showed its partial notice, and rendered RESULTS / CLUB_PLAYER / TRANSFERS / OFF_FIELD plus verified highlights.
- Browser walkthrough completed homepage → exact persisted match/score → verified watch-link target; homepage → canonical Vietnamese news detail → licence/attribution/original-source target; homepage → interest-stage transfer detail → evidence timeline/source section. Eleven main/detail/source-anchor HTTP checks passed. The rumor/interest remained visibly uncertain. Watch/source URLs were inspected, not fetched/played; no external source availability or synthetic video's real playback is claimed.
- Final production servers were restarted against the final build for policy/focus/viewport checks. Isolated fixture data was confined to owned `fmb_m14_smoke_*` databases, which were dropped after testing. Temporary servers, tabs, helpers and flags were removed/stopped. No fake record entered football_morning.
- Read-only preservation audit compared all eleven existing content-table hashes with M13: **all unchanged** — 62 Matches, 1 private Article, 5 NewsSources, 1 AIProcessingRun, 1 cluster/revision, 0 Transfers/updates/Videos, 2 VideoSources/mappings. Original brief revisions **1, 2, 3 remain READY with publishedAt=null**. No source permissions, credentials, keys or local environment file were modified. There is no Git metadata for a commit-history audit.
- Safe summarized evidence: [morning-homepage-validation.json](samples/morning-homepage-validation.json). Documentation: [Morning Homepage runbook](MORNING_HOMEPAGE.md). No migration or future milestone implementation.

### File manifest and limitations

Created: `types/morning-homepage.ts`; `lib/homepage-presentation.ts`; `services/morning-homepage.ts`, `homepage-page-data.ts`; `components/home/morning-homepage.tsx`; `tests/fixtures/homepage.ts`; `tests/homepage-ui.test.tsx`, `homepage-store.test.tsx`; `docs/MORNING_HOMEPAGE.md`; `docs/samples/morning-homepage-validation.json`.

Changed: `app/page.tsx`, `app/loading.tsx`, `app/globals.css`; `components/sports-shell.tsx`; `services/brief-query.ts`; `README.md`; `docs/MORNING_BRIEF.md`; `docs/PROGRESS.md`. No schema, migration, package/lockfile, `.env`, `.env.example`, provider implementation or publication-policy change.

Known limits: real production published Vietnamese editorial content is still pending, so the original public homepage correctly shows preparation. Rich published journey is verified with isolated permitted fixtures, not presented as real live news. External watch/source targets were not played/fetched. Existing M12 bounded candidate validation/source coverage applies; revoked facts may withhold a whole revision pending regeneration. Social/disputed factual publication remains upstream-gated; no community content is invented. Broader assistive-technology audit and production deployment are separate operational checks. **Recommended next milestone: Milestone 15 — Auth & Following, only when requested. It is not started.**

## Historical decision — Milestone 13: GO

Updated: 2026-10-18 (Asia/Ho_Chi_Minh). **Milestone 13: GO — Scheduler code validation, 492 deterministic tests / 28 files, production build and real PostgreSQL runtime checks pass.** The stored-data workflow produces/reuses a READY/unpublished brief, and isolated PostgreSQL validates concurrency, partial failure and revision recovery. **Milestone 14 is not started.** No external API request, Docker access, OS scheduling installation or publication was performed.

### Architecture and daily execution

- `ScheduledJobRunner` is a deployment-neutral one-shot orchestrator. The composition root calls existing MatchProvider sync, permitted NewsProvider sync, article processing, ReliabilityService, StoryClusteringService, TransferTrackingService, VideoSyncService and MorningBriefService. No normalization, AI/reliability, clustering, transfer or publication business logic is copied into jobs. No new UI/API route or mandatory paid provider.
- Ordered job definitions: MATCH_SYNC → NEWS_SYNC → ARTICLE_PROCESS → RELIABILITY_UPDATE → STORY_CLUSTER → TRANSFER_UPDATE → VIDEO_SYNC → MORNING_BRIEF_GENERATE. Default refresh is **07:30 Asia/Ho_Chi_Minh**, generation **08:00 / 01:00 UTC**; timestamps are UTC and independent of server timezone. Ticks between phases resume persisted state; no waiting timer/Next dev process owns scheduling.
- Successful external refresh checkpoints are reused. Internal projections recheck inputs after resumed/recovered syncs so newly arrived articles are not missed; existing content hashes prevent repeated AI calls/records/revisions. Match requests cover only cutoff −2/+1 days for EPL/La Liga and preserve existing caches/limits. News uses enabled permitted sources only (10 items/source); restricted sources remain disabled. Recent article selection is applied before a 50-item limit and covers 48 hours, preventing old drafts from starving fresh processing.
- Database/internal data access and brief generation are critical. Optional source/AI/video failures degrade output and permit a validated brief. Missing optional configuration is an explicit skip. Quota/busy/cooldown or failed external batches remain visible; a successful brief with optional failures is **PARTIAL**. Empty DRAFT is **NOT_READY/FAILED**, never called a successful morning delivery. Generation leaves valid nonempty output **READY/unpublished** and never calls publish.
- Runtime defaults and publication policy follow the latest explicit M13 request, superseding older baseline timings/auto-publish examples. Supported timezone configuration remains aligned with M12 (Ho Chi Minh/Bangkok/UTC); no arbitrary DST timezone behavior is claimed.

### Persistence, recovery and observability

- A dedicated `pg.Client` holds global PostgreSQL session advisory lock **91531113** for the entire workflow, across dates/backfills. Another process immediately skips WORKFLOW_RUNNING. It is not a pooled-query/in-memory lock. Disconnect releases the lock; lost-session detection prevents further runner steps/success reporting. Existing domain transactional locks remain intact. Scheduler workers require direct/session-capable database connectivity.
- Existing JobRun unique logical keys are reused for workflow/steps; keys include local date/zone and logical UTC cutoff. Ownership fences completion. An abandoned RUNNING row is recoverable only under the newly acquired session lock. Workflow state and immutable per-invocation attempt audit commit atomically; failed/partial history is not lost when the logical row is reused. A DB outage may prevent failure persistence, reported honestly as auditPersisted=false; the next invocation safely recovers.
- JobRun metadata records scheduledAt, start/end, status, counts processed/succeeded/failed, attempts, safe error categories, step outcomes and correlation/owner. Per-step counts have explicit domain units. Structured logs include workflow/job/type/date/status/counts and controlled error identifiers; no credentials/raw provider payload/error strings. No authentication secret or public mutating cron endpoint exists.
- Only explicitly transient runner errors retry, at most two attempts, 500ms exponential backoff and maximum five-second wait. Existing provider retry/rate/cooldown policy is retained; long Retry-After deadlines are persisted in UTC and cannot be bypassed by another phase or explicit rerun. Permanent auth/configuration/permission/validation failures and partial external batches are not blindly repeated between phases. Completed partial runs require an explicit operator rerun after correcting/dealing with the issue and any cooldown expiry.
- Freshness comes from actual ProviderStatus success/data-update timestamps and health; a 36-hour age flag marks stale/missing/future success timestamps. Disabled sources remain disabled, unknown timestamps stay null. Generation receives this context and its JobRun stores it beside the exact BriefRevision reference. It does not mutate M12's immutable content/hash merely because wall time changes. SchedulerStore.health and the health CLI expose last success/partial/failure attempts. No admin dashboard/notification is built.
- Manual, historical, dry-run and automated ticks share one runner. Dry-run does not connect to DB or write/call providers. Historical runs read retained data without refreshing present state. Stored-only skips match/news/video and explicitly uses deterministic article fallback even if remote AI is configured. Completed same-mode duplicates are cached; `--rerun` re-evaluates services through their own caches and M12 hashes. Changing stored-only to normal mode does not hide refresh behind a completed cache.

### Schema, environment and commands

- Applied additive migration **20261018050000_scheduler_statuses**: only adds PARTIAL/SKIPPED JobStatus values. No new model/column/reset; existing JobRun logical keys, logicalDate, checkpoint, ownership and timestamps suffice. **12 migrations applied; schema diff is empty.**
- Added non-secret defaults `APP_TIMEZONE=Asia/Ho_Chi_Minh`, `MORNING_BRIEF_HOUR=8`, `SCHEDULER_ENABLED=false`. Automated ticks are opt-in; explicit manual execution remains available. Existing server-only provider variables apply. Local `.env`/credentials were not changed or printed.
- Added `scheduler:morning`, `scheduler:tick`, `scheduler:health`. Manual examples: `npm.cmd run scheduler:morning -- today --dry-run`; `... today --stored-only`; `... today --stored-only --rerun`; `... YYYY-MM-DD`; `... today --refresh`. `npm.cmd run scheduler:tick` is a no-op while disabled. Exit 0 success/cached/skipped/pending, 2 partial, 1 critical failure.
- `pg` and `@types/pg` **8.23.1**, already installed and locked through Prisma, are declared directly for the dedicated session implementation; no version upgrade or new CLI framework. `npm.cmd ls pg @types/pg --depth=0` verifies the declarations. The initial offline lock-only npm attempt could not write the host cache; existing resolved lock entries were retained and direct root declarations updated safely.
- The [scheduler runbook](SCHEDULER.md) documents Windows Task Scheduler, Linux cron, GitHub Actions/cloud invocation and a future authenticated HTTP bridge requirement for HTTP-only platforms. No operating-system task/hosted automation is installed. Operator must enable ticks and register a durable external trigger; no paid vendor dependency. Production backups/session-pool access and log retention remain operational responsibilities.

### CODE VALIDATION

| Check | Result |
| --- | --- |
| Prisma format / validate / generate | PASS. |
| `npm.cmd run db:migrate:deploy` / Prisma migrate status | PASS; all 12 migrations applied, no reset. |
| Prisma migrate diff | PASS; no difference. |
| `npm.cmd run lint` | PASS; zero warnings. |
| `npm.cmd run typecheck` | PASS. |
| `npm.cmd test` | PASS; **492 tests / 28 files**, including **35 new scheduler tests**. |
| `npm.cmd run build` | PASS; final optimized production build, existing routes unchanged. |
| `npm.cmd run db:check` | PASS; PostgreSQL connection verified through Prisma. |

New tests cover all job ordering/audits, duplicate/concurrent invocation, phase resumption and recovered-source downstream checks, permanent/partial failure retention, YouTube/news isolation, DB and lost-lock failures, bounded transient retries and persisted long Retry-After, safe errors/malformed output, manual rerun/backfill, UTC+7 scheduling, stale/unknown freshness, source permissions/missing keys, stored-only remote-AI prohibition, real M12 unchanged/new revisions and no auto-publication. Dedicated-session tests cover correct advisory SQL, busy connection closure, connection failure, lost session and unlock cleanup. All SQL tests execute actual migrations in disposable PGlite; no live/paid API is needed. HTTP auth tests are inapplicable because no endpoint exists.

### Real PostgreSQL validation and preservation

- `scheduler:morning -- today --stored-only`: **SUCCEEDED**, target **2026-10-18T01:00Z**, workflow **a0387a35-cb33-42ac-beb8-069868167f19**. Generated **revision 3 / READY/unpublished**, ID **c4826d90-2602-45a4-bff9-d7d0375d70d0**. The scheduler records an explicit logical cutoff request; earlier M12 revisions 1/2 remain intact. Sparse real content remains sourced upcoming fixtures, without fabricated results/news/transfers/videos.
- A second identical CLI call returned **cached=true** without another workflow attempt/brief. Explicit stored-only `--rerun`, including a final post-review rerun, completed successfully and M12 returned the **same revision 3 / cached=true**. Root/step/immutable attempt JobRuns and actual stale input metadata are persisted. `scheduler:health` reports the successful attempt; no fake failure was inserted into the real data database. Tick disabled mode and non-mutating dry-run both passed.
- In a newly created, separate disposable PostgreSQL database, actual production advisory locking rejected a second concurrent worker; a fake quota failure produced **PARTIAL with a READY brief**, a duplicate was cached, recovery produced **SUCCEEDED while reusing revision 1**, and a changed persisted score appended **revision 2**. Three audit attempts persisted PARTIAL/SUCCEEDED/SUCCEEDED. All eight isolated checks passed. The owned database was dropped after validation; no fixture entered football_morning.
- All **11 audited pre-existing content tables are byte-hash unchanged** before/after main workflow execution: 62 Matches, 1 private Article, 5 NewsSources, 1 AIProcessingRun, 1 ArticleCluster/revision, 0 Transfers/updates/Videos, 2 VideoSources/mappings. No original field, permission, publication status or source setting was altered. Intentional additions are scheduler audits and one READY brief revision; no source sync or external AI/API request was made. Temporary helpers/snapshots were removed. There is no Git metadata for a commit-history audit.
- Safe summarized evidence: [scheduler-local-validation.json](samples/scheduler-local-validation.json). The previous M12 sample remains historical; it is not rewritten as a new live content claim.

### File manifest and limitations

Created: `types/scheduler.ts`; `lib/scheduler-policy.ts`, `scheduler-lock.ts`, `scheduler-runtime.ts`; `services/scheduler.ts`, `scheduler-store.ts`; `scripts/run-scheduler.ts`; `tests/scheduler.test.ts`, `scheduler-lock.test.ts`; `prisma/migrations/20261018050000_scheduler_statuses/migration.sql`; `docs/SCHEDULER.md`; `docs/samples/scheduler-local-validation.json`.

Changed: `lib/config.ts`; `services/ai-store.ts` (optional pre-limit recent candidate window, existing callers unchanged); `prisma/schema.prisma`; `package.json`; `package-lock.json`; `.env.example`; `README.md`; `jobs/README.md`; `docs/MORNING_BRIEF.md`; `docs/PROGRESS.md`. No provider implementation, application UI/route or MorningBriefService rewrite.

Known limits: external trigger registration remains manual; session-capable PostgreSQL needed; audit retention/automatic alert transport not installed; stale inputs are visible and not magically refreshed in stored-only mode; sparse approved Vietnamese content and optional keys still limit editorial breadth. Backfill uses retained data rather than reconstructing unavailable historical state. Existing M6/M8/M10 batch bounds remain; larger collections may require later operational batching. Publication stays explicit. **Recommended next milestone: Milestone 14 — Morning Homepage, only when requested. It is not started.**

## Historical decision — Milestone 12: GO

Updated: 2026-10-18 (Asia/Bangkok). **Milestone 12: GO — Morning Brief Engine code validation, deterministic SQL validation and real persisted-data sample generation.** The local sample is READY/unpublished with six sourced upcoming fixtures; absent recent results and approved Vietnamese stories/transfers/videos were not invented. **Milestone 13 is not started.**

### Architecture, selection and provenance

- MorningBriefService reads persisted data only, reusing the existing M9 canonical publication boundary, M10 checked current transfer relationships and M11 verified highlight selection. No external/API/AI call, mandatory paid provider, new environment variable/dependency, UI route, final homepage, scheduler or social ingestion.
- Structured Vietnamese document supports SUMMARY, RESULTS, HIGHLIGHTS, TOP_STORIES, CLUB_PLAYER, OFF_FIELD, TRANSFERS, COMMUNITY and UPCOMING. Empty sections are omitted; highlights attach to result items instead of repeating match narratives. Community has no invented content. Summary points reference at most six selected exact headlines and their evidence; sparse days are not padded.
- Primary selection uses canonical clusters only. Each story has one content section; current M10 relationships consume old interest/talks/signing narratives, keeping different destinations separate. Unmapped/untracked raw transfer articles wait for safe M10 projection. Off-field content requires reliable/official permitted evidence. Rumor/certainty wording is copied unchanged.
- Explainable brief-ranking-v1 components: source class 30%, recency 25%, competition relevance 15%, prominence 10%, novelty 10%, independently reviewed corroboration 10%. Corroboration is capped and never substitutes article/engagement counts for truth. Canonical club/name configuration and stored editorial features prioritize notable fixtures without creating identities or guessing title-race facts. Near-ranked candidates favor league/club diversity without artificial filler.
- Citation/evidence snapshots retain source names, original URLs, publication dates, language/tier, licence/attribution, Article/cluster/Match identity and structured proof. Match evidence is bound to exact persisted provider fields, never unrelated news claims. No unsupported score/stat/quote/injury/transfer/fee/social claim is generated. Full source bodies are absent.
- Current permissions/Vietnamese processing/canonical text/reliability remain authoritative at generation, explicit publication and query time. Unpublished/private/restricted/untranslated/stale/disputed/social-only factual material stays hidden. Historical audit content does not grant ongoing publication rights.
- Frozen brief history contains internal video references only, without copied YouTube API metadata or a restrictive Video FK. Query-time M11 validation resolves safe current links; removed/revoked/expired video yields **Chưa tìm thấy highlight từ nguồn được xác minh.** The retention test deletes video metadata without changing the READY brief history.

### Windows, persistence and lifecycle

- Default target-date cutoff is 08:00 Asia/Ho_Chi_Minh, 24-hour lookback and 24-hour upcoming horizon. This follows the explicit M12 request; --cutoff-hour 7 / --upcoming 48 can reproduce older baseline settings. Asia/Bangkok/UTC are also supported; arbitrary DST zones are rejected. --as-of explicitly advances the same local date for regeneration; future/mismatched cutoffs fail. All timestamps remain UTC.
- Match completion time is unavailable in the current schema/provider. Results therefore require FINISHED plus kickoff in the primary window, with a structured limitation warning. Missing scores are skipped, never made 0–0; unsupported events/stats are not synthesized. Cached provider timestamps remain visible. Historical upcoming snapshots stay schedules at cutoff after kickoff, while rescheduling/cancellation invalidates them.
- Reused DailyBrief, BriefRevision, BriefItem, ClaimEvidence and BriefItemEvidence. Additive migration **20261018040000_morning_brief_engine** adds nullable generationMetadata and managed READY snapshot immutability only; no reset/enum expansion. Existing PUBLISHED protections remain intact. **Eleven migrations applied; schema diff reports no difference.**
- Metadata freezes configuration/window, schema/ranking versions, candidate inputs, section order and summary. Stored hashes are rechecked. One date/locale identity; identical current inputs reuse the latest revision. Data/configuration corrections append history, including reversions to an earlier value. READY content/items/citations cannot be overwritten.
- Transaction advisory locking plus existing unique revision/date keys serialize generation. Real PostgreSQL concurrency testing exposed Prisma's nested adapter serialization errors; bounded retry recognition now handles those and is regression-tested. Two simultaneous real requests reuse the same revision after the fix.
- Nonempty validated content becomes READY, including a schedule-only day. Empty input stays DRAFT with sparse warnings. Invalid generation rolls back with controlled error logging rather than storing arbitrary malformed output. The underlying FAILED/NEEDS_REVIEW statuses remain available for later orchestration. No command automatically publishes.
- Explicit internal publish(revisionId) requires the latest READY revision and fresh source/fact validation under locks. It is tested only in disposable databases; real local briefs remain unpublished. BriefQueryService exposes latest/by-date/revision; public defaults require PUBLISHED and current source validity, while explicit internal previews support READY/DRAFT. No HTTP publication route or M13 job is added.

### CODE VALIDATION

| Command/check | Result |
| --- | --- |
| `npx.cmd prisma format` / `validate` / `generate` | PASS. |
| `npm.cmd run db:migrate:deploy` / `npx.cmd prisma migrate status` | PASS; 11 migrations, schema current. |
| `npx.cmd prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` | PASS; no difference. |
| `npm.cmd run lint` | PASS; zero warnings. |
| `npm.cmd run typecheck` | PASS. |
| `npm.cmd test` | PASS; **457 tests / 26 files**, including **25 new brief tests**. |
| `npm.cmd run build` | PASS; optimized production build with existing routes unchanged. |
| `npm.cmd run brief:generate -- smoke` | PASS; safe structured real-data preview, cached current revision, no publication. |

Tests cover completed scores, verified/absent highlights and retention, duplicate canonical news/source provenance, official priority/rumor preservation, source revocation, missing Vietnamese content, evolving transfer deduplication, sparse/no-community states, balanced ranking/novelty/prominence, upcoming/timezones/cutoffs, malformed/unsupported output, immutable evidence, changed/reverted facts, concurrent idempotency, latest/date/revision queries and explicit publication revalidation. They execute all actual migrations in disposable PGlite and require no live/paid AI. Nested adapter conflict recognition also has a deterministic regression test.

### Real local data validation and preservation

- Generated target **2026-10-18** with cutoff **2026-10-18T01:00Z**. Current sample is **revision 2 / READY**, six notable upcoming fixtures across EPL/La Liga, sourced from persisted Football-Data.org mappings. An earlier selection-policy snapshot remains revision 1; repeated unchanged generation does not append another revision.
- Sequential repeat, CLI smoke and **two simultaneous actual PostgreSQL requests** all reuse revision 2. Public latest query returns no published brief, as intended. No source, publication status, video or original match field was modified to fill the sample.
- Structured output was inspected and saved at [docs/samples/morning-brief-local.json](samples/morning-brief-local.json). There were no eligible current results or published Vietnamese stories/transfers/verified videos at this cutoff. Richer sections are covered separately by deterministic permitted fixtures; this is not a claim of full live editorial coverage.
- Before/after existing-data SHA-256 is unchanged: `dfae5faef19613fe6c513d547bbc01d05656e282d70076d011fad6dfe5909514`. Preserved: **62 Matches, 1 private Article, 5 NewsSources, 1 AIProcessingRun, 1 cluster/revision, 0 Transfers/TransferUpdates/Videos, 2 VideoSources/mappings**. Intentional additions are one DailyBrief, two immutable revisions and eight deterministic structured-match citation records. No fake production record, API request, Docker access or secret-file change.
- Temporary preservation/runtime helpers are removed. No Git metadata exists in this workspace for a commit/history audit.

### File manifest and limitations

Created: `types/morning-brief.ts`; `lib/brief-policy.ts`; `services/brief-builder.ts`, `brief-inputs.ts`, `brief-store.ts`, `morning-brief.ts`, `brief-query.ts`; `scripts/generate-brief.ts`; `prisma/migrations/20261018040000_morning_brief_engine/migration.sql`; `tests/fixtures/briefs.ts`, `brief-news.ts`; `tests/brief-builder.test.ts`, `brief-store.test.ts`; `docs/MORNING_BRIEF.md`; `docs/samples/morning-brief-local.json`.

Changed: `prisma/schema.prisma`, `services/transfer-query.ts` (export existing checked event reader), `package.json`, `README.md`, `docs/VIDEO_HIGHLIGHTS.md` (retention integration), `docs/PROGRESS.md`. No existing UI/provider implementation rewrite, dependency/lockfile or .env/.env.example change.

Known limits: kickoff proxy for missing completion timestamps; sparse real published Vietnamese content; bounded initial query corpus; only three configured timezones; current-source gates may withhold old revisions after corrections/revocation. Prominence is editorial configuration, not a standings/title-race inference. No AI prose polish, social ingestion, scheduler, final homepage or automatic publication. See [Morning Brief runbook](MORNING_BRIEF.md). Recommended next milestone: **Milestone 13 — Scheduler**, only when requested.

## Historical decision — Milestone 11: GO (code + isolated runtime validation)

Updated: 2026-10-17 (Asia/Bangkok). **Milestone 11: GO — YouTube Highlights code validation and isolated production-route validation.** Optional live YouTube validation is **SKIPPED / NOT_CONFIGURED**; no API key was printed or requested in chat. This does not block deterministic validation. **Milestone 12 is not started.**

### Architecture and verified-source policy

- Added VideoProvider interface and YouTubeVideoProvider adapter; provider DTOs remain inside the adapter. Services depend on the interface. Deterministic fake provider is test-only. No paid dependency, new environment variable, browser key or external request on render.
- The optional whitelist/spec patch was absent. Explicit current Vietnam-first instructions take precedence over older generic league-first examples. Publisher documentation reviews FPT Bóng Đá (@FPTBongDaOfficial) for Premier League and SCTV Thể Thao Official (@SCTVTheThaoOfficial) for La Liga. References and limits are in [Video runbook](VIDEO_HIGHLIGHTS.md). Review supports link discovery, not redistribution rights.
- New data-driven VideoSource and VideoSourceCompetition registry includes channel/handle, verified/enabled flags, priorities/type, reviewer evidence/time, competition UUID, exact season, VN market/language, finite rights/link type/date scope. Initial 2026/2027 mappings run 2026-08-01 to 2027-07-01, with 180-day review freshness. Future rights do not silently carry over. Channel IDs remain unresolved until the API verifies exact handles; changed identity fails closed. Registry insertion never re-enables a revoked row.
- Validation requires a finished match, exact reviewed channel/scope, both canonical teams/aliases in title, competition marker, bounded publication time and public processed availability. Wrong team/competition/date/season, one-team, youth/women/classic/gaming/friendly and future uploads are rejected conservatively.
- Classification supports HIGHLIGHT, EXTENDED_HIGHLIGHT, GOALS, INTERVIEW, PRESS_CONFERENCE, ANALYSIS, REACTION, WATCH_ALONG, OTHER. Source tier precedes standard → extended → goals. Ancillary/reaction/watch-along videos cannot become primary. Different-match/source reassignment is prevented. Existing provider/externalId uniqueness and a partial one-primary-per-match index enforce duplicate/primary invariants.
- Availability and VN region eligibility remain distinct. Missing region/per-video language stays unknown; API hints do not assert real playback. Public API omissions become UNAVAILABLE without guessing private versus removed, withdraw selection and clear obsolete metadata. Provider failures preserve good data within freshness limits.
- Completed Match detail gains a compact original-title/channel/type/time watch-link panel and exact requested Vietnamese no-video state. Safe new-tab links, source explanation, no required imagery, no embed/download/rehost. Public read revalidates current source/mapping/match/freshness instead of trusting cached selection alone; video failure cannot break the match page. UTC remains unchanged; presentation uses Asia/Ho_Chi_Minh.

### Quota, idempotency and operations

- `npm.cmd run video:sync -- registry|recent|smoke|refresh|cleanup|match <uuid>` follows existing CLI conventions, without an added framework. Only the existing optional server-side YOUTUBE_API_KEY is used.
- Recent mode considers at most three matches/seven days, two approved channels/match, five results/query. Smoke limits to one match/one channel query. Per-match material-input hashes cache discovery for 12 hours; an existing preferred verified Vietnamese highlight avoids repeated discovery. Metadata refresh is at most daily, ten match groups per refresh invocation, at most 50 IDs/request. Search budget is atomically capped at ten requests/UTC day across jobs.
- Global five-minute JobRun lease, controlled structured counters/errors, last success/failure ProviderStatus, 24-hour quota cooldown. Missing-key skips are graceful; skipped runs preserve failure history and do not manufacture successful timestamps. One failed source/query permits another to continue, except quota/auth failures stop unnecessary requests. Eight-second timeout, one transient retry for metadata, zero search retries; malformed JSON/DTOs cannot overwrite valid records.
- YouTube metadata must be refreshed or removed within 30 days. Public checks expire at seven days; cleanup purges managed unreferenced metadata/stale resolved channel IDs at 29 days. Daily refresh/cleanup is a documented manual duty; no scheduler is added. Existing Brief data is preserved; future Brief integration must handle retention-safe references. No Brief video references exist now.

### Schema and preservation

Applied additive migration `20261017160000_video_highlights`: three new registry/sync-state models; nullable Video source/mapping FKs; description/language/type/availability/primary/collected/checked metadata; FK/history/lookup indexes and selection/status constraints. Existing Video and NewsSource relations remain. **Ten migrations applied, no schema drift, no reset.**

Before/after SHA-256 for existing matches/news/AI/clusters/evidence/transfers is unchanged: `88e51d07f9b654130c5ede08efc1eb9dd27ba902c352dc9574aff46d8c5a10d7`. Counts: **62 Matches, 1 Article, 5 NewsSources, 1 AIProcessingRun, 1 cluster/revision, 0 ClaimEvidence, 0 Transfers/TransferUpdates**. Two legitimate reviewed VideoSource rows/mappings and unconfigured video job/provider status are the intended new configuration. No synthetic production match/video, publication or source permission change. Local environment secrets remain untouched/ignored. No Docker access.

### CODE VALIDATION

| Check | Result |
| --- | --- |
| `npx.cmd prisma format` / `validate` / `generate` | PASS. |
| `npm.cmd run db:migrate:deploy` | PASS; additive migration applied. |
| `npx.cmd prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` | PASS; no difference. |
| `npm.cmd run lint` | PASS; zero warnings. |
| `npm.cmd run typecheck` | PASS. |
| `npm.cmd test` | PASS; **432 tests / 24 files**, **47 new video tests**, plus updated Match UI/logging regression assertions. |
| `npm.cmd run build` | PASS; Prisma generation and optimized Next production routes. |
| `npm.cmd run video:sync -- registry` | PASS; two reviewed sources inserted idempotently. |
| `npm.cmd run video:sync -- smoke` | SKIPPED / NOT_CONFIGURED; zero searches/errors, safe structured job status. |

New tests cover verified VN hierarchy, official fallback versus random reupload, wrong/weak match identity, ancillary classification, rights expiry/revocation, unavailable/unknown/private states, duplicate ingestion/one primary, negative caching/preferred-result discovery suppression, missing key, malformed/timeout/network/quota, persisted cooldown/budget, one-channel failure isolation, source ID takeover rejection, retention and original-title/link/Vietnam-time UI. SQL tests execute every real migration in disposable PGlite. An old M4 assertion forbidding all YouTube copy was updated to assert the explicit empty state and absence of fabricated watch links; unsupported stats/AI/social remain absent.

### Runtime validation

- Existing completed configured-database `/match/[slug]`: **HTTP 200**, match information intact, requested clean verified-video empty state.
- Production Next build against a newly created separate `fmb_m11_smoke_*` PostgreSQL database: fake provider → real normalization/validation/store → one primary → Match route **HTTP 200** with original title, source, watch URL and unknown-geo disclaimer; no iframe/embed. Disabling its source immediately restores the empty state and removes the link on the next route request (**HTTP 200**).
- The isolated test initially rejected future fixture check times; using the current smoke clock fixed the harness without weakening production freshness rules. Temporary owned databases/servers were removed. No test record entered football_morning.
- Optional live API source resolution/candidate/persistence still needs a locally configured key. Run the exact Windows commands in the runbook; no successful candidate is required if no recent eligible match/video exists. Environment configuration absence is separate from passing code/runtime validation.

### File manifest

Created: `types/video-provider.ts`; `providers/youtube/provider.ts`, `sources.ts`; `services/video-policy.ts`, `video-store.ts`, `video-sync.ts`, `video-query.ts`; `scripts/sync-videos.ts`; `components/matches/match-highlight.tsx`; `prisma/migrations/20261017160000_video_highlights/migration.sql`; `tests/fixtures/videos.ts`; `tests/video-policy.test.ts`, `youtube-provider.test.ts`, `video-store.test.ts`, `video-ui.test.tsx`; `docs/VIDEO_HIGHLIGHTS.md`.

Changed: `prisma/schema.prisma`, `package.json`, `.env.example`, `components/matches/match-detail.tsx`, `app/match/[slug]/page.tsx`, `lib/logging.ts`, `tests/foundation.test.ts`, `tests/match-ui.test.tsx`, `providers/README.md`, `README.md`, `docs/PROGRESS.md`. No dependency/lockfile or local .env change. Temporary audit/smoke helpers are removed. Workspace has no Git metadata for commit/history audit.

Known limits: live API authentication/channel lookup/real candidate persistence not exercised without a key; actual geo/device playback unverified; matching deliberately favors precision and may miss localized/historical titles. Daily maintenance and finite source/rights review remain manual until later scheduling/admin milestones. No scheduler, thumbnails, embeds or arbitrary-channel fallback. See [runbook](VIDEO_HIGHLIGHTS.md). Recommended next milestone: **Milestone 12 — Morning Brief Engine**, only when requested.

## Historical decision — Milestone 10: GO

Updated: 2026-10-17 (Asia/Bangkok). **Milestone 10: GO — Transfer Center code validation and production-route validation using isolated test data.** The configured database correctly has no published Vietnamese transfers. A separate disposable PostgreSQL database exercises the populated production routes without changing existing source content or publication status. Real published-content validation remains an editorial/content-readiness task, as in Milestone 9. **Milestone 11 is not started.**

### Architecture, evidence and presentation

- Added `/transfers` and stable `/transfers/giao-dich-<transfer-uuid>` routes, Vietnamese cards, detail/timeline, league/status filters and 12-card pages. Shared navigation wraps on mobile. No external API is called on render; no new key, environment variable, dependency or paid provider is required.
- `TransferTrackingService` is an explicit database-only projection job (`npm.cmd run transfers:sync`). It reuses current M6 processing, M7 evidence/permissions, M8 canonical clusters and canonical entity UUIDs/aliases. `TransferQueryService` uses a read-only repeatable-read transaction and the same M9 publication gates; frontend components never recalculate reliability or query providers.
- CONFIRMED requires a current reviewed, scoped authoritative completion statement. Official talks remain NEGOTIATION; credible monitoring is INTEREST; speculation remains RUMOR. Cached status, AI certainty, copied reports, engagement and source counts cannot grant confirmation. Every new factual revision needs fresh proof; relabeling previously seen evidence does not count as new authoritative evidence. M7 transfer wording is versioned as `reliability-v1.1.0`, retaining prior assessments.
- Relationships match player/current/destination UUIDs exactly; distinct destinations stay separate. Missing player identity produces an explicit incomplete card linked to canonical news instead of a fabricated Transfer. Unknown origins are not guessed. Cross-cluster evolution uses a conservative 30-day source-publication span and avoids ambiguous merges.
- Append-only TransferUpdate snapshots preserve stage, canonical cluster/evidence links, original source time, Vietnamese text, field-specific facts, policy version and input hash. Repeated unchanged syncs reuse history. A new authoritative signing can follow earlier rumor/interest/talks without rewriting them; unconfirmed reports may regress. Completed transfers survive later speculation, while reviewed contradictions/disputes block stale public confirmation pending resolution.
- Permissions, current Vietnamese processing, PUBLISHED/READY status, source metadata, exact canonical text and snapshot fingerprints are rechecked on every public read. Private/revoked/stale evidence never appears through the timeline. Current factual-news policy withholds unresolved disputed/social stories; badge components retain an explicit warning/community presentation without weakening those gates.
- Fees require reviewed field-specific exact source spans and canonical player/destination scope. Confirmed and reported fees remain separate; a confirmed signing can have only a reported conditional price. Source currency/caps/add-ons remain verbatim; no conversion, inferred fee, contract expiry or deal type. Legacy Transfer fee/date columns are not trusted for public output. Conflicting financial facts are omitted. Each displayed optional fact links to its permitted source.
- Sources show original title/language/time/tier/URL, licensing/attribution and safe links through the M9 components. Publisher and independently reviewed lineage counts remain separate and never determine confirmation/ranking. Status sorts confirmed → negotiation → interest → rumor, followed by confidence and recency, with stable tie-breaks.
- Vietnamese labels, explicit uncertainty, text/initial visual fallbacks, responsive cards, visible focus, semantic headings and empty/loading/error/missing-data states are provided. Source times display Asia/Ho_Chi_Minh without changing UTC storage; day-only precision never fabricates an hour. Public permitted details receive canonical/Open Graph metadata; private/invalid/error details and list query variants are noindex.

### Schema and safe migration

Additive migration `20261017120000_transfer_tracking` extends existing TransferUpdate with nullable `clusterId`, unique `inputHash` and JSONB snapshot, a restrictive cluster foreign key, history/cluster indexes, shape constraint and append-only trigger for managed snapshots. No enum expansion, reset, deletion or legacy-field rewrite. This provenance is needed to bind each retained stage/fact to its exact canonical source revision; existing Transfer/ClaimEvidence/ArticleCluster models are reused. All **9 migrations are applied**, and schema diff reports **no difference**.

### CODE VALIDATION

| Command/check | Result |
| --- | --- |
| `npx.cmd prisma format` / `validate` / `generate` | PASS. |
| `npm.cmd run db:migrate:deploy` / `npx.cmd prisma migrate status` | PASS; 9 migrations, schema up to date. |
| `npx.cmd prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` | PASS; no difference. |
| `npm.cmd run lint` | PASS; zero warnings. |
| `npm.cmd run typecheck` | PASS; Next route generation and strict TypeScript. |
| `npm.cmd test` | PASS; **385 tests / 20 files**, including **38 new transfer tests**. |
| `npm.cmd run build` | PASS; generated Prisma Client and optimized production build including both transfer routes. |
| `npm.cmd run transfers:sync` | PASS against configured database; zero candidate clusters/created/cached/incomplete/blocked records, no draft publication. |

Deterministic tests use disposable PGlite databases with all real migrations, the existing processing/reliability/clustering/publication gates and fake AI responses that cannot assign themselves authority. They cover all four status renderings, reviewed official upgrade, rumor/old-proof/cache/count/AI confirmation protection, stage order/idempotency/immutable history, distinct destinations, copied lineage, canonical aliases, separate reported/confirmed fees and conditional caps, contracts/currency, missing metadata, source revocation/private updates, fresh contradictions, relationship drift, old-story windows, league/status filters, read-only queries, invalid/private/noindex details, safe source links, day precision and mobile structure. No live provider or paid model is needed.

### Runtime, preservation and responsive evidence

- Final production build against the configured database: `/transfers`, EPL/La Liga, confirmed/rumor filters all HTTP 200 with appropriate honest empty states; invalid filter/slug have Vietnamese feedback and noindex. `/news`, `/matches` and `/api/health` remain HTTP 200. No raw source content/error leakage was observed.
- Production build against a separately created `fmb_m10_smoke_*` PostgreSQL database: populated list, league/status filters and one valid indexed transfer detail all HTTP 200. Detail includes the four-stage timeline, current authoritative confirmation and permitted source evidence. Invalid detail is unavailable/noindex. The isolated database and servers were removed after the run; no fixture entered `football_morning`.
- Next loading/streaming can yield HTTP 200 plus noindex for an unavailable detail rather than an early 404; private content remains absent. Valid detail metadata/HTML use the same request-scoped checked result.
- Browser layout inspection at **390px mobile**, **768px tablet** and **1200px desktop**, plus populated detail inspection, verified compact cards/wrapping navigation, status hierarchy, text fallbacks and source/timeline readability. Preview was visibly marked as isolated test data. Native hidden-frame click automation was unreliable; direct production-route requests and deterministic link/keyboard-structure tests supply navigation coverage, rather than claiming a full interactive accessibility audit.
- Before/after audit of configured Matches, Articles, NewsSources, AIProcessingRuns, ArticleClusters/revisions and ClaimEvidence is unchanged: SHA-256 `3f20de81b0e7a817800a0d5a0c842ad74eff332e6f9a87c302e20e8176f9e114`. Counts remain **62 matches, one private Article, one cluster, zero transfers, zero published Articles, four disabled sources**. No existing draft, permission, API key or original source field was changed. Temporary smoke/audit scripts were removed. Docker and external providers were not accessed.

### File manifest

Created:

- Routes: `app/transfers/page.tsx`, `loading.tsx`, `error.tsx`, `[slug]/page.tsx`, `[slug]/not-found.tsx`.
- Components: `components/transfers/transfer-shell.tsx`, `transfer-status.tsx`, `transfer-state.tsx`, `transfer-filters.tsx`, `transfer-card.tsx`, `transfer-list.tsx`, `transfer-detail.tsx`.
- Services: `services/transfer-evidence.ts`, `transfer-service.ts`, `transfer-query.ts`, `transfer-page-data.ts`.
- Shared contracts/helpers: `types/transfers.ts`, `lib/transfer-claims.ts`, `lib/transfer-presentation.ts`; CLI: `scripts/sync-transfers.ts`.
- Migration: `prisma/migrations/20261017120000_transfer_tracking/migration.sql`.
- Tests: `tests/transfers-store.test.ts`, `tests/transfers-ui.test.tsx`, `tests/fixtures/transfer-store.ts`, `tests/fixtures/transfers.ts`.
- Documentation: `docs/TRANSFERS.md`.

Changed: `prisma/schema.prisma`, `package.json`, `providers/ai/validation.ts`, `services/reliability-engine.ts`, `types/reliability.ts`, `docs/RELIABILITY.md`, `services/news-ui-data.ts`, `types/news-ui.ts`, `components/sports-shell.tsx`, `components/news/news-loading.tsx`, `README.md`, `docs/PROGRESS.md`. No dependency/lockfile or environment-file change. Workspace has no Git metadata, so no commit/history comparison is claimed.

Known limits: real published Vietnamese transfer content and reviewed identity/fact evidence are not yet available; no source permission is bypassed to fill the page. Initial job/read bounds are 100 clusters/relationships and 200 history records per event, with fail-safe errors rather than partial trusted history; large-corpus batching/query tuning is future hardening. Unresolved social/disputed content stays outside public factual stories under existing policy. Unknown identities may conservatively remain separate. No automatic fee extraction/review-authoring/admin UI or licensed imagery is added. Full accessibility/device audit remains outstanding. See [Transfer Center runbook](TRANSFERS.md). Recommended next milestone: **Milestone 11 — YouTube Highlights**, including its provider/rights decision gate, only when requested.

## Historical decision — Milestone 9: GO

Updated: 2026-10-17 (Asia/Bangkok). **Milestone 9: GO — News UI implementation and code validation.** Vietnamese list/detail/source flows pass deterministic rendering and disposable PostgreSQL tests. Real production-route empty/private-state checks pass. A live published Vietnamese detail cannot yet be exercised because the real database contains no published Article; this content readiness limit is separate from passing code validation. **Milestone 10 is not started.**

### Routes, presentation and data boundary

- Added `/news` and stable `/news/tin-<cluster-uuid>` routes. No schema/migration, environment variable, dependency, external provider request or publication operation was added.
- Read-only NewsQueryService serves one canonical cluster rather than duplicate member Articles. Shared sports navigation links Home/Matches/News; the foundation homepage adds only a news link.
- Public output requires PUBLISHED/READY representatives and supporting source metadata, current reusable-source rights, valid M6 processing, fresh M7 gates and M8 canonicalization. The persisted representative and exact Vietnamese text pair must still match. Clustering eligibility alone never publishes a draft. Private citations, stale processing, missing Vietnamese fields, permissions/licence revocation and disputes fail closed.
- Reused the M8 current-data loader with an explicit read-only option; job locking/write behavior remains unchanged. Public transactions use a consistent read-only snapshot and never call the state-changing cluster current/reconciliation service or append history.
- Disjoint per-page sections support Đáng chú ý, Mới cập nhật, CLB, cầu thủ, transfer previews and outside-the-pitch/culture as data exists. Empty sections are hidden. At most 12 public cards per page; bounded candidate scanning fills withdrawn/filtered holes, with next/first navigation. Server fallback order uses featured, stored reliability class, updatedAt and stable cluster identity. No frontend ranking/reliability engine was introduced.
- League filters use persisted league/match associations and dated ClubSeason memberships, with no guessed club league. Vietnamese time/relative labels use Asia/Ho_Chi_Minh; stored UTC and source DAY precision are preserved.
- Backend badge/certainty values render as green Official, blue Reliable, purple Community, amber Rumor and rose Disputed. M7/M8 restrictions on Social/Disputed publication remain unchanged. Independent count reuses reviewed M8/M7 lineage, not article/publisher count or engagement. Transfer roles/status remain conservative; no Transfer Center is built.
- Every card exposes source names and a source anchor. Details show all permitted original headlines/languages/dates/tiers/URLs, reusable licence, stored attribution/revision and change notice. Source links use safe HTTP(S), noreferrer/noopener, new-tab labels and unavailable-link fallback. No full source body, quote reconstruction, invented analysis or foreign-language substitution is exposed.
- Text/TLA/initial visuals require no copyrighted crest/photo or external image request. Mobile-first semantic headings, skip link, native controls, focus styles and loading/empty/pending/error/invalid states are included. Detail summaries distinguish AI assistance from deterministic extraction.
- Canonical/title/description/Open Graph metadata shares the same request-only checked result as HTML. Unavailable/private/error detail and list query variants are noindex; no cross-request permission cache. Next streaming can return an unavailable slug as HTTP 200 plus noindex after a loading boundary, rather than an early 404; private content remains absent.

### CODE VALIDATION

| Command/check | Result |
| --- | --- |
| `npm.cmd run lint` | PASS; zero warnings. |
| `npm.cmd run typecheck` | PASS; Next route types and strict TypeScript. |
| `npm.cmd test` | PASS; **347 tests / 18 files**, including **33 new tests**. |
| `npm.cmd run build` | PASS; Prisma Client generation and optimized Next.js production routes. |
| Schema/migrations | Unchanged; no migration/reset or data write required. |

New rendering tests cover unique canonical cards, source/independent counts, all five badge presentations, uncertainty, Vietnamese-only text, missing translation, source metadata/attribution/URL safety, filters, UTC+7/DAY precision, empty/loading/errors, invalid slugs, SEO, responsive semantic structure and extraction labeling. Disposable PGlite tests run all real migrations and the M6 → M8 → authorized test publication → M9 read flow; cover current rights, copied lineage, private citations, missing URLs blocked by DB constraints, pending/stale content, canonical drift, disputes, leagues, read idempotency and 13-cluster pagination/featured ordering. No live API or paid model is needed.

### Runtime and responsive evidence

- Production server on loopback port 3109: `/news` and both EPL/La Liga filter URLs HTTP 200 with correct honest empty state; invalid filter has Vietnamese feedback and noindex. `/matches` regression and `/api/health` both HTTP 200.
- Invalid slug and the real private cluster URL show Vietnamese unavailable UI and noindex, with **no private original headline leak**. The observed streamed HTTP status is 200 as documented above.
- Read-only Prisma audit: **62 matches, one Article, one cluster, zero published Articles, zero public stories, four disabled sources**. Before/after hashes of Articles/clusters plus evidence/run/revision counts match; existing source/AI/match data and draft states are preserved.
- Browser inspection confirms the real empty page, working La Liga navigation and visible keyboard focus after Tab. A separate, clearly marked, loopback-only deterministic fixture preview verifies populated mobile **390px** list → detail → evidence navigation, **768px** tablet and desktop layouts, badges, initials and no-image usability. Preview and audit scripts were removed and their servers stopped. No fixture was added to the configured database or production routes.
- **Live public detail smoke remains content-dependent**: the archived English Wikinews Article still lacks approved Vietnamese output/review/publication. It was not modified to clear a gate. A valid permitted published detail is exercised end-to-end through disposable SQL data and rendered components; repeat a real route smoke after an authorized editorial publication exists. No local API key or Docker daemon was accessed.

### File manifest

Created:

- `app/news/page.tsx`, `app/news/loading.tsx`, `app/news/error.tsx`, `app/news/[slug]/page.tsx`, `app/news/[slug]/not-found.tsx`.
- `components/sports-shell.tsx`; `components/news/news-shell.tsx`, `reliability-badge.tsx`, `news-state.tsx`, `news-filters.tsx`, `news-card.tsx`, `news-list.tsx`, `news-detail.tsx`, `news-loading.tsx`.
- `services/news-ui-data.ts`, `services/news-page-data.ts`, `services/news-sections.ts`; `lib/news-presentation.ts`; `types/news-ui.ts`.
- `tests/news-ui.test.tsx`, `tests/news-query.test.ts`, `tests/fixtures/news-ui.ts`; `docs/NEWS_UI.md`.

Changed: `app/page.tsx`, `components/matches/match-shell.tsx`, `services/story-clustering.ts`, `README.md`, `docs/PROGRESS.md`. Generated Next types/build output remain framework-managed and ignored where applicable. No `.env` or `.env.example` change; existing NEXT_PUBLIC_APP_URL supplies deployment canonical origin. Secret-file ignores remain intact; this workspace has no Git metadata for a commit/history audit.

Known limits: no current real published Vietnamese story; current M7/M8 factual-news policy still excludes Social/Disputed publication. No licensed image attachment exists, so images are omitted. Large-corpus batching/query-plan tuning, stable pagination under concurrent editorial updates, formal screen-reader audit and future publishing/admin workflow remain separate work. See [News UI runbook](NEWS_UI.md). Recommended next milestone: **Milestone 10 — Transfer Center**, only when requested.

## Historical decision — Milestone 8: GO

Updated: 2026-10-17 (Asia/Bangkok). **Milestone 8: GO.** News deduplication/story clustering only. Required schema/code checks, deterministic multi-source/SQL tests and real PostgreSQL singleton/repeat/preservation checks passed. No external API, AI model or paid provider was invoked. Milestone 9 is not started; earlier milestone decisions below remain historical.

### Architecture and behavior

- Added StoryClusteringService with separate candidate generation, explainable similarity/merge decisions and grounded canonicalization modules. No route, component, homepage, News UI or Transfer Center was built.
- Exact normalized URL/title bundles are established before near duplicates. Tracking parameters/fragments are removed for identity comparison; meaningful query/path/protocol differences remain. M5 URL ingestion deduplication and ArticleUrl records are unchanged.
- Near grouping combines title/event-word similarity, existing internal club/player/match/manager signals, story type, publication distance, transfer roles/stage, reviewed proposition and lineage metadata. Entity names are removed from event-word similarity. A common league, player or club alone cannot establish the same event. Different linked matches/players, transfer identities and explicit injury details are guarded.
- Pairwise compatibility prevents transitive A~B~C chains from joining unrelated endpoints. Stable ordering/tie-breaking and canonical JSON hashing make repeated inputs deterministic. Default windows: MATCH 36h, TRANSFER 96h, INJURY 48h, CONTRACT/FINANCIAL 72h, other types 48h. Actual configurable windows are retained in revisions.
- Default automatic transfer grouping separates interest, talks, bid, reported completion, confirmed completion and departure events. New source/processing revisions can split stages without losing prior cluster snapshots or evidence. A rumor Article never becomes confirmed because it shares a player/club or cluster with an official story.
- Canonical Vietnamese headline and summary are an exact paired copy from a currently eligible permitted member, selected by M7 label/evidence, recency and stable ID. Nothing translates, synthesizes prose, creates a quote/statistic or invents a fact. No eligible member means null canonical fields and no public candidate.
- Snapshots expose article count, permitted source count, independent credible origins, strongest evidence, best permitted label/certainty, type/entities, firstSeen/lastUpdated, transfer stages, disputed/featured state, eligibility, source links, fingerprints and decision factors. Reused the existing M7 independent-origin helper by exporting it; its policy is unchanged. Copied publishers/lineages count once. Two independent credible origins can strengthen evidence, never manufacture confirmation.
- M7 disputes and conservative opposed departure/proposition wording produce DISPUTED. Both sides remain stored; canonical text and public eligibility are blocked rather than silently choosing a factual winner. Explicit manual mixed-stage/type merges also remain ineligible until boundaries are resolved.
- Clustering does not grant source permission, editorial tier, Article publication status or factual authority. Restricted/hidden/source-usage-blocked members cannot lend canonical prose, public source links or permitted evidence. `current(clusterId)` refreshes M7/permission state, and `publicStoryCandidate` exposes one safe candidate per eligible cluster while omitting restricted/internal membership.
- Added audited backend merge, undoMerge, split and canonical/feature/dispute override readiness. Methods require an existing ADMIN and meaningful reason, pin editorial boundaries, preserve emptied clusters/history and reject stale undo. Canonical overrides select an eligible member's existing paired text. Published/referenced memberships and manual locks are protected. No production admin account, admin UI or public write endpoint was added.

### Additive schema and idempotency

Applied **20261017110000_story_clustering** safely. ArticleCluster gains manualOverrideAt/manualDisputed/featured; ArticleClusterRevision stores ordered snapshots, algorithm version and input hash with FK, uniqueness/check/index constraints. Existing Article.clusterId remains the sole membership link; there is no duplicate association table. Revision hashes are not globally unique, allowing a later undo to restore a former state as a new history entry.

Reconciliation is bounded (200 articles by default; explicit policy maximum 500), uses an advisory lock and permission/editorial row locks, includes full existing affected membership, performs no remote calls inside transactions, and fails atomically on oversized work. Original/generated fields and article content timestamps are not rewritten by membership changes. Current identical state adds no cluster or revision. Eight migrations are applied, with no schema drift; no reset/deletion occurred.

### CODE VALIDATION

| Command/check | Final result |
| --- | --- |
| `npx.cmd prisma format` / `validate` / `generate` | PASS. |
| `npm.cmd run db:migrate:deploy` | PASS; additive migration applied. |
| `npx.cmd prisma migrate status` | PASS; eight migrations current. |
| `npx.cmd prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` | PASS; no difference. |
| `npm.cmd run lint` | PASS; zero warnings. |
| `npm.cmd run typecheck` | PASS. |
| `npm.cmd test` | PASS; **314 tests across 16 files**, including **42 new clustering tests**. |
| `npm.cmd run build` | PASS; existing routes preserved, no News UI route added. |
| Real `npm.cmd run news:cluster` / repeat / `-- --since 24h` | PASS; one singleton cluster, revision 1; both repeats changed=false. |
| Fresh current projection / Prisma preservation assertions | PASS; details below. |

Tests cover exact-first grouping, normalized URL/title/source duplicates, near headlines, unrelated players/clubs/leagues/events, transfer role/stage differences, copied/independent origins, conflicts, time windows, permission revocation, untranslated drafts, grounded canonical pairs, changed source revisions, repeat/concurrent reconciliation, merge/undo/split/overrides, stale undo, role/reason checks, published membership protection and bounded-batch rollback. Fixtures exist only in tests/disposable PostgreSQL; no fake production news was inserted.

Tests exposed and fixed two defects: injury reports about different named body parts could overmerge on generic wording; and JSONB audit key reordering caused a valid undo hash to mismatch. Explicit injury-detail checks and stable recursive key hashing resolve those cases. Unused imports were removed to satisfy zero-warning lint; final full checks pass.

### Real runtime and data preservation

- Existing real Wikinews Article assigned to one cluster; no new source article, AI run, match or source was created.
- First CLI run created revision 1; repeated default and `--since 24h` runs returned changed=false/revision=1. A fresh current-service read also returned changed=false.
- Read-only Prisma/validated-snapshot assertions PASS: **62 matches**, **one Article**, **one M6 AIProcessingRun**, **one ArticleCluster**, **one cluster revision**, one URL identity, one permitted source, zero reviewed independent origins and four restricted official sources still disabled.
- Original title/excerpt/language/source URL still match the M6 input snapshot; CC BY 4.0 reuse metadata retained; Article remains DRAFT/NEEDS_REVIEW. Canonical headline/summary and the public candidate correctly remain absent because the English source lacks eligible Vietnamese processing/editorial review.
- The corpus contains only one real news article, so live database checks demonstrate singleton persistence/idempotency/permission safety. Multi-source behavior is verified by deterministic production-SQL integration tests, not claimed as a live multi-source ingestion run.
- Temporary diagnostic script removed. No key inspection/logging, Docker operation, ExecutionPolicy change, external request or quota use occurred.

### Files and environment

Created:

- `types/story-clustering.ts`
- `services/story-similarity.ts`
- `services/story-canonicalization.ts`
- `services/story-clustering.ts`
- `scripts/cluster-news.ts`
- `tests/fixtures/clustering.ts`
- `tests/story-clustering.test.ts`
- `tests/story-clustering-store.test.ts`
- `prisma/migrations/20261017110000_story_clustering/migration.sql`
- `docs/STORY_CLUSTERING.md`

Changed: `prisma/schema.prisma`, `package.json` (news:cluster command), `services/reliability-engine.ts` (existing helper export only), `README.md`, `docs/PROGRESS.md`. No new dependency, environment variable or API key is needed; DATABASE_URL remains required. Product/roadmap/prompt/workflow source documents and working match/news/AI adapters remain unchanged. No Git metadata is present, so no commit/diff audit is claimed.

### Limitations and next milestone

Deterministic lexical/entity rules are conservative and cannot resolve every paraphrase, cross-language match or contradiction. Origin lineage and official authority still rely on reviewed M7 metadata. Manager identity remains a limited exact-mention signal, not a new domain entity. Bounded workloads can require a narrower selection/deliberate policy adjustment; no paginated corpus worker or scheduler was built. Manual APIs are server-side readiness only; future callers must use authenticated actor identity. Historical snapshots do not supersede current permission/retention gates. Existing fallback cannot translate the archived English article, so no production canonical story was fabricated.

Recommended next milestone: **Milestone 9 — News UI**, only on a new user instruction. Stop at M8.

## Current decision — Milestone 7: GO

Updated: 2026-10-17 (Asia/Bangkok). **Milestone 7: GO.** Reliability Engine only. Required schema/code validations, deterministic policy/SQL tests and real PostgreSQL assessment/rerun checks pass. No live AI, news or sports-provider request was needed. Milestone 8 is not started. Earlier decisions below remain historical.

### Architecture and rules

- Added pure, deterministic ReliabilityEngine and a current-data ReliabilityService/CLI. Source reliability, evidence strength, story certainty, permission, publication classification and freshness are separate outputs; there is no combined truth percentage or engagement-based factual score.
- Source tiers: TIER_0_OFFICIAL, TIER_1_HIGH, TIER_2_ESTABLISHED, TIER_3_UNVERIFIED, COMMUNITY. Existing sources conservatively default to unverified; the migration grants no trust, scope, permissions or enablement. Existing score/rationale/reviewer/reviewedAt, language/country and permission fields are reused. Reviewed tier/authority configuration remains a manual operator prerequisite for eligible stories.
- Existing OFFICIAL/RELIABLE/SOCIAL/RUMOR classes are reused, with CONFIRMED/HIGH_CONFIDENCE/REPORTED/POSSIBLE/SPECULATIVE/DISPUTED certainty. DISPUTED is a separate badge flag; Vietnamese labels and structured explanation metadata are ready for M9, without building UI.
- ClaimEvidence receives reviewed kind/stance/proposition/lineage/authority/correction metadata. Evidence strengths are DIRECT/STRONG/SUPPORTING/WEAK/SOCIAL_ONLY. Official statements require reviewed source authority scoped to an actual linked internal entity. A publisher URL must match its registered domain. A score, official flag or AI assertion cannot independently grant confirmation.
- Transfer confirmation requires explicit completed-signing wording, new grounded processing where needed, and reviewed scoped authoritative evidence. Credible active talks/interest remain NEGOTIATION/INTEREST; speculation remains RUMOR. Existing uncertain originals/Vietnamese wording cannot silently become confirmed because another source repeats them.
- Common publisher and declared origin lineages are combined transitively; syndicated copies count once. Only reviewed credible, declared origins can strengthen corroboration. Multiple weak sources or engagement do not confirm facts. Social/community-only evidence remains SOCIAL_ONLY and cannot pass the factual-news gate.
- Reviewed contradictions produce DISPUTED and retain both sides. A newer, scoped official correction may supersede a prior same-proposition record, but never deletes it or the prior assessment. An official denial disputes the original report rather than silently confirming it.
- Structured match evidence is restricted to an exact FINISHED mapped Match score tuple, explicit match link and matching reviewed/source claim. It cannot confirm injury, transfer or unrelated news. No football-data.org-specific rule is embedded in the engine.
- Permission/licence and freshness are independent of source quality. Usage denial can block an otherwise official/reliable story; age changes ageHours/bucket, not source score. Supported reusable text licence/attribution/revision evidence remains mandatory. Four restricted official website adapters remain disabled.
- Eligibility requires current validated M6 processing, Vietnamese headline/summary, source URLs/date/type, approved tier, reviewed exact-span evidence for each generated field and no conflict/invalid correction/certainty upgrade/editorial lock. Stored AI output is revalidated; JSON/model publishability claims are not trusted authority.
- Strictly validated decisions are recorded in ReliabilityAssessment, keyed by Article/input hash/policy version. Source/rights/evidence/processing changes create revisions; unchanged inputs are cached for persistence but freshly evaluated for current time/permissions. Only draft legacy reliabilityClass/source-score snapshots may update. Originals, generated text, AI records, evidence and publication/processing status are preserved.
- No publication operation, READY promotion, public write endpoint, admin UI, clustering, Transfer Center, social ingestion, highlights, Morning Brief or notifications were added. A future publishing transaction must enforce the current gate; a historical eligible assessment is not a durable publication token.

### Additive schema and environment

Applied **20261017100000_reliability_engine** safely: two NewsSource configuration fields, eight ClaimEvidence metadata fields, self-correction FK/checks/index, and versioned ReliabilityAssessment history with Article FK and uniqueness/indexes. Existing M2/M5/M6 models and constraints are retained; no data reset or destructive update. Seven migrations are current, with no schema drift.

No new dependencies, environment variables, API keys or paid provider. DATABASE_URL remains required for operational commands. No secret inspection/logging, Docker operation or ExecutionPolicy change was performed. Source scores are not hard-coded into frontend components.

### Real database verification

- `npm.cmd run reliability:assess -- batch 1` evaluated the existing real licensed Wikinews Article; identical finalized-policy rerun returned cached=true.
- Finalized policy **reliability-v1.0.0** has exactly one decision for the unchanged input. An earlier development `reliability-v1` smoke snapshot is retained as separate historical evidence, not deleted or reused as the finalized decision.
- Current decision is conservatively RUMOR/unverified, SPECULATIVE, WEAK, eligible=false, with explicit blockers REVIEWED_EVIDENCE_REQUIRED, SOURCE_TIER_REQUIRES_REVIEW, VIETNAMESE_REQUIRED. This is not a claim that the archived event is false: the source tier and translation/evidence review are not approved. No production trust configuration or translation was invented to clear these gates.
- Read-only Prisma assertions PASS: **62 matches**, **one Article**, **one M6 AIProcessingRun**, one finalized-policy assessment, originals matching the M6 input snapshot, CC BY 4.0 reuse retained, Vietnamese fields absent, DRAFT/NEEDS_REVIEW preserved, **four restricted official sources disabled**. Temporary diagnostic script removed.

### CODE VALIDATION

| Command/check | Final result |
| --- | --- |
| `npx.cmd prisma format` / `validate` / `generate` | PASS. |
| `npm.cmd run db:migrate:deploy` | PASS; additive migration applied. |
| `npx.cmd prisma migrate status` | PASS; seven migrations current. |
| `npx.cmd prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` | PASS; no difference. |
| `npm.cmd run lint` | PASS; zero warnings. |
| `npm.cmd run typecheck` | PASS. |
| `npm.cmd test` | PASS; **272 tests across 14 files**, including **46 new reliability tests**. |
| `npm.cmd run build` | PASS; existing routes preserved. |
| Real finalized-policy CLI assessment / repeat / preservation assertions | PASS, as detailed above. |

Tests cover official/scoped/out-of-scope announcements; trusted-media interest and negotiations; weak/anonymous reports; uncertainty wording and rumor invariants; new official revision confirmation; social engagement and social-source laundering; copied and independent origins; permissions/licences; freshness; conflicts/denials/corrections; registered-domain provenance; mapped match domain boundaries; processing staleness/malformed JSON; missing fields; manual overrides; idempotent SQL persistence and SQL review/correction constraints. All fixtures are deterministic and test-only. No test calls a live provider or the configured production database.

The first regression attempt exposed an implicit-any annotation in a newly added test callback; it was fixed. The final complete suite, typecheck and production build all pass.

### Files

Created:

- `types/reliability.ts`
- `services/reliability-engine.ts`
- `services/reliability-service.ts`
- `scripts/assess-reliability.ts`
- `tests/fixtures/reliability.ts`
- `tests/reliability-engine.test.ts`
- `tests/reliability-service.test.ts`
- `prisma/migrations/20261017100000_reliability_engine/migration.sql`
- `docs/RELIABILITY.md`

Changed: `prisma/schema.prisma`, `package.json` (reliability:assess command), `README.md`, `docs/PROGRESS.md`. No working application route/component, source provider, AI pipeline or product/roadmap/workflow source document was rewritten. Git metadata remains absent in this workspace, so no Git diff/commit-history audit is claimed.

### Limitations and next milestone

The engine relies on explicit trusted operator review for authority, proposition relationship and originating lineages; it cannot prove full semantic entailment or automatically discover every copied report. Existing source tiers/authority scopes and claims need review via database tooling until the later authenticated admin workflow exists. M6 fallback cannot translate the archived English draft. Manual overrides require an explicit future audited workflow. The gate is a backend eligibility service, not a publishing endpoint or continuous revocation service. The runbook documents these boundaries and current-data gate usage.

Recommended next milestone: **Milestone 8 — News Deduplication**, only after new user authorization. Stop at M7.

## Current decision — Milestone 6: GO

Updated: 2026-10-17 (Asia/Bangkok). **Milestone 6: GO.** Scope is AI Processing Pipeline only. The owner's free-first instructions supersede the older plan's mandatory real-AI integration wording: deterministic providers may validate architecture without a paid/live model. All required code checks and real PostgreSQL fallback/idempotency checks passed. Milestone 7 is not started. Earlier milestone decisions below are historical records.

### Implementation and gates

- Added AIProvider and future LocalAIProvider contract; RuleBasedFallbackProvider is the default. Optional RemoteAIProvider uses an explicitly documented vendor-neutral HTTPS JSON gateway, with no mandatory vendor, SDK, package or paid account.
- Pipeline: persisted licensed Article → language/alias/entity classification → bounded provider invocation → strict structured validation/evidence/uncertainty checks → atomic versioned run, Vietnamese fields, source-provided Quote and ClaimEvidence/ArticleEntity persistence. No browser processing endpoint or external news/match-provider call was added.
- Original title/excerpt/body/language/source URL/publishedAt are preserved. Exact permitted input and licence/attribution/revision/requested-provider provenance are snapshotted. Actual fallback provider/model, safe failure, versions, input hash, processedAt and validation outcome are recorded separately.
- Fourteen requested story types, plus nullable BANTER/MEME/CONTROVERSY subtypes. Conservative matching uses existing canonical entity UUIDs, names/aliases/TLA and explicit internal match slugs; it creates no new clubs/players/mappings. Managers have no M2 table, so grounded mentions remain structured run metadata. Transfer/injury extraction is preparation only; no Transfer Center records/UI are created.
- Evidence spans, number/date tokens, known names, quote/URL restrictions, controlled structured fields, uncertainty and obvious source prompt-injection checks run before trusting output. Missing/unsupported licences, source rights, URL/date/content, or manual overrides gate processing before provider invocation. Permission/input/manual state is rechecked at commit. AI cannot assert its own authority or confirm a rumor.
- All outputs remain **DRAFT / NEEDS_REVIEW**, even if the model requests publication. Review-required is the existing schema's REVIEW_REQUIRED equivalent. No reliability label, READY or publication transition is introduced before M7.
- Fallback copies only already-Vietnamese unquoted input. It does not translate English/Spanish, and records TRANSLATION_REQUIRED with null Vietnamese fields. Unsupported local/missing remote configuration reports fallback explicitly. Natural Vietnamese generation is exercised by deterministic test providers, not claimed as real production translation.
- SHA-256/version idempotency prevents repeated calls/evidence/associations for unchanged inputs; source changes create revisions without deleting evidence. Database row locks claim work; remote calls run outside transactions. Two-minute stale-run recovery and attempt ownership protect resumed work. Retries require an explicit flag, cap at three attempts and reuse the run. No automatic paid/network retry; default timeout 15 seconds, response cap 64 KiB, input cap 10,000 characters, batch size 1–50 with sequential CLI calls.

### Schema and commands

Applied additive migration **20261016130000_ai_story_types**, adding only COMMUNITY and OTHER to StoryType. All pre-existing enums/records, legacy SOCIAL values, publication constraints and evidence history are retained. Six migrations are applied; Prisma schema diff reports no difference. No reset or destructive migration was used.

New command: `npm.cmd run ai:process -- batch 10` or `article <uuid>`, optionally `--retry-failed`. Required environment remains DATABASE_URL. Optional server-only configuration: AI_PROVIDER (default fallback), AI_ENDPOINT, AI_MODEL, AI_API_KEY. Legacy OPENAI_API_KEY does not implicitly choose a vendor. No local secrets or production provider keys were inspected, logged, changed or requested; no Docker/ExecutionPolicy operation occurred.

### Real PostgreSQL fallback validation

- Ran `npm.cmd run ai:process -- batch 1` against the existing real permitted Wikinews article, in explicit fallback mode.
- Actual provider RULE_BASED, model extractive-v1; NEEDS_REVIEW, publishable=false; titleVi/summaryVi remain null for the English source. This is **not** represented as a live AI translation.
- Identical rerun returned cached and retained exactly **one AIProcessingRun**. A read-only Prisma check verified original headline/excerpt/language/URL match the input snapshot, publicationStatus DRAFT, **62 matches**, **one article**, and **four disabled official sources**. Temporary diagnostic script was removed.
- OPTIONAL LIVE AI VALIDATION: not performed; runtime is configured for fallback. No model quota was consumed. An approved compatible remote gateway can be smoke-tested with a single-article CLI call; instructions are in AI_PROCESSING.md. Optional live AI access is not a code acceptance blocker under the owner's current instructions.

### Files

Created:

- `types/ai-provider.ts`
- `providers/ai/schema.ts`, `rules.ts`, `fallback.ts`, `remote.ts`, `validation.ts`
- `services/ai-store.ts`, `services/ai-processing.ts`
- `lib/ai-runtime.ts`
- `scripts/process-articles.ts`
- `tests/fixtures/ai.ts`, `tests/ai-provider.test.ts`, `tests/ai-processing.test.ts`
- `prisma/migrations/20261016130000_ai_story_types/migration.sql`
- `docs/AI_PROCESSING.md`

Changed: `.env.example`, `package.json`, `prisma/schema.prisma`, `lib/config.ts`, `lib/logging.ts`, `README.md`, `docs/PROGRESS.md`. No product/roadmap/workflow source document or working route/component/provider was rewritten. No dependencies were added. This workspace lacks Git metadata, so no commit/history audit or Git diff is available.

### CODE VALIDATION

| Command/check | Final result |
| --- | --- |
| `npx.cmd prisma format` / `validate` / `generate` | PASS. |
| `npm.cmd run db:migrate:deploy` | PASS; additive StoryType migration applied. |
| `npx.cmd prisma migrate status` | PASS; six migrations up to date. |
| `npx.cmd prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` | PASS; no difference. |
| `npm.cmd run lint` | PASS; zero warnings. |
| `npm.cmd run typecheck` | PASS. |
| `npm.cmd test` | PASS; **226 tests across 12 files**, including **60 new AI tests**. |
| `npm.cmd run build` | PASS; unchanged match/health routes built successfully with no AI key requirement. |
| `npm.cmd run ai:process -- batch 1` | PASS; real licensed persisted Article processed by fallback and kept unpublished. |
| Same command rerun / read-only Prisma assertions | PASS; cached, one run, preserved originals, 62 matches, one Article, four restricted sources disabled. |
| OPTIONAL LIVE AI VALIDATION | Not performed; fallback is configured. No live model or paid access required for code acceptance. |

Tests cover English/Spanish → Vietnamese through deterministic providers; already-Vietnamese copy; uncertainty/rumor; transfer/injury extraction; missing/unsupported/malformed output; fabricated score/statistic/contract/injury/statement/name/quote/evidence; URL/source/licence gating; alias ambiguity; idempotency/revisions; provider timeout/failure/fallback; concurrent claims/stale recovery; manual overrides and source/input changes during processing. Production data is never used as synthetic test input.

### Limitations and next milestone

The fallback cannot translate foreign-language input. The optional adapter requires the documented gateway protocol, not an arbitrary vendor endpoint. Exact-span/numeric/name checks cannot prove full semantic equivalence or detect every injection; every result requires review and the later reliability gate. M6 does not automatically grant AUTHORITATIVE/CONFIRMED transfer status. Manual batch selection scans oldest drafts; use explicit Article IDs beyond the batch window. No scheduler, token-priced paid SDK, heavy local model, semantic clustering, news UI, Transfer Center, community ingestion or publication engine was added.

Recommended next milestone: **Milestone 7 — Reliability Engine**, only after a new user instruction. Stop at M6.

## Current decision — Milestone 5: GO

Updated: 2026-10-16 (Asia/Bangkok). **Milestone 5: GO.** The owner's latest instruction explicitly replaces the earlier live-source-count gate with acceptance of at least one real permitted Wikimedia/Wikinews article. That condition and all code checks now pass. Premier League, LaLiga, Liverpool and Barcelona website adapters remain disabled. Earlier pending-permission notes below are historical and superseded for Milestone 5 acceptance; their source-specific restrictions still apply. Milestone 6 was not started.

### Reusable source and licensing

Reviewed the current repository, all project/workflow documents, news model/services/adapters/tests and primary Wikimedia/Creative Commons documentation. Reused the Postgres best-practices skill for the additive migration. No paid provider or new dependency was added. No MatchProvider change, Docker operation, ExecutionPolicy change or key inspection was needed.

Added WikinewsNewsProvider using the public English MediaWiki Action API, selected through the existing NewsProvider composition root. The centralized query targets Published English Premier League/LaLiga/club reporting, including relevant club stories outside match-report categories. It does not promise comprehensive or daily coverage.

The adapter programmatically verifies API siteinfo.rightsinfo and the machine-returned published copyright policy; checks a known licence URL/name and the dated policy scope; requires a valid publication day after 2024-12-16; and rejects missing, unsupported, changed or conflicting rights. Older articles are deliberately excluded rather than given the current site's licence blindly. It retains immutable policy/article revision URLs and attribution including Wikinews credit, title/source/history/revision, CC BY 4.0 link and modification notice.

Only a short unquoted lead is eligible. Quoted paragraphs, media/captions, embeds, reference/source lists and explicit rights exceptions are excluded; no third-party linked page or image is fetched. Full body/raw HTML is never persisted. Original language/publication day is retained; UTC-midnight dates carry publishedAtPrecision=DAY rather than an invented exact clock time. The ingested record remains DRAFT; no translation, AI, story classification, publication or reliability engine ran.

Source settings verified in PostgreSQL: enabled=true, termsReviewed=true, permissionStatus=ALLOWED, ingestionAllowed=true, requiresReusableLicense=true, commercialReuseAllowed=true after a verified commit. Wikinews is PUBLICATION/official=false, with editable baseline source score 80. Public licensing does not enable any of the four restricted sources. Source disablement/operator edits survive re-registration.

Configured the owner's supplied contact-bearing User-Agent only in ignored local `.env` using WIKIMEDIA_USER_AGENT. Tracked `.env.example` has a blank placeholder. It is optional for builds and required before live API calls; no API key is needed. Requests are sequential, use maxlag=5 and persisted two-second spacing, honour 429/Retry-After/maxlag cooldowns, and have bounded size/time/retries. Successful snapshots retain the six-hour source cache.

### Real live acceptance evidence

- One real article ingested: [Man starts car collision at Liverpool FC trophy parade](https://en.wikinews.org/wiki/Man_starts_car_collision_at_Liverpool_FC_trophy_parade).
- Published **2025-06-01**, precision DAY; language en; licence **CC BY 4.0**, URL `https://creativecommons.org/licenses/by/4.0/`.
- Attribution, short permitted excerpt and verification timestamp persisted. Full body absent; publicationStatus DRAFT. This is archived reporting, not represented as current news.
- Immutable [article revision 4878949](https://en.wikinews.org/w/index.php?oldid=4878949) and [policy revision 4991371](https://en.wikinews.org/w/index.php?oldid=4991371) persisted.
- Successful one-article live run: created=1, duplicates=0, rejected=0, conflicts=0, processed=1.
- Replayed the actual persisted licensed record through production sync/Prisma SQL, without synthetic content or new upstream calls: created=0, duplicates=1, rejected=0, conflicts=0; total remains **one article**.
- Standard `npm.cmd run news:sync -- smoke`: PASS, wikinews-en cached, licensedArticles=1, cachedVerification=true. This final command verified persisted evidence and is not claimed as another fresh API run.
- The original **62 matches** remain intact; four official website candidates remain disabled. Temporary diagnostic script removed.

The successful fresh one-article request sequence consisted of discovery/rights, policy and article revision (three sequential API calls). Earlier bounded investigation runs also occurred. They exposed two real defects: Prisma cannot deserialize the void return from `pg_advisory_xact_lock`, fixed by returning a scalar from the lock query; and a category check incorrectly rejected “Articles not disputed”, fixed with explicit negative-category matches and a regression fixture. Query scope was also corrected to include legitimate club stories without a football-category tag. No licensing, technical-access or quota restriction was bypassed to close acceptance.

### Schema and final checks

Applied transactional additive migration **20261016120000_news_reuse_license**: source permission-status enum/reusable-content flags; article licence/attribution/evidence/revision/verification fields and publication precision; checks for complete commercial-reuse evidence and valid precision. Existing explicit approvals are preserved, no new league/club permission is granted, and no data reset/deletion occurs. There are five migrations; schema diff has no drift.

| Command/check | Final result |
| --- | --- |
| Prisma format / validate / generate | PASS. |
| `npm.cmd run db:migrate:deploy` | PASS, additive migration applied. |
| `npx.cmd prisma migrate status` | PASS, five migrations up to date. |
| `npx.cmd prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` | PASS, no difference. |
| `npm.cmd run lint` | PASS, zero warnings. |
| `npm.cmd run typecheck` | PASS. |
| `npm.cmd test` | PASS, **166 tests across 10 files**, including 20 added licensing/adapter/SQL cases. |
| `npm.cmd run build` | PASS. |
| Live Wikinews API → normalization → Prisma/PostgreSQL | PASS, one real licensed article as detailed above. |
| Real-record SQL replay / cached CLI smoke | PASS; persisted count stays one. |
| Temporary production server / regression checks | PASS; `/api/health` HTTP 200 app/database up, `/matches` HTTP 200. Server stopped after checks. |

Tests cover license parsing, attribution, missing/unsupported/mismatched rights, policy drift, older dates, publication precision, quoted/media exclusion, User-Agent enforcement, malformed JSON/query/parse responses, maxlag/429/503 handling, licensed adapter-to-SQL idempotency and missing-licence persistence rejection. Existing tests remain passing. No dependency was added; earlier documented development-tool advisories remain outside this extension.

Created: `providers/wikimedia/config.ts`, `http.ts`, `normalization.ts`, `provider.ts`; `lib/news-licenses.ts`; `tests/fixtures/wikinews.ts`; `tests/wikinews.test.ts`; `prisma/migrations/20261016120000_news_reuse_license/migration.sql`; `docs/WIKIMEDIA_NEWS.md`.

Changed: `prisma/schema.prisma`, `types/news-provider.ts`, `providers/news/errors.ts`, `normalization.ts`, `sources.ts`, `services/news-store.ts`, `services/news-sync.ts`, `lib/news-runtime.ts`, `lib/config.ts`, `scripts/sync-news.ts`, `tests/fixtures/news.ts`, `tests/news-sync.test.ts`, `.env.example`, README, provider documentation, DATA_MODEL/NEWS_INGESTION/PROGRESS docs. Local ignored `.env` received only the requested identification setting. No package/lockfile changes in this extension.

Runbook: [WIKIMEDIA_NEWS.md](WIKIMEDIA_NEWS.md). Additional sources still require their own permissions/compatibility checks. Future news UI must retain attribution/licence and reflect historical freshness. The next milestone is Milestone 6 only after the operator's separate provider/model decision and explicit request. **Stop after Milestone 5.**

## Current delivery — Milestone 5: Code validated; live acceptance pending permissions

Updated: 2026-10-16 (Asia/Bangkok). **Partially completed: infrastructure implemented and code validation PASS. Milestone 5 is not GO.** The operator explicitly confirmed: “No permissions yet; keep restricted sources disabled.” All four official news candidates remain disabled. The outstanding gate is permitted live-source validation, not database connectivity, a missing paid API key or a test/build failure. Milestone 6 was not started. Earlier milestones' recorded acceptance evidence is preserved below.

### Inspection and implementation

Read PRODUCT_SPEC.md, CODEX_PLAN.md, CODEX_PROMPTS.md, CODEX_WORKFLOW.md and this progress history, plus the user's latest attached Milestone 5 request. Inspected routes, Prisma/migrations, source/article/job/status models, match sync/SQL helpers, tests, scripts and environment conventions before coding. Applied the supabase-postgres-best-practices skill and read installed Next.js documentation. There is still no Git metadata; no branch/commit/merge or committed-history secret audit is claimed.

- NewsProvider.fetchLatestArticles exposes a normalized article page, bounded metadata limit and conditional-request cursor. Services depend on the interface; adapter selection belongs to lib/news-runtime.ts. OfficialNewsProvider provides isolated Premier League, LaLiga, Liverpool FC and FC Barcelona configurations with shared RSS/Atom and HTML/JSON-LD parsing strategies. These are tested candidate adapters; their current live layouts have not been accepted.
- Data-driven NewsSource registry supports enable/disable, type, language/country, official status, configurable baseline reliability, review/access fields and ingestion method. New sources initialize disabled with zero excerpt allowance; registry reruns preserve operator edits. Restricted media feeds are not registered. No paid news API is used.
- Before any provider request, source enablement and reviewed permission are mandatory. A DB CHECK enforces reviewer/date/reference for ingestionAllowed; permission, method and excerpt scope are checked again under a row lock before commit. No bypass flag exists. The user has not supplied production reuse permission for any source.
- Normalization preserves original headline/language/URL and UTC dates, using null for missing/ambiguous publication time. Storage is metadata-only, with no full bodies, raw payloads, images, article-page fan-out, translation or summaries. Missing date/excerpt yields NEEDS_REVIEW; every new record is DRAFT with no story/reliability classification. Canonical is taken only from item-level metadata; DB identity uses sourceUrl when no canonical is declared.
- Exact URL aliases, parameterized transactional SQL and an advisory lock prevent source/canonical crossover duplicates and keep original UUIDs. Conflicting existing identities are flagged, never automatically merged/deleted. Partial reruns preserve good values and all manual/processed/published content; only missing metadata on unprocessed drafts can be filled.
- JobRun and per-source ProviderStatus track attempts, processed/created/duplicate/rejected/conflict counts and safe failures independently. Five-minute leases prevent overlapping runs. Successful snapshots cache for six hours; failures/partial results have a five-minute retry delay. Conditional ETag/Last-Modified avoids refetching unchanged content. 429 records a persisted cooldown. Requests/body reads have bounded time/size, one transient retry, robots checks, crawl delay and no redirect/auth/technical-block bypass.
- Simple CLI supports `sources`, `all`, `source <slug>`, `smoke`. No framework, scheduler, public write API or news UI was added. The existing homepage's key-based news setup indicator was corrected to state that source configuration needs no API key. Shared SQL transaction interfaces were extracted without changing match behavior; match-store reexports remain compatible.

### Source rights decision and live gate

Reviewed primary [Premier League terms](https://www.premierleague.com/en/terms-and-conditions) and [LaLiga terms](https://www.laliga.com/en-GB/legal/legal-web): they do not grant this project's production database/reuse rights. The former explicitly restricts database reuse/deep links without approval; the latter limits use to personal/non-commercial purposes. Liverpool/Barcelona permission remains unconfirmed. Public availability/official status is not a licence. Candidate listings were inspected for source review, but no automated news ingestion request was made. BBC/Guardian and other restricted-media feeds are not treated as unrestricted production dependencies.

**Initial enabled sources: zero.** The local database contains four disabled official candidate registry entries, zero articles, and the original **62 matches**. No synthetic article was inserted into the configured database. All news fixture persistence tests run in disposable PGlite. The CLI smoke returned four DISABLED skips and nonzero “Live news ingestion NOT verified,” exactly as required by the permission gate. This is not a successful live news smoke and is not attributed to environment isolation.

After appropriate access/reuse rights are established, configure the reviewed scope and verify the selected live adapter against a permitted source sample, run minimal smoke, inspect real article/provenance/alias persistence and verify a subsequent interval's rerun. Keep sources disabled until then. Required fields, commands and restrictions are documented in [NEWS_INGESTION.md](NEWS_INGESTION.md); no permission to obtain licences or contact publishers was inferred.

### Schema and migration

Applied additive transactional migration **20261016110000_news_ingestion**, preserving existing data:

- NewsIngestionMethod enum and NewsSource slug/language/country/official/termsReviewed/ingestionAllowed/permissionReference/maxExcerptChars fields: source identity and explicit rights/configuration gates; existing type remains sourceType. Existing rows default to no permission.
- Nullable Article.publishedAt: represent missing dates honestly; a new CHECK continues to require publication time for published articles. Existing publication/evidence checks/triggers remain intact.
- ArticleUrl with unique URL, restricted Article FK and reverse index: prevent source/canonical cross-column duplicates and preserve later aliases. Existing URL identity backfill aborts atomically on legacy conflicts rather than deleting or merging records.

No reset, db push or destructive migration. Before changes: 62 matches, 0 sources, 0 articles. After registration/CLI checks: 62 matches, 4 disabled sources, 0 articles. Prisma migration status is up to date with four migrations; live schema diff reports no difference.

### Executed validation

| Command/check | Actual result |
| --- | --- |
| `npx.cmd prisma format` | PASS. |
| `npx.cmd prisma validate` | PASS. |
| `npx.cmd prisma generate` | PASS, also regenerated by production build. |
| `npm.cmd run db:check` | PASS; existing PostgreSQL reachable through Prisma. |
| `npm.cmd run db:migrate:deploy` | PASS; additive migration applied without reset. |
| `npx.cmd prisma migrate status` | PASS; four migrations, up to date. |
| `npx.cmd prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` | PASS; no drift. |
| `npm.cmd run lint` | PASS, zero warnings. |
| `npm.cmd run typecheck` | PASS. |
| `npm.cmd test` | PASS, **146 tests across 9 files**, including **47 new news test cases**. An intermediate fixture permission-reference mismatch was fixed; the final suite was rerun successfully. |
| `npm.cmd run build` | PASS; no new public news route or API dependency. |
| `npm.cmd audit --omit=dev` | PASS; zero runtime vulnerabilities. Installation reports the same five previously documented high development-tool advisories; no forced downgrade applied. |
| `npm.cmd run news:sync -- sources` | PASS; registers/lists four disabled official candidates. |
| `npm.cmd run news:sync -- all` | PASS; four safe disabled skips, no source requests. |
| `npm.cmd run news:sync -- source premier-league` | Expected nonzero: DISABLED; no source request. |
| `npm.cmd run news:sync -- smoke` | Expected nonzero: all sources disabled, live ingestion NOT verified. Permission/live acceptance remains pending. |
| Production server / regression HTTP checks | Startup PASS; `/api/health` HTTP 200, app/database up; `/matches` HTTP 200; existing match APIs return 30 PL and 32 LaLiga matches. Temporary server stopped. |
| Read-only DB counts | 62 matches, four sources, zero articles; temporary count script removed. |

New offline tests cover RSS/Atom normalization and namespaces, HTML/JSON-LD and each candidate configuration, original UTC publication dates, null/ambiguous dates, permitted excerpt bounds/full-body exclusion, canonical/tracking URL behavior, malformed/unsafe/partial feeds, layout drift, disabled/unreviewed gates, robots/HTTP blocks/429, timeout including body reads, bounded network/5xx retries, 304 validators, oversized responses, real SQL idempotency and aliases, canonical conflicts, missing-data drafts, editorial preservation, one-source failure isolation, registry metadata preservation, DB permission checks, commit-time revocation, leases/cache, cooldown persistence and invalid-batch rollback. Tests never require public internet or the configured database.

The first sandboxed package fetch stalled and was stopped. Automatic review initially rejected the network-enabled parser installation based on the earlier Milestone 4-only scope; resubmission cited the user's current attached Milestone 5 request and was approved. Installation and runtime audit then succeeded. No unresolved approval block remains.

### File inventory

Created:

- `types/news-provider.ts`.
- `providers/news/sources.ts`, `errors.ts`, `normalization.ts`, `parsers.ts`, `http.ts`, `provider.ts`.
- `lib/sync-database.ts`, `lib/news-runtime.ts`.
- `services/news-store.ts`, `services/news-sync.ts`.
- `scripts/sync-news.ts`.
- `tests/fixtures/news.ts`, `tests/news-provider.test.ts`, `tests/news-sync.test.ts`.
- `prisma/migrations/20261016110000_news_ingestion/migration.sql`.
- `docs/NEWS_INGESTION.md`.

Changed: `prisma/schema.prisma`, `services/match-store.ts`, `package.json`, `package-lock.json`, `app/page.tsx`, `.env.example` (clarification only), `README.md`, `docs/DATA_MODEL.md`, `docs/PROGRESS.md`, `providers/README.md`, `services/README.md`.

Added `news:sync` only; existing scripts remain intact. Runtime dependencies: cheerio, fast-xml-parser, robots-parser (lockfile updated). No environment variable names or credentials added; DATABASE_URL is required and NEWS_API_KEY is not used by this ingestion path. Existing secret-file ignore rules remain intact. No local key inspection/logging, Docker access, ExecutionPolicy change, production deployment or commits occurred.

### Remaining limitations and next milestone

Milestone 5 requires permitted real-source ingestion and rerun evidence before GO. Current fixtures do not prove live layouts, availability or rights. Only the latest bounded snapshot is read; no historical backfill/pagination crawler or automatic retention job. Canonicals are restricted to the configured source host; broader cross-domain syndication needs explicit policy. Rights requiring storage/retention/attribution beyond current capabilities must stay disabled. No full Reliability Engine, clustering, transfer extraction, video/social or AI processing was implemented.

Recommended next work: resolve **Milestone 5 source permission/live acceptance** first. Then **Milestone 6 — AI Processing**, only after operator GO, Workflow Gate C's model/provider decision and an explicit new request. Stop here; no Milestone 6 work.

## Current delivery — Milestone 4: Completed, ready for GO review

Updated: 2026-10-16 (Asia/Bangkok). **Implementation and required code/runtime checks PASS.** Milestones 1–3 remain GO. Operator acceptance follows CODEX_WORKFLOW.md; no later milestone was started.

### Inspection and scope

Read PRODUCT_SPEC.md, CODEX_PLAN.md, CODEX_PROMPTS.md, CODEX_WORKFLOW.md and this progress history before changes. Inspected the existing Next.js routes/layout/components, normalized Prisma Match/Club/Season/events/stats models, read APIs and match query service. The repository had working persisted-data queries and no match UI routes. Read the installed Next.js page, Link, client-boundary and notFound documentation before coding. Git metadata is absent, so branch/diff/history verification is unavailable.

Implemented only match list/detail presentation. No provider request, sync, Docker operation, API-key inspection, production mock, new dependency, database write, schema/migration, environment change or future content feature was needed. Tests use test-only fixtures; production rendering uses the existing PostgreSQL database.

### Delivered behavior

- `/matches`: Vietnamese league/date/status controls, local-day grouping, 50-row pagination with total count, compact cards showing competition/round, teams/short names/TLA, kickoff, stored status, available score and update time. All-leagues scope is restricted to Premier League and La Liga. Filters are shareable GET parameters; invalid/unknown/repeated filters show a recoverable state.
- `/match/[slug]`: validated internal slug lookup, competition/season/round, full team names plus short names/TLA, score/status, kickoff/venue/update metadata and source attribution. Existing event/stat rows render only when supplied by the database; absent advanced data is omitted. No fabricated possession, xG, lineups, cards or player statistics.
- Existing query-service access is reused by Server Components; the browser never imports the MatchProvider or fetches the upstream provider. Public competition names/slugs moved into neutral configuration reused by the adapter. Existing API date semantics remain UTC; list responses additionally expose total count. Added internal slug/detail projection without changing the UUID read API.
- Presentation and UI date-query boundaries explicitly use Asia/Ho_Chi_Minh (UTC+7). UTC storage/normalization is unchanged. Local midnight rollover is tested. Missing/one-sided scores remain unknown, upcoming matches show kickoff, postponed/cancelled scores are suppressed, and regulation/extra time/shootouts stay distinct.
- Text/TLA/initial badges require no crest images, downloads or rehosting. Populated pages display the configured exact football-data.org attribution. Missing team metadata/venue, stale non-final snapshots, loading, empty, database errors, unknown filters and invalid slugs have Vietnamese states.
- Semantic headings, labeled native controls, full-card links, skip navigation, visible keyboard focus, meaningful status text and reduced-motion styling are included. Homepage gains a list link. Mobile/tablet/desktop use one/two card columns and responsive metadata layouts.

### Validation evidence

| Command/check | Actual result |
| --- | --- |
| `npm.cmd run lint` | PASS, zero warnings; rerun after the filter-label correction. |
| `npm.cmd run typecheck` | PASS (`next typegen` and strict TypeScript); rerun after correction. |
| `npm.cmd test` | PASS, **99 tests across 7 files**; includes **22 new UI test cases**. No external API or configured DB access by tests. |
| `npm.cmd run build` | PASS; final production build includes `/matches` and `/match/[slug]`. Prisma Client generation also passes. |
| `npm.cmd start -- --port 3002` | PASS; temporary production server stopped after checks. |
| `/api/health` | HTTP 200; app up/database up. |
| `/matches`, EPL filter, La Liga filter | HTTP 200 with persisted data. Browser form submission verified 30 EPL / 31 La Liga rows in the selected Vietnamese date window. These are filtered counts, not a claim that the database total changed from the owner's 62-row acceptance report. |
| Upcoming status filter and pagination | Browser PASS; PL upcoming shows kickoff/status, page 2 and return controls work. |
| Stored detail route | HTTP 200; browser navigated from the Arsenal/Leeds card, confirmed stored 2–1 score, teams/season/round/time and missing venue, then returned to list. No new provider call. |
| Empty/live-empty and unknown-league states | HTTP 200 with the expected Vietnamese empty or invalid-filter content; no invented matches. |
| Invalid slug | Browser shows not-found recovery; recovery link works and robots metadata is noindex. Next.js streamed response is HTTP 200 for this case, rather than a pre-stream 404; it does not display a match. |
| Database failure | Separate temporary production process on port 3003 with an unreachable loopback database URL shows the generic Vietnamese error. No DB URL/Prisma exception exposed in response; log contains only controlled event/requestId. Local `.env` and running database were untouched. Temporary process stopped. |
| Responsive browser review | PASS at 360×800, 768×1024 and 1280×900. List/detail inspected with persisted data; no horizontal overflow at checked sizes. |
| Keyboard / browser console | Native filter controls and navigation work; Tab advances through links; inspected console has no warnings/errors. Fixed implicit league label to explicit label/ID association during review, then rebuilt and rechecked the real form. |

New deterministic tests cover rendered lists/cards/detail, EPL/La Liga query filters, finished/upcoming/missing scores, every status (including halftime/suspension), UTC+7 date rollover/query boundaries, ET/shootout semantics, missing metadata/text fallback, stale state, empty list, safe service/API-error presentation, invalid filters/slugs, navigation/attribution and availability-driven events/stats. Existing provider, idempotency, schema and foundation tests remain passing.

### Files created

- `app/matches/page.tsx`, `app/matches/loading.tsx`, `app/matches/error.tsx`.
- `app/match/[slug]/page.tsx`, `loading.tsx`, `error.tsx`, `not-found.tsx`.
- `components/matches/match-shell.tsx`, `match-filters.tsx`, `match-list.tsx`, `match-card.tsx`, `match-detail.tsx`, `match-score.tsx`, `match-status.tsx`, `team-identity.tsx`, `match-attribution.tsx`, `match-state.tsx`, `match-loading.tsx`.
- `lib/match-leagues.ts`, `lib/match-filters.ts`, `lib/match-presentation.ts`.
- `services/match-ui-data.ts`, `types/match-ui.ts`.
- `tests/fixtures/match-ui.ts`, `tests/match-ui.test.tsx`.

### Files changed

`app/page.tsx`, `app/globals.css`, `services/match-queries.ts`, `providers/football-data/config.ts`, `README.md`, `docs/PROGRESS.md`.

No schema, migration, package, lockfile, script, `.env.example` or credential changes. DATABASE_URL remains required to read data; FOOTBALL_DATA_API_KEY is needed only for existing deliberate sync commands. Existing secret-file ignore rules remain intact. No committed-history secret audit is possible without Git metadata.

### Limitations and next milestone

The UI displays stored snapshots; it does not poll or claim realtime freshness. Free-provider data can omit venue/events/stats; empty sections stay absent and imagery uses text fallbacks. Date windows are limited to 32 calendar days, and date groups/counts cover rows on the current page. Streaming not-found/error responses can carry HTTP 200, as documented above. Browser review is not a full screen-reader/device/accessibility certification. Existing development-tool advisory limitations remain; no new audit or production deployment was performed.

Recommended next: **Milestone 5 — News ingestion**, only after operator GO review, the news-source/access strategy decision required by Workflow Gate B, and an explicit request. Milestone 5 was not started.

## Current decision — Milestone 3: GO

Updated: 2026-10-16 (Asia/Bangkok). Status: **Completed — Milestone 3: GO**. Milestones 1–2 remain GO. The owner-provided successful local live-provider evidence below resolves the previous external integration gate. Earlier pending-key notes in this entry describe implementation-time limitations and are superseded by this final acceptance decision. Milestone 4 was not started.

### Final acceptance review — successful local live validation

Reviewed all Milestone 3 acceptance criteria in CODEX_PLAN.md and the milestone prompt against the prior implementation/test evidence and the owner's new local runtime report. The explicit free-first architecture limits detailed events/statistics to declared capabilities; unavailable paid fields remain absent, not a requirement to add a paid provider.

The project owner reported these successful results from their local environment:

| Live-provider acceptance evidence | Owner-reported result |
| --- | --- |
| football-data.org authentication | PASS. |
| Premier League smoke sync | PASS; **30 persisted matches**. |
| La Liga smoke sync | PASS; **32 persisted matches**. |
| Total persisted matches | **62**. |
| Persisted competitions | **2**. |
| Skipped records | **0**. |
| PostgreSQL persistence | PASS. |
| `/api/matches?league=premier-league` | Returned persisted Premier League match data. |
| `/api/matches?league=la-liga` | Returned persisted La Liga match data. |
| Provider → normalization → PostgreSQL → application API | End-to-end flow confirmed working for both initial leagues. |

These live results are owner-provided evidence, not independently rerun by Codex in this documentation update. No API key, credential file, Docker daemon or provider endpoint was accessed. No new commands against the application/database/provider were executed, and no key was logged or requested.

Acceptance reconciliation:

- Real data for both initial leagues reaches PostgreSQL and the internal read API: satisfied by the owner-reported live results above.
- Reruns/upserts and external mappings do not duplicate internal entities: satisfied by the previously executed deterministic SQL idempotency/mapping/cache tests and the real Prisma rollback-only persistence probe. The new report does not separately claim an additional live rerun-count check.
- Status/time/penalty mappings and error/429/missing-field handling: covered by the prior passing contract/transport/store tests, with explicit unavailable free-tier capabilities.
- Normalized API contracts, server-only credentials, safe logs, provenance/freshness, attribution configuration and graphic-licensing separation: previously reviewed implementation; no raw provider DTO is used as the application API contract.
- Required repository checks: previously executed Prisma format/validate/generate, migration/status/schema-diff checks, lint, typecheck, **77 passing tests across 6 files**, production build and application health/read-route smoke checks remain the recorded code-validation evidence. No fresh validation rerun is claimed in this update.

Milestone 3: GO

Only docs/PROGRESS.md changed in this final acceptance update. No application code, schema, migrations, dependencies, environment configuration or source-of-truth documents changed. Existing documented capability/development-tool limitations remain; this is not a production-release claim. Stop after Milestone 3. Do not start Milestone 4 automatically.

### Inspection, decision and scope

Read the current product spec, plan, milestone prompt, workflow and progress history, and inspected the existing schema/migrations, foundation/server environment, logging, database client and test infrastructure before coding. There was no existing provider implementation. Applied the supabase-postgres-best-practices skill for the necessary schema/persistence work and read the installed Next.js Route Handler documentation before adding APIs. Git metadata is still absent.

The owner's explicit **free-first architecture** selects football-data.org API v4 free tier as the primary structured MatchProvider. PL and PD are centralized adapter configuration. No mandatory paid provider or fake production fallback was introduced. The owner's future video/media/news/social directions are acknowledged but not implemented. No Docker access/reconfiguration or Windows ExecutionPolicy change was attempted.

Reviewed primary documentation: [free capabilities/rate allowance](https://www.football-data.org/pricing), [v4 matches/status](https://docs.football-data.org/general/v4/match.html), [competitions/tables](https://docs.football-data.org/general/v4/competition.html), [score semantics](https://docs.football-data.org/general/v4/overtime.html), [policies](https://docs.football-data.org/general/v4/policies.html), and [attribution/graphics terms](https://www.football-data.org/about). Generic reference examples do not imply entitlement to advanced fields. Rich events/lineups/stats are not assumed available on the selected free plan.

### Implementation

- MatchProvider exposes normalized competitions, teams, fixtures/detail, standings, capabilities and explicit unavailable event/stat results. Vendor DTOs and Zod validation/normalization stay inside the adapter directory. Business sync accepts the interface; provider selection stays in the composition root.
- FootballDataMatchProvider uses a server-supplied private key, fixed-origin HTTPS/header authentication, redirect rejection, bounded transient retries and a 10-second request/body abort timeout. Auth/quota/malformed/unsupported failures are safe typed errors; no provider body, raw exception or key is logged. Build/read-only APIs work without a provider key.
- Normalization retains UTC instants and nullable/absent values. Status mapping includes TIMED→SCHEDULED, IN_PLAY→LIVE, PAUSED→HALFTIME and retained administrative AWARDED metadata. Regulation, extra-time-only goals and shootout components are separated; aggregated knockout fullTime is not mislabeled or used to invent missing values.
- Sync validates before transactional Prisma/PostgreSQL upserts. External competition/season/team/match mappings preserve internal UUIDs. Seed league slugs are reused, memberships persist, old/partial data is preserved and missing records are never blindly deleted. Older match snapshots cannot regress stored results. Persistence-only advisory locking prevents concurrent orphan identities.
- PostgreSQL-backed resource leases/cache and shared request-start reservations work across CLI processes using this provider/database. Default interval: 7 seconds; matches cache 6 hours; other modes 24 hours. 429 records a Retry-After cooldown of at least a minute and does not retry immediately. Retries take paced slots. No continuous polling or scheduler.
- ProviderStatus/JobRun record health, successes/failures, counts, safe errors, attempts, correlation IDs, leases and normalized checkpoints. Partial results are WARNING/PARTIAL rather than a fresh complete cache hit. Force refresh preserves pacing/cooldown/lease rules.
- CLI `provider:sync` supports competitions, teams PL/PD, bounded matches PL/PD, standings PL/PD and minimal smoke. Smoke makes one match-list call per league initially (two total excluding transient retries), then uses a fresh persisted cache on same-window reruns. Per-league stored-window counts are checked even on a cache hit.
- Added read-only `/api/matches`, `/api/matches/[id]`, `/api/standings`. They read normalized persisted records, validate filters, paginate and return attribution/freshness without raw DTOs, token headers or external crest metadata. No public write/sync endpoint or match UI was added. Only the existing setup indicator was corrected to use the new key and avoid claiming that the adapter remains unimplemented.
- Exact attribution text is in safe application metadata for future visible UI. Crest references remain external metadata, never copied into licensed Club.logoUrl, downloaded, cached or rehosted; public projections provide text/TLA fallback fields. The full runbook documents rights, cancellation/retention limitations, future UI attribution, commands and capability limits.

### Schema/migration justification

Created additive transactional migration `20261016100000_match_provider`:

- Club nullable shortName/TLA/country/venue/externalCrestUrl: requested normalized identity and unlicensed reference metadata, separate from reusable logoUrl.
- ExternalIdentity nullable seasonId/matchId FKs, per-provider uniqueness/reverse indexes, extended one-target CHECK and a backfill for existing match primary identities: complete requested provider mappings without changing internal primary keys.
- Match providerUpdatedAt/providerStatus/scoreDuration: reject stale responses and retain score/status provenance, including awarded matches.
- ProviderStatus lastFailureAt/recordsProcessed/nextRequestAt/cooldownUntil: required operational health and cross-process free-tier pacing.
- Standing rows with league/season/club FKs, dimensions, counts, nullable metrics, fetchedAt, uniqueness and indexes: no standings storage existed in Milestone 2.

Applied safely to the existing local PostgreSQL 16 database; no reset or data destruction. Migration status is up to date and live Prisma schema diff reports no difference. Existing two league references remain intact. No new dependencies or enum changes; existing Zod/PGlite/Prisma are reused.

### Executed verification

| Command/check | Actual result |
| --- | --- |
| Key-presence check (boolean only) | FOOTBALL_DATA_API_KEY absent; no key value printed/read into chat. |
| `npx.cmd prisma format` / `validate` / `generate` | PASS. |
| `npm.cmd run db:check` | PASS, real PostgreSQL connection through Prisma. |
| `npm.cmd run db:migrate:deploy` | PASS, new migration applied to existing development DB. |
| `npx.cmd prisma migrate status` | PASS, 3 migrations, database up to date. |
| `npx.cmd prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` | PASS, no difference detected. |
| Disposable PostgreSQL test suite | PASS, production normalization/store paths execute checked-in migrations and parameterized persistence SQL. |
| Real Prisma SQL persistence probe | PASS, ran same synthetic fixture twice in a transaction and verified one internal match; deliberately rolled back all fixture writes. Temporary probe file removed. Initial inline Windows cmd quoting attempt did not execute; replaced with the temporary file. |
| `npm.cmd run provider:sync -- smoke` without key | Expected configuration failure: NOT_CONFIGURED, zero upstream calls and no fake data. This is not a live API test. |
| `npm.cmd run lint` | PASS, zero warnings. |
| `npm.cmd run typecheck` | PASS; fixed union narrowing and typed test query results before final run. |
| `npm.cmd test` | PASS, **77 tests across 6 files**. |
| `npm.cmd run build` | PASS without a provider key, production build includes normalized read routes. |
| Production server on port 3002 | Startup PASS; stopped after verification. |
| `/api/health` | HTTP 200, app up/database up. |
| PL and La Liga `/api/matches` read filters | HTTP 200 with empty arrays (no real provider data synced yet). Not claimed as real-data integration success. |
| `/api/standings?league=la-liga` | HTTP 200 with no stored season/table. |
| Missing match UUID / invalid date | HTTP 404 / HTTP 400 respectively. |
| Final live DB counts | 2 leagues, 0 matches, 0 standings, 0 external mappings, 0 articles. No synthetic provider fixtures retained. |

Added tests cover competition/season/team/match normalization, every known status, UTC offsets, regulation/ET/shootout distinctions, null/partial scores and metadata, missing key, 401/403/429, timeout/network/503, permanent failure/no retry, invalid JSON, malformed/partial payloads, private key/header handling, unavailable capabilities, single-match paths, actual SQL upsert/mapping idempotency, cache/resource key stability, metadata preservation, stale snapshots, rollback, relational team/standing reuse, safe status records, leases, shared rate reservations/cooldown and read-filter boundaries. Tests never call the live API or commit fixtures to DATABASE_URL.

### File inventory

Created:

- `types/match-provider.ts`
- `providers/errors.ts`
- `providers/football-data/config.ts`, `normalization.ts`, `provider.ts`
- `services/match-store.ts`, `match-sync.ts`, `match-queries.ts`
- `lib/match-runtime.ts`, `lib/data-sources.ts`
- `scripts/sync-matches.ts`
- `app/api/matches/route.ts`, `app/api/matches/[id]/route.ts`, `app/api/standings/route.ts`
- `tests/fixtures/football-data.ts`, `tests/football-data.test.ts`, `tests/match-sync.test.ts`, `tests/match-queries.test.ts`
- `prisma/migrations/20261016100000_match_provider/migration.sql`
- `docs/MATCH_PROVIDER.md`

Changed: `prisma/schema.prisma`, `lib/config.ts`, `lib/logging.ts`, `.env.example`, `package.json`, `tests/foundation.test.ts`, `app/page.tsx`, `components/provider-status.tsx`, `providers/README.md`, `services/README.md`, `README.md`, `docs/DATA_MODEL.md`, `docs/PROGRESS.md`. No dependency/lockfile change was required. Source-of-truth documents and existing secrets were not modified.

Environment: FOOTBALL_DATA_API_KEY is the only new name and is blank in .env.example. DATABASE_URL is still required for sync/database reads. SPORTS_API_KEY remains a legacy placeholder and is not used as a fallback. No key was written into local .env by Codex. No production secrets were introduced; Git committed-history auditing remains unavailable without Git metadata.

### Local runtime validation required

Configure FOOTBALL_DATA_API_KEY privately in local `.env`, then run the [minimal procedure in MATCH_PROVIDER.md](MATCH_PROVIDER.md). Current checkout's DB migration/code checks already passed. For another checkout/database, apply pending migrations first. Exact Windows commands:

```powershell
Set-Location D:\PNGVIET\FotBan
npm.cmd run db:migrate:deploy
npm.cmd run db:check
npm.cmd run provider:sync -- smoke
npm.cmd run provider:sync -- smoke
npm.cmd start
```

In another terminal, check the actual matching UTC date window and record each league's real rows:

```powershell
$from = [DateTime]::UtcNow.AddDays(-7).ToString('yyyy-MM-dd')
$to = [DateTime]::UtcNow.AddDays(14).ToString('yyyy-MM-dd')
Invoke-RestMethod "http://localhost:3000/api/matches?league=premier-league&from=$from&to=$to"
Invoke-RestMethod "http://localhost:3000/api/matches?league=la-liga&from=$from&to=$to"
```

Do not paste keys into chat. If a current window has no fixtures/results, select a valid alternative window rather than inventing data. Optional teams/standings validation commands are documented separately; the two-request smoke does not claim to exercise them. Capture safe counts/statuses and repeat-run/cache behavior before completing the real-provider acceptance gate.

### Limitations and next milestone

Live API response/entitlement/quality and both real league data flows remain unverified here because the key is absent. This is configuration/environment evidence pending, not a code failure. Free data is delayed; advanced events/stats/lineups are explicitly unavailable. Standings may retain older rows with their original freshness when a response is partial; no authoritative removal is inferred. No scheduler, UI feed, future provider, paid dependency, automatic image reuse, production deployment or new dependency audit is included. Earlier development-tool advisories remain documented. Full multi-provider authority/reconciliation and broader publication/rights gates remain future work.

Recommended next milestone: **Milestone 4 — Match UI**, only after the local real-data acceptance evidence for Milestone 3 is recorded and the operator explicitly requests continuation. Stop after this milestone.

## Current decision — Milestone 2: GO

Date: 2026-10-16 (Asia/Bangkok). Status: **Completed — implemented and verified**. Milestone 1 remains GO. Milestone 3 was not started.

### Scope and inspection

Read the attached Milestone 2 request, PRODUCT_SPEC.md, CODEX_PLAN.md, CODEX_PROMPTS.md, CODEX_WORKFLOW.md and the existing progress record. Inspected Prisma, npm scripts, environment/database utilities, README and existing tests before implementation. The previous schema contained only the datasource/client generator and there were no migrations. The directory still has no Git metadata. Applied the supabase-postgres-best-practices skill for schema types, FK indexes and migration design.

No Docker access or Docker reconfiguration was attempted. Contrary to the previous isolated-session result, the existing DATABASE_URL became reachable directly through Prisma during this work. A read-only inspection confirmed PostgreSQL **16.15**, database **football_morning**, role **football**, and an empty public schema before the initial migration. This permitted the requested live development migration/seed validation.

### Models, relationships and decisions

Created 30 models in prisma/schema.prisma:

- Core: User, League, Club, Player, Match, MatchEvent, MatchStat, NewsSource, Article, ArticleCluster, ArticleEntity, Video, DailyBrief, BriefItem, UserPreference, JobRun, ProviderStatus.
- Plan-required supporting models: Season, UserFollow, Transfer, TransferUpdate, ClaimEvidence, Quote, AIProcessingRun, AdminAuditLog.
- Relational/history support: ClubSeason, PlayerClub, ExternalIdentity, BriefRevision, BriefItemEvidence.

Created 16 enums: UserRole, MatchStatus, MatchEventType, SourceType, ReliabilityClass, StoryType, TransferStatus, RumorStatus, ProcessingStatus, PublicationStatus, BriefStatus, BriefSection, VideoTrustLevel, ValidationStatus, JobStatus, ProviderHealth.

Internal UUIDs are independent of provider identifiers. Dates use PostgreSQL date and operational timestamps use timestamptz(3). League/season/club memberships and player/club tenure have real relational links. Composite season/league FKs prevent cross-league matches. Articles retain source/canonical identity and processing/publication state; clusters preserve member/source records. ArticleEntity/UserFollow enforce exactly one typed target. BriefItem belongs to a BriefRevision and corresponding DailyBrief; snapshots and citations survive corrections. Preference/follow data is relational. Domain and provenance deletes are restricted; only private user preferences/follows cascade. Audit records are append-only.

Added 52 explicit secondary indexes, 27 compound unique declarations, plus field unique/primary indexes. Covered kickoff/league/clubs, article public/source/story feeds and processing queues, entity targets, job timestamps/status and FK reverse lookups. Key uniqueness includes auth identities, slugs, source URLs, canonical URLs, provider IDs, per-target follows, date+locale Brief identity, revision numbers/section positions, logical jobs and null-player club stats. SQL checks/triggers additionally enforce bounds, one-target links, evidence integrity and published revision/content immutability. Full field/index rationale, retention and recovery design is in docs/DATA_MODEL.md. No production provider or publication workflow was implemented.

### Migrations and seed

Created and applied these additive transactional migrations without resetting/destroying data:

1. `20261016070000_initial_data_model`: initial enums/tables/FKs/indexes plus integrity checks, deferred evidence checks and published-content/audit protection.
2. `20261016073000_publication_integrity`: requires a published revision for a published Brief identity and prevents mutation of evidence cited by published Briefs.

The initial migration was applied to the inspected empty PostgreSQL 16 database. The second was applied to that already migrated/seeded database. Deployment reruns after each reported no pending migrations. No applied migration was edited after deployment. A final live Prisma schema diff reports **No difference detected**; custom trigger/CHECK semantics are verified by executable SQL tests, since Prisma diff does not fully compare those semantics.

Added a local-only, explicitly opted-in, idempotent reference seed. It upserts Premier League and La Liga by slug without overwriting editorial changes. Ran it twice; verified exactly **2 leagues**, **0 matches**, **0 articles**, **0 Briefs**, **0 videos**. Seed refuses production, non-loopback/other databases and missing ALLOW_DEV_SEED=true. No credentials, sources, fake news/results, users or provider scores were seeded.

### Commands and actual results

| Command/check | Result |
| --- | --- |
| `npm.cmd run db:check` before and after migration | PASS through real PostgreSQL 16.15. |
| Read-only Prisma inspection | Confirmed expected local DB/role/version and empty public schema before migration. |
| `npm.cmd install -D @electric-sql/pglite` | PASS; promotes the already installed embedded engine to an explicit dev dependency for deterministic SQL tests. Install audit still reported the 5 previously documented development-tool advisories. |
| `npx.cmd prisma format` | PASS. |
| `npx.cmd prisma validate` | PASS. |
| `npx.cmd prisma generate` | PASS, Prisma Client 7.10.1. |
| `npx.cmd prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script --output ...` | PASS, generated initial additive SQL; PostgreSQL checks/triggers were added before deployment. |
| `npm.cmd run db:migrate:deploy` | PASS initial empty DB, PASS incremental migration, repeat deployments PASS with no pending migrations. |
| `npx.cmd prisma migrate status` | PASS, 2 migrations and database up to date. |
| `npm.cmd run db:seed` with process-scoped ALLOW_DEV_SEED=true, twice | PASS, idempotent two-league reference seed. Opt-in was removed afterward. |
| `npx.cmd prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` | PASS, no difference detected. |
| `npm.cmd run lint` | PASS, zero warnings. |
| `npm.cmd run typecheck` | PASS. |
| `npm.cmd test` | PASS, **31 tests across 3 files**. |
| `npm.cmd run build` | PASS, production build with generated client. |
| `npm.cmd start -- --port 3002` and HTTP smoke checks | PASS, homepage 200, `/api/health` HTTP 200 with app up/database up. Temporary app server stopped afterward; DB left intact. |

Tests use disposable PGlite PostgreSQL databases and never access DATABASE_URL. Coverage includes duplicate canonical/source URLs, provider IDs, entity links, follows, date+locale identity, job keys, season/league FK consistency, nullable club-stat uniqueness, score safety, source/evidence deletion restrictions, empty/unevidenced Brief rejection, evidenced publication, revision immutability and seed production isolation. A raw-SQL fixture initially omitted Prisma's generated correlationId; fixed the test fixture and reran successfully. A schema diff initially surfaced the SQL-only stat unique index; mapped it into the Prisma schema (no database change required), then verified a clean final diff.

### File inventory and environment

Created:

- `prisma/migrations/migration_lock.toml`
- `prisma/migrations/20261016070000_initial_data_model/migration.sql`
- `prisma/migrations/20261016073000_publication_integrity/migration.sql`
- `prisma/seed-data.ts`, `prisma/seed.ts`
- `tests/data-model.test.ts`, `tests/seed.test.ts`
- `docs/DATA_MODEL.md`

Changed: `prisma/schema.prisma`, `prisma.config.ts`, `package.json`, `package-lock.json`, `.env.example`, `README.md`, `docs/PROGRESS.md`. Existing application routes, UI, logger and runtime DB client were not rewritten. Source-of-truth files were not changed. Added `db:seed` and the Prisma seed hook; existing migration commands were reused. Only new environment name: **ALLOW_DEV_SEED**, left blank in .env.example; DATABASE_URL remains required for live DB commands. No API credentials required or added.

### Limitations, local commands and next step

No outstanding local validation commands are required for this checkout/database: live migration, seed, schema diff, connectivity and health passed. To reproduce on another local development database, run `npm.cmd run db:migrate:deploy`, `npx.cmd prisma migrate status`, opt into `npm.cmd run db:seed` as documented, then run `npm.cmd run db:check` and the normal lint/typecheck/test/build suite. No reset is required. README and DATA_MODEL.md document migration review, preserving custom SQL invariants, backup/restore approach, safe forward recovery and Windows binary-dump precautions. A full production restore drill remains Milestone 19 work.

Known limitations: full factuality/reliability/official-transfer validation, cluster algorithms, publication services, auth/ownership enforcement, retention jobs and provider adapters are deferred to their milestones. Evidence existence alone is not a truth/rights check. Existing development-tool dependency advisories remain documented; no forced downgrade was applied. No production release, production migration or remote deployment is claimed. Git history cannot be audited in this non-Git directory.

Recommended next milestone: **Milestone 3 — Match Provider**, after the operator's provider-selection Gate A review (coverage, rights, quota, cost). Do not start it automatically.

## Current decision — Milestone 1: GO

Updated: 2026-10-16 (Asia/Bangkok). **Completed.** The successful local runtime evidence below supersedes the historical PostgreSQL connectivity blockers recorded in earlier entries.

PostgreSQL + Docker Compose + Prisma setup: GO

Milestone 1: GO

### Final acceptance review and evidence

Reviewed the Milestone 1 acceptance criteria in CODEX_PLAN.md. Existing implementation and previously executed repository validation cover the required structure, Next.js/TypeScript/Tailwind setup, Prisma configuration, safe environment handling, optional-provider startup, logger redaction, error/loading handling, health endpoint and reproducible README setup.

The project owner reported successful runtime validation on their local Windows environment:

| Acceptance evidence | Result and source |
| --- | --- |
| Docker Desktop and Docker Compose | Running/working — owner verified locally. |
| PostgreSQL 16 container and port 5432 | Container healthy, port available — owner verified locally. |
| Prisma connection to local PostgreSQL | PASS — owner verified locally. |
| `npm.cmd run db:check` | PASS — owner supplied output: `PostgreSQL connection verified through Prisma.` |
| Production application `/api/health` | HTTP 200, `app: up`, `database: up` — owner verified locally. |
| Prisma validation and client generation | PASS — previously executed repository checks and owner confirmation. |
| Install/dev, lint, typecheck, tests and production build | PASS — previously recorded execution evidence; tests: 4 passed. Owner also confirmed the repository validation results. |
| Environment handling, README and secret safeguards | Previously reviewed; local secret files ignored, .env.example contains no real credentials, and no production secrets identified in reviewed source. Explicit development-only Compose credentials were authorized. Git committed-history audit remains unavailable because this directory has no Git metadata. |

The local Windows runtime results are owner-provided evidence, not commands executed or independently re-run by Codex in this update. Codex's inability to access that Windows Docker daemon is environment isolation only and is no longer a project blocker. No Docker access was attempted in this update, and no validation rerun is claimed.

Only docs/PROGRESS.md changed in this final documentation update. No application code, schema, migrations, dependencies, environment variables or Windows ExecutionPolicy settings changed. No files were created. The previously documented development-tool advisories remain a known limitation; no new dependency audit or production-release readiness claim is made.

Milestone 1 is complete based on the prior repository checks plus the owner's successful local runtime validation. Milestone 2 was not started; stop here.

## Milestone 1 — Project Foundation

Date: 2026-10-16 (Asia/Bangkok). Status: **implemented; acceptance pending live PostgreSQL connection**. Do not start Milestone 2 until the remaining gate is verified.

### Initial inspection and scope

Read `PRODUCT_SPEC.md` and `CODEX_PLAN.md` first. The repository initially contained only those two files, with no application, package configuration, Git metadata or existing code. No initial AGENTS.md was present. `next dev` subsequently generated the Next.js AGENTS.md, which was read along with relevant bundled framework documentation. Node.js 24.16.0 / npm 11.13.0 were available on Windows. No PostgreSQL executable, installation directory, service, Docker executable or configured DATABASE_URL was found.

### Implemented

- Next.js 16.4.2 App Router, React 19.3.1, strict TypeScript, Tailwind 4, ESLint and a reproducible npm lockfile.
- Prisma 7.10.1 PostgreSQL adapter, reused Node-process client, bounded pool/connection/query settings, generation, schema validation and a read-only database connectivity script. No domain tables or migrations.
- Server-only validated environment access; optional missing provider keys; credential-free `.env.example` and ignored environment files.
- Pino structured events with credential redaction, startup/request-failure logging and health correlation IDs. No raw exception serialization.
- Generic Vietnamese root/route error, loading and not-found states; an honest unconfigured setup page with no fabricated football content.
- Uncached `/api/health` distinguishing app availability from missing/unavailable/up DB readiness.
- Deterministic foundation tests and local setup/build/database/recovery documentation.

### Verification

| Command / check | Actual result |
| --- | --- |
| `npm install` | Passed; generated client and lockfile. Network access required approval after initial npm lookup failed with EACCES. |
| `npm install -D vitest@5.0.5` | Passed; removed critical test-tool dependency advisories. |
| `npm install @prisma/client@7.10.1 @prisma/adapter-pg@7.10.1` and `npm install -D prisma@7.10.1` | Passed; upgraded from initial Prisma 6 configuration to address tooling advisory. |
| `npm ls --depth=0` | Passed, compatible resolved top-level dependency tree. |
| `npm run lint` | Final run passed with zero warnings; fixed anonymous PostCSS default-export warning from initial run. |
| `npm run typecheck` | Final run passed. |
| `npm test` | Final run passed: 1 file, 4 tests covering configuration, secret redaction and health outcomes. |
| `npm run db:generate` | Passed with Prisma 7.10.1 and no domain models. |
| `npm run db:validate` | Final run passed without credentials. |
| `npm run db:check` | **Failed as expected: DATABASE_URL is not configured. Real successful database connectivity remains unverified.** |
| `npm run build` | Final run passed without warnings; routes `/`, `/_not-found`, `/api/health`. Fixed initial instrumentation Edge-runtime warning. |
| `npm run dev -- --port 3001` | Started successfully; homepage 200, health 503/not_configured, missing route 404. Stopped afterward. |
| `npm start -- --port 3002` | Production server started; homepage 200, missing route 404, health 503/not_configured, no-store and matching request ID header/body. Stopped afterward. |
| Production start with process-only DATABASE_URL pointing to closed localhost port 1, port 3003 | Real Prisma/pg outage path returned 503/database unavailable; homepage remained 200. No database, credentials or content created. Stopped afterward. |
| `npm audit --omit=dev` | Passed, zero production dependency vulnerabilities. |
| Full `npm audit` | Five high-severity development-only advisories remain in the Next.js lint plugin → fast-glob → micromatch → braces dependency chain. npm's proposed fix downgrades eslint-config-next to 14.2.35; not applied because it conflicts with the installed framework. |

No successful live DB probe, production deployment, browser visual review or accessibility audit is claimed. Unit health probes are not evidence of a live successful PostgreSQL connection. No secrets were added to project source; this directory has no Git repository, so there is no tracked-file history to audit.

### Files created

- Root configuration: `.env.example`, `.gitignore`, `AGENTS.md` (generated by Next.js), `package.json`, `package-lock.json`, `tsconfig.json`, `next-env.d.ts`, `next.config.ts`, `postcss.config.mjs`, `eslint.config.mjs`, `prisma.config.ts`, `instrumentation.ts`.
- App/UI: `app/layout.tsx`, `app/page.tsx`, `app/globals.css`, `app/loading.tsx`, `app/error.tsx`, `app/global-error.tsx`, `app/not-found.tsx`, `app/api/health/route.ts`, `components/provider-status.tsx`.
- Foundation: `lib/config.ts`, `lib/env.ts`, `lib/logging.ts`, `lib/logger.ts`, `lib/database-client.ts`, `lib/db.ts`, `lib/health.ts`, `types/health.ts`, `prisma/schema.prisma`, `scripts/check-db.ts`, `tests/foundation.test.ts`.
- Documentation/placeholders: `README.md`, `docs/PROGRESS.md`, `providers/README.md`, `services/README.md`, `jobs/README.md`.

Existing files changed: **none**. The two source-of-truth documents remain unchanged. Build/install outputs (`node_modules`, `.next`, TypeScript cache) are ignored artifacts.

### Manual configuration and next step

1. Install/start or provision a development-only PostgreSQL database and login.
2. Copy `.env.example` to `.env`; set DATABASE_URL. Set NEXT_PUBLIC_APP_URL for the actual environment. Provider keys can remain blank.
3. Run `npm run db:check` and verify `/api/health` returns HTTP 200 with database up. Record the result here before marking Milestone 1 complete.
4. Recheck lint-chain dependency advisories when patched upstream tooling is available.

After the DB gate passes, the recommended next milestone is **Milestone 2 — Data Model**, only when requested. All domain models, match data, news ingestion, AI processing, YouTube, social/Fan Pulse, seed data, auth, worker/scheduler and deployment work remain deferred to their specified milestones. No provider credentials are required for this milestone's shell.

## Milestone 1 — Workflow revalidation

Date: 2026-10-16 (Asia/Bangkok). Decision: **NO-GO — live PostgreSQL connection gate remains unmet**.

Read all four project documents: PRODUCT_SPEC.md, CODEX_PLAN.md, CODEX_PROMPTS.md and CODEX_WORKFLOW.md. Reviewed the existing source, configuration, documentation, directory structure and available Git state. The newer prompt/workflow does not require a foundation rewrite or future provider integrations. Existing Next.js, strict TypeScript, Tailwind/PostCSS, Prisma/PostgreSQL configuration, environment handling, .env.example, logging/redaction, error/loading/not-found boundaries and README satisfy the corresponding Milestone 1 implementation requirements. No application-code changes were necessary.

Re-ran the required validation suite against the current implementation:

- `npm run lint`: PASS, zero warnings.
- `npm run typecheck`: PASS.
- `npm test`: PASS, 4 tests in 1 file.
- `npm run build`: PASS, Prisma generation and production build, no warnings.
- `npm run db:validate`: PASS.
- `npm run db:check`: FAIL, missing DATABASE_URL; no .env or process DATABASE_URL is configured. No PostgreSQL service, psql or Docker executable was found.
- `npm start -- --port 3002` and HTTP smoke checks: startup PASS; homepage 200, missing route 404, health 503 with app up/database not_configured. Stopped the temporary server after verification.

Source secret-pattern scan found only the explicit USER:PASSWORD documentation placeholder in README; no real credential was identified in the reviewed source. Environment files are ignored and .env.example contains blank secret values. `git status --short` confirms this directory is not a Git repository: committed files/history cannot be audited here. No commits, branches or merges were created.

Files created: none. Files changed: only this progress record (apart from ignored build outputs). Database models, migrations, indexes and constraints added: none. Environment variables added: none. Existing README setup instructions remain sufficient; no rewrite was made. Previously documented development-tool advisory limitations remain unchanged; no fresh dependency audit is claimed in this revalidation.

Required next action: configure a real development PostgreSQL DATABASE_URL, rerun `npm run db:check`, and verify HTTP 200/database up from `/api/health`. The plan explicitly requires a successful Prisma connection to local DB; schema validation and mocked unit probes cannot substitute for that acceptance gate. Milestone 1 cannot be reported GO yet. Milestone 2 was not started.

## Milestone 1 — Reusable local PostgreSQL infrastructure

Date: 2026-10-16 (Asia/Bangkok). Status: **infrastructure implemented; runtime verification blocked by missing Docker/PostgreSQL**. Setup and Milestone 1 remain **NO-GO** until successful connectivity is demonstrated.

Reviewed the four source/workflow documents and current Prisma, environment, database client, connectivity script, npm scripts, README, ignore rules and repository layout before changes. Working application code and Prisma schema were retained. No domain models, migrations or data were added; Milestone 2 was not started.

### Changes

- Created `docker-compose.yml`: service `postgres`, image `postgres:16`, database `football_morning`, development user `football`, explicitly requested public development password, loopback-only host port 5432, named `postgres_data` volume mounted at `/var/lib/postgresql/data`, TCP `pg_isready` healthcheck and `unless-stopped` restart policy. Stable Compose project name: `football-morning-brief`.
- Created ignored local `.env` containing the requested local DATABASE_URL and blank optional provider keys. No production secrets were introduced. `.env.example` retains blank credential placeholders and now explains the local setup source.
- Added `db:up`, `db:down`, `db:logs`, `db:studio`. Existing `db:check`, `db:generate`, `db:validate`, `db:migrate:dev` and `db:migrate:deploy` are reused; no duplicate migration alias or reset script.
- Updated README with prerequisites, environment setup, start/wait/check/log/stop instructions, named-volume persistence, SQL identity verification, Prisma validation/generation/Studio, existing migration commands and destructive volume-removal warning.
- Verified `.gitignore` matches `.env`, `.env.local`, `.env.production` and `.env.production.local`, while permitting `.env.example`, using the installed `ignore` matcher. No ignore-rule change was needed.

Files created: `docker-compose.yml`, `.env` (local ignored configuration). Files changed: `package.json`, `.env.example`, `README.md`, `docs/PROGRESS.md`. No dependency change or lockfile change was necessary for npm script additions. No application-code changes. No new environment variable names; DATABASE_URL is required for connectivity and is now populated locally. Optional API keys remain blank.

### Verification results

| Check / command | Result |
| --- | --- |
| Docker/PostgreSQL discovery | Neither docker/psql/pg_ctl on PATH; no PostgreSQL/Docker service found, no standard Docker Desktop or PostgreSQL installation found, no port 5432 listener. |
| `npm run db:up` | FAIL: `'docker' is not recognized as an internal or external command`. No container started. |
| Compose static YAML check | PASS using installed `js-yaml`; verified requested image, database/user/password, port, named volume, restart policy and healthcheck. Initial attempt with unavailable `yaml` module was replaced by the installed parser. This is not Docker Compose engine validation. |
| `npm run db:validate` | PASS, PostgreSQL datasource and environment-loaded config valid. |
| `npm run db:generate` | PASS, Prisma Client 7.10.1 generated. |
| `npm run db:check` (repeated after build) | FAIL: database unreachable; local DATABASE_URL is populated but no server is running. |
| `npm run lint` | PASS, zero warnings. |
| `npm run typecheck` | PASS. |
| `npm test` | PASS, 4 tests / 1 file. |
| `npm run build` | PASS without warnings, loads .env and generates Prisma Client. |
| `npm start -- --port 3002` plus HTTP checks | App starts; homepage HTTP 200. `/api/health` HTTP 503 with app up / database unavailable. Temporary server stopped after checking. |

Docker available: no. PostgreSQL running: no. Prisma connected: no. db:check: fail. /api/health database-readiness criterion: fail. Database health: down/unavailable.

### Manual prerequisite and recovery

Install Docker Desktop for Windows with its Linux engine/WSL 2 backend and Docker Compose v2, satisfy installer virtualization/WSL requirements, start Docker Desktop, and reopen the terminal if PATH changed. Docker startup, healthy-container state, live SQL identity and volume persistence cannot be verified until this prerequisite is met. Per the requested fallback policy, no unrelated PostgreSQL instance was changed and no alternate database was installed.

Then run from the project directory:

```powershell
docker version
docker compose version
npm run db:up
docker compose ps postgres
docker compose exec postgres psql -U football -d football_morning -c "SELECT current_database(), current_user;"
npm run db:validate
npm run db:generate
npm run db:check
npm run dev
# Verify http://localhost:3000/api/health returns 200 with database up.
```

Only after those runtime checks pass can this setup resolve the last Milestone 1 gate. Existing development-tool advisory limitations remain as previously documented; no fresh npm audit was run in this change. Git history is unavailable because this directory has no Git metadata. No production deployment, migrations, resets, commits or future milestone work was performed.

## Champions League

- Added the UEFA Champions League (football-data code `CL`) as a third competition: matches (`/matches?league=champions-league`), league hub (`/league/champions-league`: news, standings with league-stage table, fixtures, 36 clubs), club and player pages, and news filtering.
- A club shows its domestic league (Premier League / La Liga) when it has one, otherwise the Champions League; a story counts for the Champions League only when no domestic league applies, plus any story that names the competition (Champions League, Cúp C1, C1 châu Âu).
- Vietnamese aliases were added for Champions League-only clubs (PSG, Bayern, Dortmund, Inter, Napoli, Roma, Leipzig, Sporting, Porto, Galatasaray, Fenerbahce, Lille, Lens, PSV, Feyenoord, Stuttgart).
- The Champions League is excluded from the Morning Brief and the morning scheduler, YouTube and GDELT.
- Player photos for the new squads fill in through the worker batches or `npm.cmd run players:images -- 1200 100`.

## News page tabs

- `/news` now opens on a tab menu like FotMob: Dành cho bạn (followed teams' fixtures and stories; top stories plus a follow prompt otherwise), Mới nhất (strictly newest first), Chuyển nhượng (transfer stories, newest first) and Giải đấu (league chips, ranked). Tab and page live in `?tab=` and `?bao=`.
- The hero text, the "Tin từ báo chí Việt Nam" heading and the "Tiêu đề và mô tả do báo đăng…" notice were removed from list, home and detail pages; each card still shows its publisher and original-link attribution.

## Match page tabs

- `/match/[slug]` has FotMob-style tabs in `?tab=`: Dữ kiện (info, events/stats when stored, form of both teams, next fixtures, related stories, highlight), Sự kiện, Đội hình, BXH (league table with both clubs highlighted), Thống kê, Đối đầu (earlier meetings stored here with win/draw counts).
- **Data gap:** the football-data.org free tier returns only score, half-time score and referee for a match; no goals, cards, substitutions, lineups or statistics (checked with a real finished match). Sự kiện, Đội hình and Thống kê therefore show an honest "chưa có dữ liệu" state until a source for them is chosen. The MatchEvent/MatchStat tables and views are ready for it.

## Match events, lineups and statistics

- Source: Highlightly free Basic plan (see MATCH_PROVIDER.md). Additive migration `20261019190000_match_details` (MatchLineup, MatchDetailSync, ProviderQuota, MatchEvent player names).
- Match page: Sự kiện is a home-left/away-right timeline, scorers appear under the score, Đội hình draws each formation on a pitch with the bench, Thống kê shows home/away bars, Dữ kiện shows the referee and credits the provider.
- Live since 2026-10-20: first pass mapped 19 matches (lineups, events, statistics) with 46 of 90 daily requests; field meanings verified (see MATCH_PROVIDER.md). Statistics are grouped like FotMob; the facts tab shows the summary group.

## Lineups like FotMob

- Đội hình tab: both teams on one pitch (home left / away right on wide screens, home top / away bottom on phones), lines ordered from each team's left to right as the provider sends them; player rating chips (Highlightly box score, 0-10, ★ for the match's best), goals, own goals, cards and substitution minutes; team bar with formation and average rating; both benches with minute on, cards and ratings.
- Box score: one extra request per finished match (`MatchDetailSync.boxScoreFetchedAt`, migration `20261020090000_match_box_scores`), merged into the stored lineup (rating, minutes, full name, per-player figures). No coach or captain data is available.
- Fix: the provider is inconsistent about which substitution name came on; substitutions are now replayed against who is on the pitch (starters, then each change), with short/full name matching. Verified: 172 of 175 oriented, 0 wrong, 3 left as sent (names not in the lineup).

## Facts tab: match review and top statistics

- Dữ kiện now leads like FotMob: "Tường thuật trận đấu" (or "Trước trận đấu" for upcoming matches) picks a Vietnamese publisher story about this match from the attributed cards (linked to the match or naming both clubs; after kickoff within 48 h, or the 3 days before kickoff; roundups excluded; result-like headlines and wider coverage first; up to three feed pages). Hidden when no publisher wrote about the match (e.g. Man City–Ipswich had none).
- "Thông số nổi bật": possession bar plus xG, shots, shots on target, big chances, accurate passes (with %), corners, fouls, yellow cards; leading side highlighted (not for fouls/cards); link to the full statistics tab.
- Order: review, top stats, timeline, form, next matches, other related stories, highlight, match information.

## Statistics tab like FotMob

- Team statistics: new "Tranh bóng" group (duels won summed from the box score's per-player figures, aerial duels and dribbles with success %), "Sút trúng xà/cột dọc" counted from shots, percentages next to every "successful" figure (passes, long passes, crosses, tackles).
- "Cú sút": the free source has no pitch coordinates, so instead of FotMob's pitch shot map each team's shots are drawn on the goal frame (where the ball went, as seen by the shooter; near misses just outside) and listed with minute, player, outcome and target. Stored in `MatchShot` (migration `20261020120000_match_shots`), read from the same match-detail response (no extra request).
- "Thống kê cầu thủ": everyone who played, best rating first, views Hàng đầu / Tấn công / Chuyền bóng / Phòng ngự / Tranh bóng / Thủ thành (`?tab=thong-ke&bang=…`), from the box score (more figures kept now: dribbles, duels lost, fouls, offsides, goals conceded…).
- Venue, capacity and weather from the same response fill "Sân vận động", "Sức chứa", "Thời tiết".
- Not available from free sources: pitch shot map, xGOT and xG split, first/second-half split, physical data, attack zones.
- Older matches: `npm.cmd run matches:details -- --refetch` schedules a re-read; the worker spreads it over the daily allowance.

## Statistics tab layout

- Read top-down: team colour key with quick links (Tổng quan, Cú sút, Chỉ số đội, Cầu thủ); "Thống kê hàng đầu" beside the shots card; team figures as six small cards (Sút bóng, Chuyền bóng, Tranh bóng, Phòng ngự, Kỷ luật, Bóng chết) without bars, leading side highlighted (not for fouls/cards/offsides); low-value figures in a collapsed "Chỉ số khác".
- Shots: one-line summary per team, goal frame, list collapsed.
- Player table: compact rows, crest beside the name, best value per column highlighted, ★ on the top rating, team filter (`&doi=nha|khach`).

## Match news list

- Dữ kiện → "Tin tức": FotMob-style two-column list (headline, publisher · time, small picture on the right), up to 10 stories, those naming both clubs first, the match review excluded. Publishers whose RSS has no pictures (Bongda.com.vn) get a same-size tile with the club crest, so rows stay aligned; no article page is fetched for images.

## Homepage front

- New front above the morning brief, after the reference design but with real data only: "Điểm nóng hôm nay" (top-ranked story with a publisher picture, labelled "Nhiều báo cùng đưa tin" since ranking is automatic), "90 giây bắt nhịp bóng đá" (links to the brief at `#ban-tin-sang` when it is published), "Dòng chảy bóng đá" cards with tabs Dành cho bạn (viewer's follows, else ranked) / Mới nhất (`?dong=moi-nhat`); sidebar "Nắm nhanh" (next three stories; under the hot story on phones), "Chuyển nhượng" (reported stage, never confirmed) and "Cuộc đua trên BXH" (top six, league switch `?bxh=`).
- No stock pictures or bookmark buttons; cards without a publisher picture show the club crest. The follow loader is shared by /news and the homepage (`services/viewer-follows.ts`).

## YouTube highlights check (2026-10-20)

- State: no video has ever been stored (`Video` 0 rows). `YOUTUBE_API_KEY` is not set, both sources' channel IDs were never resolved, and video sync runs only from the morning scheduler, not the worker.
- Sources are real and active (checked on their public RSS feeds): FPT Bóng Đá (`UC4LvrpNXujjbGOS4RDvr41g`) posts "HIGHLIGHTS: HOME - AWAY | … | NGOẠI HẠNG ANH 26/27" within hours; SCTV Thể Thao (`UCiWyQp2HgKX2-WQUq11V8FA`) posts "HOME - AWAY | … | LALIGA EA SPORTS 26/27". No Champions League source is registered.
- Policy fixes: "26/27" seasons were read as a date and rejected 4 of 5 real highlights; SCTV titles without the word "highlight" were never chosen; half-time clips are now excluded; Champions League titles are recognised. Real titles are regression tests.
- Open: the API search budget is 10 searches/day (about half a busy matchday). Proposed: discover videos from the two channels' public RSS feeds (no key, no quota) and keep the API only for optional metadata checks.
