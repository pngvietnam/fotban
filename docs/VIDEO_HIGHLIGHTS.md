# YouTube highlights — Milestone 11

## Architecture

`Persisted completed Match → VideoSyncService → VideoProvider → normalized metadata → source/match validation → Video → readVerifiedHighlight → Match detail`.

VideoProvider exposes reviewed channel resolution, bounded discovery and batched metadata refresh. Vendor DTOs stay inside YouTubeVideoProvider; application services take the interface. Fake providers exist only in tests. Pages read PostgreSQL only; no external request, key or provider logic reaches browser components. Original video titles remain unchanged. No video download, proxy, thumbnail download, rehosting or embedding is implemented. This milestone adds no scheduler or Morning Brief.

## Registry and Vietnam-first priority

The optional VIDEO_SOURCE_WHITELIST_AND_SPEC_PATCH.md was absent. The explicit M11 Vietnam-first instruction supersedes earlier generic league-first examples:

1. Reviewed Vietnamese rights-holder/authorized source.
2. Other explicitly approved Vietnamese authorized source.
3. Official league.
4. Official club.
5. Reviewed international broadcaster/trusted media.
6. No suitable video.

Initial sources in providers/youtube/sources.ts:

| Competition | Publisher | Handle | Scope |
| --- | --- | --- | --- |
| Premier League | FPT Bóng Đá | @FPTBongDaOfficial | 2026/2027, VN, vi |
| La Liga | SCTV Thể Thao Official | @SCTVTheThaoOfficial | 2026/2027, VN, vi |

The 2026-10-17 review uses [FPT's channel guide](https://fpt.vn/tin-tuc/cach-xem-ngoai-hang-anh-tren-dien-thoai-13799.html), [FPT's season coverage](https://blog.fptplay.vn/fptplay-san-sang-cho-ngoai-hang-anh-2026-27) and [SCTV's season/channel statement](https://sctv.com.vn/tin-tuc/the-thao/laliga-ea-sports-2026-27-bung-no-tro-lai-tren-sctv). These support publisher identity and competition coverage for watch-link discovery; they do not grant redistribution or prove ownership of every upload.

VideoSource stores stable channel identity, reviewed handle/name/country/language/type, verification/enabled flags, priority, reference and review time. Channel IDs are not guessed: channels.list must resolve the exact approved handle. A changed ID fails closed; approval never silently transfers to another channel. Registry insertion is idempotent and never re-enables revoked sources. An unresolved channel cannot publish a highlight.

VideoSourceCompetition references internal League ID, exact season name, market, language, rights/link type, priority, evidence URL and finite validFrom/validTo. Initial mappings run 2026-08-01 inclusive through 2027-07-01 exclusive and must cover kickoff AND current time. Future seasons require new review; no permanent broadcaster assumption. Reviews expire after 180 days. Other approved fallback tiers are supported by registry data but none is automatically trusted or enabled from a badge/title.

## Match validation and primary selection

Require FINISHED status, enabled/verified source, exact API channel ID, current season/competition/VN mapping, BOTH canonical teams or reviewed aliases in the title, competition marker in title/snippet, and publication 75 minutes–72 hours after kickoff. Reject one-team, wrong competition/date/year, youth/women's/classic/friendly/gaming and future uploads. Explicit dates use the Vietnam match date. Conservative matching can miss legitimate localized titles; it does not attach weak guesses.

Types: HIGHLIGHT, EXTENDED_HIGHLIGHT, GOALS, INTERVIEW, PRESS_CONFERENCE, ANALYSIS, REACTION, WATCH_ALONG, OTHER. Ancillary/reaction/watch-along markers take precedence over the word highlight. Primary selection uses source tier first, then highlight → extended → goals, configured priorities and stable ID. Related ancillary videos may be retained as metadata but never become primary highlights. Source/classification is an application decision, not YouTube certification; UI discloses this.

The existing provider/externalId unique key makes upserts idempotent. Existing videos cannot be reassigned to a different match/source. A partial unique index enforces one primary per match; primary changes lock the Match row. Public reads revalidate current rights/identity/freshness and may select another safe stored fallback. They never trust a stale primary flag or unreviewed legacy video alone.

## Availability and retention

Only public, processed, non-live items qualify. Explicit VN restrictions reject a video. Missing region or per-video language information remains UNKNOWN/null; channel language does not prove a video's language. UI identifies YouTube/channel, type, original title, Vietnam publication time and uncertain geo status. It offers safe direct watch links only. Missing video gives: **Chưa tìm thấy highlight tiếng Việt từ nguồn được xác minh.**

AVAILABLE, UNAVAILABLE, PRIVATE, REMOVED and UNKNOWN are supported. Public API omissions mean UNAVAILABLE because private versus deleted cannot be distinguished reliably. Refresh omissions withdraw selection and clear obsolete cached title/snippet/image/duration; transient failures preserve good data. Public checks must be less than seven days old.

[YouTube policies](https://developers.google.com/youtube/terms/developer-policies) require API metadata to be refreshed or removed within 30 days. Run refresh/cleanup **at least daily**, even after removing the key. Managed unreferenced videos and stale API-resolved channel IDs expire at 29 days. Hiding stale data alone is insufficient maintenance. M12 brief integration stores internal video references without a restrictive Video FK or copied API metadata; reads resolve the M11 gate and deletion yields a clean fallback without changing brief history. No scheduler is added here.

## Configuration and commands

Enable YouTube Data API v3 in your Google Cloud project and set the existing server-only YOUTUBE_API_KEY in ignored .env. Restrict the key to the API and deployment appropriately. Never paste keys into chat or use NEXT_PUBLIC_ for secrets. Builds/startup need no key; unconfigured sync skips gracefully and fresh stored links remain usable. DATABASE_URL is required for database commands; there are no new environment variables/dependencies.

```powershell
npm.cmd run db:migrate:deploy
npm.cmd run video:sync -- registry
npm.cmd run video:sync -- smoke
npm.cmd run video:sync -- recent
npm.cmd run video:sync -- match <internal-match-uuid>
npm.cmd run video:sync -- refresh
npm.cmd run video:sync -- cleanup
npm.cmd run build
npm.cmd run start
```

Replace the angle-bracket argument with an actual internal UUID. Visit an existing completed /match/[slug]. Smoke resolves configured source identities, then considers at most one recent match/one channel query. No eligible match/video is an acceptable result. Inspect safe job counters/status instead of environment variables or raw API responses.

Recent mode considers three completed matches from seven days, two configured sources per match, five results per query. Explicit match discovery is limited to 14 days; video publication still needs the 72-hour window. Material match/mapping hashes cache positive/negative discovery for 12 hours. A valid preferred Vietnamese rights-holder highlight stops repeat discovery. Existing metadata refreshes at most daily; refresh handles ten match groups per invocation, at most 50 IDs per metadata request. No continuous polling.

An atomic application budget permits ten searches per UTC day; consult [current API search documentation](https://developers.google.com/youtube/v3/docs/search/list) and your Cloud quota page for provider limits. This count is not an assertion about Google quota-unit pricing. A five-minute global JobRun lease prevents overlapping jobs. Quota failure persists a 24-hour cooldown and stops requests. One channel/query failure allows other approved sources to proceed unless quota/authentication prevents useful continuation. Eight-second timeout; metadata transient failures retry once, searches never retry. Malformed responses cannot overwrite good metadata.

JobRun records controlled outcome/error/counters/processed records/attempts/lease. ProviderStatus records last success/failure, health, daily budget and cooldown. Skipped cooldown/missing-key runs do not fabricate successful sync times. Keys travel in server request headers; controlled logs never serialize request URLs, headers, raw provider errors or credentials.

## Migration, tests and limitations

Additive migration **20261017160000_video_highlights** adds VideoSource, VideoSourceCompetition and VideoSyncState and extends the existing Video model with nullable registry/mapping links, type/availability/language/snippet/primary/freshness metadata, indexes and checks. The old NewsSource relationship remains. No reset or match/news/AI/transfer rewrite.

```powershell
npx.cmd prisma validate
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```

Tests use deterministic provider fixtures and disposable PGlite with all real migrations: source hierarchy, reuploads/wrong matches, ancillary types, expiry/revocation, duplicates/one primary, key/quota/timeout failures, independent channel failure, unavailable metadata, caching/budget, safe links/original titles and Vietnamese rendering. Production-route smoke uses the existing configured match for the empty state and a separately created PostgreSQL database for video-present/revocation states. Fixtures never enter the configured database.

Live YouTube authentication/channel resolution/real candidate persistence remains optional local validation because the key was absent during implementation. Actual geo/device playback is not asserted. Matching is intentionally conservative. Review and daily retention maintenance are operational duties until later scheduling/admin milestones. No random reuploads, compulsory imagery, embeds or automatic title translation.
