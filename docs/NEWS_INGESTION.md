# Milestone 5 — free-first news ingestion

Status: **Milestone 5: GO** under the owner's later one-permitted-source acceptance rule. A live, licence-verified Wikinews article has been ingested; league/club website permissions remain pending and those four adapters stay disabled. See [WIKIMEDIA_NEWS.md](WIKIMEDIA_NEWS.md) for the new API adapter, source settings, licence evidence, User-Agent, dates and real acceptance results. The generic/official-source rules below remain applicable to those restricted candidates. No paid service, news UI, translation, AI, reliability engine or semantic clustering is implemented.

## Architecture and configuration

`NewsProvider.fetchLatestArticles({cursor, limit})` → adapter → normalized/validated article metadata → isolated sync service → transactional PostgreSQL persistence. Application services consume the interface. Adapter selection and fixed HTTPS endpoints are in `lib/news-runtime.ts` / `providers/news/sources.ts`; parsing and network code remain in the adapter directory. No browser imports/providers or public sync endpoint exist.

`OfficialNewsProvider` has isolated league/club configurations sharing RSS/Atom and HTML metadata strategies. XML parsing is validated with fast-xml-parser; Cheerio reads JSON-LD NewsArticle/Article metadata and configured card links. Scripts are never executed; hydration blobs, article bodies, embedded resources, images and linked article pages are not fetched. RSS `description` / Atom `summary` can supply a permitted short excerpt; `content:encoded`, Atom `content` and JSON-LD `articleBody` are ignored. Invalid XML/unsafe entity declarations, unsupported layouts and challenge pages produce controlled failures. Actual live HTML layouts remain unverified until access is permitted; synthetic fixtures are not claimed as captured live pages.

The registry reuses NewsSource.type (sourceType), reliabilityScore, enabled, accessPolicy and review metadata, adding source identity, ingestion method and permission controls. RSS/ATOM/HTML_INDEX/OFFICIAL_PAGE are implemented, plus the dedicated Wikinews API adapter. Other API/manual adapters fail explicitly. A new feed endpoint/configuration must be added centrally; changing a database method does not discover a feed URL automatically.

Source metadata is registered idempotently by `news:sync` and **never auto-enabled**. Registration preserves operator-edited settings. Enable/disable, reliability score, language, type and method live in PostgreSQL; fixed endpoints and parser selectors are reviewed source code. DB endpoint URLs are not arbitrary fetch targets. A compatible definition is required for each source slug/domain; unknown adapters fail independently.

## Initial official candidates and rights

| Slug | Discovery endpoint | Default | Access evidence / remaining review |
| --- | --- | --- | --- |
| premier-league | https://www.premierleague.com/en/news | Disabled | [Premier League terms](https://www.premierleague.com/en/terms-and-conditions) require prior approval for database reuse/deep links beyond private use. |
| la-liga | https://www.laliga.com/en-GB/news | Disabled | [LaLiga legal notice](https://www.laliga.com/en-GB/legal/legal-web) limits use to personal/non-commercial use and restricts commercial reuse. |
| liverpool | https://www.liverpoolfc.com/news | Disabled | [Official legal hub](https://www.liverpoolfc.com/legal); permission for this ingestion/reuse has not been established. |
| barcelona | https://www.fcbarcelona.com/en/football/first-team/news | Disabled | [Official legal notices](https://www.fcbarcelona.com/en/legal-notices); permission for this ingestion/reuse has not been established. |

Terms were inspected on 2026-10-16. Premier League/LaLiga restrictions are explicit; club permission remains unconfirmed. These four OFFICIAL candidates register disabled with no excerpt allowance. Their configurable baseline score is not a publication reliability label. **Enabled source: wikinews-en**, added separately under compatible published licensing with per-article checks. No fictional articles replace unavailable sources.

BBC, Guardian, ESPN, Marca, AS, Reuters and other media are not seeded. Any future adapter requires its own access and reuse review; restricted RSS must not be treated as unrestricted production content. No paid API credential is required by this implementation. NEWS_API_KEY remains an unused optional future variable.

## Permission gate and storage

Before *any* upstream request, source.enabled, termsReviewed and ingestionAllowed must all be true, with nonempty reviewer, reviewedAt and permissionReference. permissionReference should identify the permission/review record, not store a secret or the full agreement. The database enforces the review fields when ingestionAllowed is true. Permission and excerpt scope are rechecked under a row lock before committing a fetched batch, including revocation during fetch. Merely enabling a source is insufficient. There is no force/ignore-rights switch.

After obtaining appropriate rights, use `npm.cmd run db:studio` to record reviewer/reviewedAt, the permission reference, accessPolicy (scope, attribution, retention), termsReviewed, ingestionAllowed, permitted maxExcerptChars and enabled. Keep maxExcerptChars at zero for headline-only permission. This implementation caps any permitted excerpt at 280 characters; **the cap itself does not establish permission**. Do not set these fields without actual rights. If approved retention/attribution requirements cannot be met by current storage, keep the source disabled until they can be enforced. No automatic retention/deletion scheduler is included in this milestone.

NormalizedArticle contains sourceName, sourceUrl, nullable canonicalUrl, titleOriginal, nullable excerptOriginal, language, nullable publishedAt and collectedAt. Original Unicode/language and timestamps are preserved; unambiguous timezones normalize to UTC. Missing/relative/timezone-ambiguous publication dates stay null, never collection time. Missing date or excerpt results in NEEDS_REVIEW; every new article remains DRAFT, with no Vietnamese fields, story classification or publication reliability class. Later processing must work only with permitted material and must not fill missing evidence with AI guesses.

No full body or raw page/feed is persisted, even when a feed includes one. Short description/headline/URLs are untrusted source material, not instructions. Articles retain source foreign keys and original collection time. Future explicit licensed-full-text support would require a separate reviewed change.

## URL identity and reruns

Resolve same-host relative links against the configured endpoint; require HTTPS, approved domain and an article path, reject userinfo/ports/off-origin canonicals, remove fragments and only known tracking parameters (`utm_*`, fbclid, gclid, mc_cid, mc_eid), sort remaining parameters. Meaningful parameters/path case are preserved. Do not guess a canonical from the index-level link; only explicit item canonical metadata is accepted.

The existing non-null Article.canonicalUrl uses sourceUrl as an identity fallback when no canonical is declared. New ArticleUrl aliases persist each observed source/canonical URL, including later canonical discovery and cross-column crossovers. A transaction advisory lock plus URL primary key and existing Article uniqueness prevent duplicate identities across reruns/concurrent ingestion. If two aliases already identify different articles, neither is merged/deleted; the job records a conflict/WARNING for editorial review. This is exact URL deduplication, not semantic clustering.

Incomplete reruns never delete good data. Original title/source/collection time and manual/processed/published content are preserved; missing date/excerpt/canonical metadata may be filled only on unprocessed drafts without manual overrides. Original aliases stay attached; a retry cannot reset editorial processing or publish an article.

## Operations, pacing and failure isolation

Each source has a separate `NEWS:<slug>` ProviderStatus and a `news-sync` JobRun logical identity. A five-minute lease prevents overlapping runs; six-hour successful snapshots avoid unnecessary requests, with a five-minute retry delay for failures/partial results. HTTP ETag/Last-Modified validators are persisted as bounded cursors; 304 does not reparse or insert articles. Partial responses clear conditional validators so rejected items are not permanently hidden by 304. Cursor is a snapshot validator, not a promise of historical pagination.

Normal runs fetch at most 20 articles per source; smoke fetches at most two. Each eligible source reads robots.txt plus one index/feed snapshot. No continuous poll or linked-page fan-out. Robot policy must be readable and permit the configured endpoint; inaccessible/blocked/challenge policies fail closed. Crawl-delay is honored up to ten seconds; longer requirements mark the adapter unavailable. Requests identify FootballMorningBriefBot/0.1 and wait at least one second between robots and listing requests. Redirects/auth blocks/technical restrictions are not bypassed. This is not a robots.txt licence grant.

Request/body timeout is ten seconds with bounded response sizes (256KB robots / 2MB metadata). At most one retry with jitter is allowed for timeout/network/5xx; no immediate retry for 401/403/429 or malformed responses. 429 records a persisted cooldown (at least one hour, up to one day). A failing source does not abort other sources. Job records include attempts, processing/created/duplicate/rejected/conflict counts, safe errors, validators and completion status. Logs contain controlled source/job/count/code fields; no raw errors, URLs, page bodies or credentials.

## Local Windows commands

Use npm.cmd/npx.cmd when PowerShell blocks .ps1 shims; do not change ExecutionPolicy. Database commands require DATABASE_URL. Live Wikinews requests also require a contact-bearing WIKIMEDIA_USER_AGENT; no news key is needed. Both are server-only.

```powershell
Set-Location D:\PNGVIET\FotBan
npm.cmd ci
npm.cmd run db:check
npm.cmd run db:migrate:deploy
npx.cmd prisma validate
npx.cmd prisma generate
npm.cmd run news:sync -- sources
npm.cmd run news:sync -- all
npm.cmd run news:sync -- source premier-league
npm.cmd run news:sync -- smoke
```

Current behavior: `sources` lists four disabled candidates plus enabled Wikinews; `all` skips restricted candidates and syncs eligible Wikinews. Selecting a disabled source exits nonzero. Smoke passes with real permitted records, or reports an explicit failure if none can be verified. A repeat may explicitly use previously verified cached rows. Do not disable permission/licensing gates to make smoke green.

For approved Wikinews, use `source wikinews-en` or `smoke`; the configured source's per-article licence is mandatory. Repeated smoke can report persisted licensed rows with cachedVerification=true, making no upstream calls. For the four restricted candidates, **after permissions and live compatibility are confirmed**, run `source <slug>` once and inspect persistence/provenance. To verify a live refetch, repeat after the six-hour interval; do not hammer sources or force-reset jobs. Parser changes need sanctioned samples and deterministic tests.

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```

Tests run offline with synthetic fixtures and disposable PostgreSQL (PGlite), executing production SQL and checked-in migrations. They never use DATABASE_URL or public sites. The owner's one-source live acceptance gate has passed with a real licensed Wikinews record and verified reruns; the other four sources retain their separate pending access gates. Stop after Milestone 5; no AI processing starts automatically.
