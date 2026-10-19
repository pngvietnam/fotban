# Milestone 3 — free-first structured match data

Status: implementation and deterministic tests are separate from live API acceptance. The current execution environment has no FOOTBALL_DATA_API_KEY, so real EPL/La Liga API-to-DB evidence is pending. No synthetic production feed exists. See PROGRESS.md for executed checks.

## Architecture and scope

The core uses the free football-data.org v4 adapter. No paid sports/news/media/social provider is a required dependency. Services accept the vendor-neutral MatchProvider contract in `types/match-provider.ts`; private Zod DTO schemas and normalization live under `providers/football-data/`. `lib/match-runtime.ts` is the composition root selecting FootballDataMatchProvider and injecting the shared PostgreSQL rate gate. The Next API routes read only PostgreSQL and never call the external API or start a sync.

The contract has getCompetitions, getTeams, getMatches, getMatch, getMatchEvents, getMatchStats and getStandings. Capabilities explicitly report events/advancedStats/realtime as false for this adapter. Event/stat methods return an unavailable result; they do not present fabricated empty datasets as verified zero events/stats. No paid add-ons or automatic provider fallback are enabled. See the provider's [current pricing/capability matrix](https://www.football-data.org/pricing).

Provider codes PL and PD map centrally to stable internal keys premier-league and la-liga in `providers/football-data/config.ts`. Add reviewed competition mappings there to extend coverage without changing the interface. Future competitions still need an entitlement/terms check; a CUP standing endpoint may legitimately be unavailable. No future video, media, news or social provider is implemented. The user's new free-first future directions supersede earlier vendor suggestions, but their implementation remains in later milestones.

## Configuration and commands

Register for the free tier, then set FOOTBALL_DATA_API_KEY in your ignored `.env` or server secret environment. Do not paste the key into chat, commit it, prefix it with NEXT_PUBLIC_, or put it in a URL. The adapter sends it only in X-Auth-Token over fixed-origin HTTPS, rejects redirects, keeps it in a private class field and never logs upstream bodies/errors/headers. Logger redaction includes this environment name and token headers. The build does not require a key; actual API invocation without one fails with NOT_CONFIGURED. SPORTS_API_KEY is a reserved legacy variable, not a fallback or required paid dependency.

Run pending migrations first:

```powershell
Set-Location D:\PNGVIET\FotBan
npm.cmd run db:migrate:deploy
npx.cmd prisma validate
npx.cmd prisma generate
npm.cmd run db:check

# Inspect supported competitions/current season references (one request).
npm.cmd run provider:sync -- competitions
# Complete club metadata/membership for each current season (one request each).
npm.cmd run provider:sync -- teams PL
npm.cmd run provider:sync -- teams PD
# The teams response also carries squads: players, PLAYER identities and observed
# PlayerClub memberships (start = first observed, end = no longer listed) are stored.
# Date-bounded fixtures/results; defaults to UTC today-7 through today+14.
npm.cmd run provider:sync -- matches PL
npm.cmd run provider:sync -- matches PD
# Infrequent standings refresh; unavailable/forbidden leaves existing data intact.
npm.cmd run provider:sync -- standings PL
npm.cmd run provider:sync -- standings PD
```

Matches accept `--from YYYY-MM-DD --to YYYY-MM-DD` (maximum 31-day difference) and optional `--season YYYY`. Teams/standings accept `--season YYYY`. `--force` bypasses the DB freshness cache, **not** pacing/cooldown/lease protection. Use it only for deliberate corrections or a failed acceptance attempt; do not put it in a polling loop. No CLI framework, worker, continuous polling or scheduler is added.

## Normalization and safe persistence

Normalization validates before persistence. External IDs become strings inside provider references, never internal primary keys. Mappings use provider FOOTBALL_DATA and typed ExternalIdentity rows for LEAGUE, SEASON, CLUB and MATCH. Seed league slugs are reused; ClubSeason records league membership. Seasons retain provider dates and map by external ID when available, with league/name as the fallback identity. Club identity is never merged merely because names resemble each other. No player/squad processing is added.

Teams retain the supplied canonical name, optional shortName/TLA, country and venue. Missing optional values do not erase previously known values. A fixture with missing team identity, unknown kickoff, unknown status or invalid required fields is skipped with a count/warning; no fake club or kickoff is invented. A malformed top-level envelope fails the operation safely. Standings rows use normalized relational fields; malformed tables are skipped as a whole. No sync deletes records simply because a later response is empty/partial. Retained standings rows carry individual fetchedAt timestamps, so consumers must handle mixed freshness rather than assume every stored row came from the latest request.

All kickoff/provider timestamps remain UTC ISO instants; persistence uses timestamptz. Local conversion belongs to future presentation code, with Asia/Ho_Chi_Minh for match display. Editorial Asia/Bangkok settings retained from the spec have the same UTC+7 offset; neither is applied inside the adapter.

Status mapping: TIMED→SCHEDULED, IN_PLAY→LIVE, PAUSED→HALFTIME; other supported states map directly. AWARDED maps to FINISHED with the original administrative status retained privately in Match.providerStatus. Future presentation must distinguish awarded results if it exposes them; no actual played events are implied. Unknown statuses are skipped instead of coerced. New provider status values need a reviewed adapter mapping.

For REGULAR duration, internal homeScore/awayScore use fullTime (running/final regulation score). For extra-time/shootout games, they use regularTime only; homeExtraTimeScore/awayExtraTimeScore mean **goals scored during extra time**, not the cumulative 120-minute total. Penalty fields mean shootout goals. An aggregated fullTime is never misrepresented as a regulation score or used to guess missing components. Score pairs must be complete/nonnegative; unknown or ambiguous components remain absent. Scheduled/postponed/cancelled fixtures never acquire a guessed 0–0 score. See the official [score semantics](https://docs.football-data.org/general/v4/overtime.html).

Writes execute parameterized SQL through Prisma and the existing PostgreSQL schema, inside a transaction. Identity creation takes a transaction-scoped advisory lock only during persistence; network calls and throttle waits occur outside it. This prevents concurrent modes from creating orphan/duplicate identities. Provider/external uniqueness, upserts and FKs are enforced in PostgreSQL. Match.providerUpdatedAt rejects older/undated regressions of known snapshots; lastUpdatedAt records the successful receipt of a persisted snapshot. Missing values use preservation updates, not null overwrites. Primary Match.provider/externalId remain the initial origin; multi-provider authority/reconciliation policy is future work even though aliases can be stored.

## Rate limits, caching and operations

The [provider API policy](https://docs.football-data.org/general/v4/policies.html) documents the free request allowance. Default pacing is one request start per 7 seconds, conservatively below 10/minute. The composition root atomically reserves slots in ProviderStatus.nextRequestAt, sharing pacing across CLI processes using this database/provider identity. A standalone adapter also serializes/paces its own requests. Other deployments or scripts using the same API key outside this shared database are outside this limiter; coordinate them rather than assume a per-key global limit.

JobRun leases prevent overlapping syncs of one logical resource/window for ten minutes. Canonical resource keys are independent of object property order. Successful complete jobs cache competitions/teams/standings for 24 hours and date-bounded matches for 6 hours. A morning sync is sufficient for this product; no realtime promise is made. A different date window is a different cache key. Finished historical matches outside the selected window are not repeatedly fetched. Corrections remain possible via a deliberate refresh.

Requests use a 10-second abort timeout covering body receipt. Temporary network/timeout and selected transient HTTP failures retry at most twice with exponential delay/jitter, while still taking a paced slot. 401/403, invalid JSON, malformed payloads and unsupported responses do not retry. A 429 records Retry-After (minimum one-minute cooldown), fails immediately without repeated calls and blocks later requests until the DB cooldown expires. An incomplete operation records WARNING/PARTIAL and is not treated as a fresh complete cache hit. A completely malformed/HTTP failure records FAILED and preserves prior data. Full successful empty match lists are valid no-match windows; they do not delete older records or fabricate results.

ProviderStatus tracks latest health/check, successful/failed sync times, last data receipt, records processed, cooldown and safe error code/message. JobRun records attempts, lease, correlation ID, counts and a normalized checkpoint. Only controlled metadata is logged, never raw exception text/DTOs/key material. Successful cached returns process zero new records and make zero external calls. There is no background retry daemon in this milestone.

## Read APIs, attribution and images

Internal data-only read endpoints:

- `GET /api/matches?league=premier-league&from=YYYY-MM-DD&to=YYYY-MM-DD&page=1`: UTC date filter, maximum 31-day difference, deterministic 50-record pages.
- `GET /api/matches/<internal UUID>`: normalized persisted detail; missing IDs return 404.
- `GET /api/standings?league=la-liga`: latest stored season's table rows, each with fetchedAt.

Reads do not require the provider key, consume no provider quota and do not expose provider DTOs or external crest metadata. Missing DB gives 503; invalid filters give 400. Empty stored data is an empty result, not a synthesized match feed. Attribution metadata accompanies persisted provider records through the central safe `lib/data-sources.ts` configuration.

The exact required visible attribution is configured as: **Football data provided by the Football-Data.org API**. Future public match UI must render it visibly before shipping. Provider [terms sections 7 and 9](https://www.football-data.org/about) require attribution and leave graphic rights with their legal owners. Club.externalCrestUrl is external metadata only; it is never copied to the licensed/reusable Club.logoUrl field, returned by these APIs, downloaded, cached or rehosted. Public club projections include text/shortName/TLA for text/initial fallbacks. A later licensed/open MediaProvider must determine reusable imagery rights. Attribution does not grant crest rights. The terms also restrict continued data referencing after subscription cancellation; review retention/public display obligations before release or provider termination.

## Minimal local live smoke test

With a configured local server key, this consumes at most one initial matches request per configured league (2 total requests, excluding bounded retries). Do not run all the sync commands first merely to smoke-test access:

```powershell
npm.cmd run provider:sync -- smoke
# Same UTC day/window: rerun to verify cached idempotency without new requests.
npm.cmd run provider:sync -- smoke
npm.cmd start
```

In another terminal, use current UTC dates matching your sync window (this example derives defaults):

```powershell
$from = [DateTime]::UtcNow.AddDays(-7).ToString('yyyy-MM-dd')
$to = [DateTime]::UtcNow.AddDays(14).ToString('yyyy-MM-dd')
Invoke-RestMethod "http://localhost:3000/api/matches?league=premier-league&from=$from&to=$to"
Invoke-RestMethod "http://localhost:3000/api/matches?league=la-liga&from=$from&to=$to"
```

Record real match counts, per-league internal API reads and repeat-run counts in PROGRESS.md without credentials/raw licensed payloads. If the window has no matches, choose another date window in the permitted season rather than inserting sample data. Smoke exits nonzero on missing key, partial response or a fresh no-result window, because those cannot prove real match persistence. Standings, full club metadata and richer provider detail have separate sync commands/capability checks; the two-request smoke does not claim to verify those endpoints or any paid fields.

No key was available in Codex, so the live API acceptance gate remains pending local validation. Database migration, mocked-transport SQL tests, a real Prisma rollback-only persistence probe and API empty/error smoke tests are different evidence and do not replace this gate. Milestone 4 is not started.
