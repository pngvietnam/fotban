# Wikinews — permitted news source

Milestone 5 adds `WikinewsNewsProvider` behind NewsProvider, using the public English Wikinews MediaWiki Action API. The owner's latest acceptance rule permits Milestone 5 GO after one real reusable article is ingested. Premier League, LaLiga, Liverpool and Barcelona site adapters remain disabled; Wikimedia permission does not extend to those sites. No Milestone 6 feature is implemented.

## Licence verification and storage

Reviewed on 2026-10-16: [Wikinews copyright policy](https://en.wikinews.org/wiki/Wikinews:Copyright), [API access policy](https://www.mediawiki.org/wiki/Wikimedia_APIs/Access_policy), [User-Agent policy](https://foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_User-Agent_Policy), [rate limits](https://www.mediawiki.org/wiki/Wikimedia_APIs/Rate_limits) and [CC BY 4.0 conditions](https://creativecommons.org/licenses/by/4.0/).

The adapter reads API `siteinfo.rightsinfo`, verifies the licence name/URL against a narrow allowlist, and parses the machine-returned copyright policy including its dated 4.0/2.5 distinction. It accepts only English main-namespace Published articles with a single valid publication day **after 2024-12-16**. Older/transition-date articles, missing licences, incompatible notices, disputed/retracted pages and policy drift fail closed. The current site licence is not blindly applied to all historical articles.

Each article stores CC BY 4.0 name/URL, title/source URL, language, publication day, collection time, licence verification time, immutable article and policy revision URLs, and attribution identifying Wikinews, title, source, contributors/history, revision, licence and modifications. Future publication must retain/display those credits. Source and article commercialReuseAllowed are asserted only after content passes the checks. No image/logo licence is inferred.

Only a short unquoted lead may be retained (maximum 280 permitted characters). Quoted paragraphs are omitted rather than spliced; quotes, images/captions, media/embeds, references and third-party source lists are excluded. No linked publisher page or media file is fetched, no full/raw article body is persisted and no AI summary is produced. If a safe lead cannot be isolated, excerpt remains null. New articles remain DRAFT and require later editorial/publication gates.

Wikinews exposes publication days, not exact clock times. `publishedAtPrecision=DAY` explicitly qualifies the stored UTC-midnight date; page modification/category-addition time never substitutes for publication time. Archived reporting stays historical, irrespective of current collection/sync time.

## Source and request configuration

The `wikinews-en` registry row is PUBLICATION, official=false, enabled=true, termsReviewed=true, permissionStatus=ALLOWED, ingestionAllowed=true and requiresReusableLicense=true. It starts commercialReuseAllowed=false; a verified article commit sets that flag true for the permitted subset. Reliability 80 is editable source metadata, not a publication reliability class. Registry reruns preserve operator edits, including disablement.

The centralized discovery query uses Published plus explicit EPL/LaLiga/club terms and includes relevant club stories outside match-report categories. Category assignment is incomplete; the adapter does not require a football-category tag. Coverage is sparse and often historical. One accepted article proves the ingestion path, not comprehensive daily coverage of both leagues.

Set the optional server-only `WIKIMEDIA_USER_AGENT` in ignored `.env`, using your actual reachable contact:

```dotenv
WIKIMEDIA_USER_AGENT="FootballMorningBrief/0.1 (contact: your-real-contact@example.org)"
```

The current workspace uses the owner-supplied contact; it is not hard-coded in tracked configuration. Missing identification fails before any API call and does not block application builds. No API key/account or paid Enterprise API is required.

Calls are sequential with `maxlag=5`, persisted two-second request-start spacing, a six-hour source cache and job leases. Bounded time/size and one transient retry (at least five seconds backoff) apply. 429, Retry-After and API maxlag responses set persistent cooldowns without immediate retries. Redirects/access blocks are not bypassed. No polling, new scheduler or browser provider call.

## Commands and real acceptance evidence

```powershell
npm.cmd run db:migrate:deploy
npx.cmd prisma validate
npx.cmd prisma generate
npm.cmd run news:sync -- sources
npm.cmd run news:sync -- smoke
npm.cmd run news:sync -- source wikinews-en
```

Repeated smoke may validate previously persisted licensed rows and explicitly reports `cachedVerification:true`; that is not a fresh API call.

On 2026-10-16, a live run stored one article with zero rejected/conflicting records:

- [Man starts car collision at Liverpool FC trophy parade](https://en.wikinews.org/wiki/Man_starts_car_collision_at_Liverpool_FC_trophy_parade).
- Published 2025-06-01 (DAY precision), language en, CC BY 4.0, short excerpt present, full body absent, DRAFT.
- [Article revision](https://en.wikinews.org/w/index.php?oldid=4878949); [verified policy revision](https://en.wikinews.org/w/index.php?oldid=4991371).

The successful single-article fetch used three sequential API requests: discovery/rights, policy and article revision. Earlier bounded development probes/debugging runs also occurred; three is not the total development request count. A real Prisma advisory-lock void-return defect and an overly broad disputed-category filter were found and fixed. The actual licensed record was then replayed through production Prisma sync SQL without upstream calls: zero created, one duplicate, persisted count still one. Standard CLI smoke passed via explicit cached verification. All 62 matches and four disabled official candidates remain intact.

Offline tests cover licence parsing/missing/unsupported licences, attribution and revision evidence, policy drift, dates, third-party exclusion, malformed responses, User-Agent, 429/503/maxlag and licensed adapter-to-SQL idempotency. Tests never call public APIs or DATABASE_URL. See PROGRESS.md for full validation. Stop after Milestone 5.
