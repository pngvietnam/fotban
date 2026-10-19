# Vietnamese-first news operations

## Owner grant and live feeds (19 October 2026)

The owner decided, after legal review by their counsel, to use Vietnamese publisher RSS **title + description** with per-publisher attribution and a link to the original article. No article bodies or images are fetched or stored. The grant is recorded per source by `news:grant` (reviewer `FotBan`, AdminAuditLog action `SOURCE_GRANT`); the review table further below is the earlier pre-grant assessment and is kept for history.

| Source | Feed (verified 2026-10-19) | State |
| --- | --- | --- |
| VnExpress | `https://vnexpress.net/rss/the-thao.rss` | Granted |
| Thanh Niên | `https://thanhnien.vn/rss/the-thao/bong-da-quoc-te.rss` | Granted |
| Bongda.com.vn | `https://bongda.com.vn/bong-da-anh.rss`, `bong-da-tbn.rss` (Spanish football), `tin-chuyen-nhuong.rss` (transfers) | Granted 2026-10-19; football-only specialist; Tier 2; feeds listed on its RSS page; no images in its RSS |
| VTV | `https://vtv.vn/rss/the-thao.rss` | Granted (mostly V-League; few EPL/La Liga items) |
| Dân trí | `https://dantri.com.vn/rss/the-thao.rss` | Granted |
| Thể Thao 247 | `https://thethao247.vn/bong-da-quoc-te-c2.rss` | Granted, COMMUNITY tier |
| Tuổi Trẻ | `https://tuoitre.vn/rss/the-thao.rss` | Granted; dates have no timezone and are read as UTC+7 |
| VTC News | `https://vtcnews.vn/rss/the-thao.rss` | Granted |
| VOV | `https://vov.vn/rss/the-thao.rss` | Granted; robots.txt `Crawl-delay: 20` is honored |
| Bóng đá 24h | none current (European feed last updated 2022-07-22) | Disabled |
| Bóng Đá Plus, Lao Động | no RSS directory/feed published | Disabled |
| VietNamNet | RSS host did not respond | Disabled |
| PLO | RSS redirects to tuoitre.vn/plo and returns 404 | Disabled |

```powershell
# Read-only: fetch each verified feed once and print what the relevance filter keeps.
npm.cmd run news:preview-vietnamese
npm.cmd run news:preview-vietnamese -- vnexpress-sport
# Record or withdraw the owner's grant (audited; sources without a verified feed are skipped).
npm.cmd run news:grant -- grant all --reviewer "FotBan" --reason "<reason>" --confirm
npm.cmd run news:grant -- revoke vnexpress-sport --reviewer "FotBan" --reason "<reason>" --confirm
npm.cmd run news:sync -- vietnamese
```

`news:grant` writes as a CLI operator identity (`User.authProvider='operator'`, role USER, no AuthAccount, so it cannot sign in). A revoke takes effect immediately on public reads because every read rechecks the feed snapshot against the current grant. `RSS_SUMMARY` now requires `maxExcerptChars > 0`; a zero cap used to drop every summary silently.

Ingestion details added with the grant:

- RSS sources refresh every 30 minutes (API/HTML sources keep 6 hours), with ETag/Last-Modified. A robots.txt crawl-delay up to 30 seconds is waited out; longer delays mark the source unavailable.
- Dates: `+07`-style offsets are accepted; feeds without a timezone are read as Vietnam time only for these publisher feeds (US `M/D/YYYY h:mm AM` and `YYYY/MM/DD HH:mm`, including the U+202F space before AM/PM). Impossible dates are rejected.
- Descriptions are cut at a sentence or word boundary with "…" instead of mid-word.
- Livestream links, betting tips and odds pieces ("link xem trực tiếp", "soi kèo", "nhận định bóng đá", ...) are excluded.
- Job checkpoints record `examined/relevant/irrelevant/stale/overLimit` per source.

Entity matching (`providers/ai/rules.ts`), used for relevance and entity links:

- Vietnamese club names and nicknames live in `providers/news/vietnamese-aliases.ts`, keyed by football-data club ID, and are appended to `Club.aliases` on `news:sync`. Shared nicknames ("Gà trống", "Đại bàng") are deliberately excluded.
- Upper-case codes (MU, CHE, SAN) match case-sensitively, so "che chắn"/"san bằng" are not Chelsea/Santander. Latin accents are folded (Barça = Barca, Mbappé = Mbappe).
- A short alias inside another club's longer name is ignored ("Real" in "Real Betis").
- Squad players come from football-data (`provider:sync -- teams PL|PD`) with a surname alias ("Haaland"). A surname next to a different capitalised name is someone else ("Roy Keane", "David Beckham").

The first live sync stored 51 relevant articles from 8 publishers (all with feed snapshots).

## Publisher cards (FeedCard)

Granted feed articles are published as **attributed publisher cards**, a separate and lower publication class than verified ArticleCluster stories. A card shows the publisher's exact headline and RSS description, never rewritten or translated, with its attribution. It does not enter the evidence-gated pipeline (M6–M8 approvals, Brief evidence), and the evidence gates are unchanged.

- `FeedCard` (migration `20261019120000_feed_cards`) stores status `PUBLISHED | HELD | HIDDEN`, label `MEDIA | COMMUNITY`, certainty `REPORTED | UNCONFIRMED`, a wording-based transfer stage `INTEREST | NEGOTIATION | RUMOR`, cited origin (e.g. "Fabrizio Romano"), hold reasons, linked match and duplicate-group key. Database CHECKs make `OFFICIAL` labels and a `CONFIRMED` stage impossible.
- Policy (`lib/feed-card-policy.ts`): community-tier sources (Thể Thao 247) are "Cộng đồng", others "Báo chí". Vietnamese hedging/interest/question wording gives "Chưa xác nhận". "CHÍNH THỨC:" headlines get a notice that the wording is the publisher's, not verified official evidence. Sensitive terms (death, crime, sexual, drugs, accusation, discrimination, violence, self-harm) **hold** a card for an operator instead of publishing it.
- Grouping (`lib/feed-card-grouping.ts`): complete-linkage, never within one publisher. Plain result reports of the same match are merged; other angles (interviews, controversy, ratings, roundups) stay separate unless headlines clearly overlap with a shared club/player.
- Every public read rechecks: card `PUBLISHED`, article not `HIDDEN`, publication time not in the future, and the publisher grant still matching the frozen feed snapshot. Hide, article hiding and `news:grant -- revoke` take effect immediately.
- `/news` shows verified stories first, then "Tin từ báo chí Việt Nam" (24 groups per page, `?bao=` offset, same league filter). `/news/bao-<article-uuid>` shows the card, the other publishers' coverage, linked clubs/players/match and a small "Xem bài gốc" credit link (`nofollow`). Card pages are `noindex` with the original article as canonical.

```powershell
npm.cmd run news:sync -- vietnamese      # sync, then publish cards automatically
npm.cmd run news:cards -- publish         # recompute cards/groups only
npm.cmd run news:cards -- held            # list cards held for review
npm.cmd run news:cards -- approve <article-uuid> --reviewer "FotBan" --reason "<reason>" --confirm
npm.cmd run news:cards -- hide <article-uuid> --reviewer "FotBan" --reason "<reason>" --confirm
```

Operator decisions are audited (`FEED_CARD_APPROVE` / `FEED_CARD_HIDE`) and are never overwritten by later publish runs.

### More feeds and images (2026-10-19)

- **Several feeds per publisher:** a registry entry may list `extraFeeds` that share the publisher's grant. The first feed keeps the stored ETag/Last-Modified; extra feeds are read without them. Results are merged without duplicates, each article records the feed it came from, a failing extra feed only marks the run partial and a failing primary feed fails the source. The per-source cap is 120 articles per run, and anything dropped by the cap is counted in the job checkpoint (`overLimit`).
- **Sources reviewed from the owner's list:** `bongda.com.vn/main-rss.html` lists many feeds (league, club, transfer); three were added. On `thethao247.vn/rss.html` the league and transfer feeds (`ngoai-hang-anh-c8`, `la-liga-c9`, `chuyen-nhuong-c14`) answered 403 to the bot and are not used (the block is not worked around). The Feedspot directory lists only English-language sites and fan blogs; none is Vietnamese, none is cleared by the owner's decision (which covers Vietnamese publishers) and fan blogs are not reliable media, so none was added.
- **Images:** see [IMAGES.md](IMAGES.md).
- **Terms review date is frozen into every stored story.** Each article's feed snapshot records the date the publisher terms were reviewed, and a story is public only while that date equals the source's current `lastTermsReviewAt`. A grant therefore moves the date only when the terms really change (scope, feed, attribution, reference, commercial flag); switching images on or changing the reviewer does not. If the date does move, existing stories are hidden until the feed shows them again with unchanged text, which refreshes their snapshot. (A re-grant on 2026-10-19 moved the dates by mistake and hid the older stories for a short time; the dates were restored from the stored snapshots, audited as `SOURCE_TERMS_DATE_RESTORE`, and the grant command was fixed.)

### Continuous freshness worker (replaces fixed schedules)

`npm.cmd run news:worker` runs until stopped. It has no fixed clock: each pass (about every 60 seconds) asks every enabled Vietnamese source whether it is due, so news is picked up soon after a publisher updates its feed, and each pass republishes/regroups cards.

- Freshness is decided per source: a 15-minute RSS window, ETag/Last-Modified (a 304 stores nothing), robots.txt crawl-delay, persisted cooldowns after 429, and job leases. A short loop therefore costs only database checks.
- Match data is refreshed in the same loop through the existing match sync: results/fixtures for today-3 to today+10 days every 30 minutes, standings every 6 hours. This respects the free-tier pacing (one request per 7 seconds, shared across processes) and is skipped if `FOOTBALL_DATA_API_KEY` is absent.
- A failing pass never stops the loop. The loop backs off (2, 4, 8 ... up to 10 minutes, reset after a success) only when every attempted source failed; one failing or busy publisher does not slow the others, because each source has its own cooldown and lease. After an abrupt stop a source can report BUSY until its 5-minute lease expires, which is normal. A session advisory lock allows only one worker per database; stop with Ctrl+C (SIGINT/SIGTERM), which releases the lock.
- On the owner machine the worker runs as the Windows scheduled task **FotBan News Worker** (installed with `scripts/install-news-worker.ps1`, start at logon, restart on failure, one instance; `-Remove` uninstalls, `Stop-ScheduledTask` / `Start-ScheduledTask` control it). Logs go to `logs/news-worker.log`; a quiet log means a healthy loop, only syncs that stored articles and failures are logged.
- `news:tick` remains a one-shot pass for manual use.

### League hub (`/league/premier-league`, `/league/la-liga`)

A Báo Mới-style page per league with six tabs selected by `?tab=`: **Tin tức** (publisher cards for the league), **Tổng quan** (next fixtures, top-10 table, top stories), **Bảng xếp hạng** (stored table with W/D/L form of the last five finished matches), **Lịch thi đấu** (7-day windows, `?tu=YYYY-MM-DD`, previous/next arrows within 120 days of today), **Đội bóng** (clubs with position and follow links), **Chuyển nhượng** (publisher cards classified as transfer news; wording-only stages, never confirmed).

- Strict query parsing: unknown tabs, bad offsets and impossible or out-of-range dates give the invalid-filter state. A league switcher and a "Giải đấu" navigation item link to it.
- The standings, fixtures and clubs tabs are FotBan's own data from football-data.org and are indexable (attribution shown); tabs that show publisher text are `noindex`. No club crests or competition logos are used (licensing): text badges with the club code instead.
- Standings, results and form come only from stored data and show the time of the last update; the worker keeps them fresh. To backfill a season once, use `provider:sync -- matches PL --from 2026-08-01 --to 2026-08-31` (31-day maximum per request) for each window.

### Club hub (`/club/club-<id>`)

The per-club page gathers everything about one club in one place: header (league, table position, points, form, next match, follow button) and six tabs via `?tab=`: **Tổng quan** (next/last matches, latest news, transfers), **Tin tức**, **Lịch thi đấu** (next five, last five), **Chuyển nhượng**, **Cầu thủ** (current squad by line, with follow links) and **Vui**.

- Slugs are `club-<club id>`, so every place that knows a club ID links to it: standings rows, league club grids, club chips on cards and the context blocks. Only clubs in a current Premier League/La Liga season have a page; others are not-found.
- **Vui** lists lighthearted pieces **written by the publishers themselves** (trolling, memes, funny moments, detected from Vietnamese headline wording) with the notice that they are entertainment, not confirmed news. It never ingests fan or social-media posts, so no moderation or user content is involved; it stays empty until publishers run such pieces.
- Squad and positions come from the data provider's last sync and can lag transfers. Club data tabs (fixtures, squad) are indexable; tabs with publisher text are `noindex`.
- Product direction: a compact "football social network" without likes, comments or interaction: one fast, concise place per club, league and player.

### Player page (`/player/player-<id>`)

Profile from the data provider only: name, club (linked), league, position line, nationality, age (completed years from the stored birth date) and the time the data was last updated, with the football-data attribution. There are no statistics, ratings or photos because none are supplied or licensed. Tabs: **Tổng quan** (club's next match and the latest stories), **Tin tức** and **Chuyển nhượng** (publisher cards linked to the player; wording-only stages).

- A page exists only while the provider lists the player in a current Premier League/La Liga squad; a departed player, one in another league or without a club is not-found.
- Player slugs are `player-<id>`, so squads, club chips on cards and the personal feed link to it. Pages show publisher text and are `noindex`.

### Personal feed (`/following`) and homepage block

Signed-in readers also get an **Đội của tôi** block at the top of `/`: followed clubs and leagues, the next three matches and the three newest stories, with a link to the full feed. A reader with no follows sees an invitation to choose teams. Guests never see it and cost nothing: without a session cookie the session is not looked up, any failure hides the block, and the public Brief below is unchanged. The page is dynamic and sent `private, no-store`.

A signed-in reader sees one personal page built from what they follow (M15 follows): a summary with links to followed league and club hubs, the next and last matches of followed clubs, **new stories** linked to followed clubs, players or leagues (a followed league brings its whole news stream), followed **transfers**, and **fun** pieces. A guest is redirected to sign-in with a return to `/following`; with no follows the page offers clubs to pick. The navigation link "Bảng tin của tôi" replaces "Tài khoản / Theo dõi"; follow management stays at `/account`.

- The page is `noindex`, `Cache-Control: private, no-store`, evaluated per request and reads only the signed-in user's own follows. It adds no tracking and no new stored data: nothing is recorded about what the reader opens.
- Player follows match stories that link the player; players have no hub page yet and appear as plain text.
- The page-level sign-in flow is exercised with a real Google account only; the data layer is covered by deterministic tests. `auth:smoke` was not extended in this step.

### Ranking, detail context, homepage and scheduling

- **Ranking** (`lib/feed-card-ranking.ts`): editorial importance = distinct publishers x 3 + media bonus + a recency term that halves every 6 hours. Roundups (schedules, results, tables) come last because FotBan has its own match data. No publisher leads three cards in a row while another candidate is close. The top multi-publisher story is shown at full width. This is an editorial order, not a truth or reliability score.
- **Display only**: a leading "VOV.VN - " or "(Dân trí) - " credit is dropped from the description (stored text is unchanged). A question mark makes a card "Chưa xác nhận" only in the headline.
- **Detail context** (`services/feed-context.ts`): for up to two linked clubs, the stored league position (Standing), last finished result and next fixture (postponed/cancelled are never shown), plus the time the club's match data was last updated and the football-data attribution. Related stories: other groups about the same clubs/players in 72 hours (max 6). Follow links for clubs, players and the competition reuse the M15 account flow.
- **Homepage**: `/` shows a compact "Tin từ báo chí Việt Nam" block below the Morning Brief. It is independent of the Brief, which stays an immutable, evidence-gated document; publisher cards are not inserted into Brief items.
- **Scheduling**: `news:tick` runs the Vietnamese RSS sync and publishes cards; it respects the 30-minute source cache and per-source leases. Schedule it every 30 minutes together with a match refresh, because card context reads stored matches: `npm.cmd run provider:sync -- matches PL` and `... PD` (cached 6 hours) and `standings` daily (24-hour cache). Windows Task Scheduler: repeat `npm.cmd run news:tick` every 30 minutes with Start in set to the repository. Nothing is installed automatically.

Vietnamese publisher RSS feeds are the primary **planned production** news path. Official league/club adapters remain evidence candidates; permitted international sources remain secondary. GDELT DOC is optional discovery metadata, not an editorial publisher or a publisher reuse licence. No external provider runs during `/news` rendering.

## Review on 19 October 2026

Reviewing terms is not permission approval. No written publisher permission has been supplied. The reviewed pages do not establish an unambiguous commercial feed-republication grant for this project. Consequently **all 13 Vietnamese candidates start disabled**, with `ingestionAllowed=false`, `commercialReuseAllowed=false`, `permissionScope=NONE`. Existing operator configuration is never overwritten by registration.

| Priority | Source | Review outcome / production blocker | Primary reference |
| --- | --- | --- | --- |
| A | VnExpress Sport | Reviewed; RSS personal/nonprofit; commercial copying needs written approval | [RSS](https://vnexpress.net/rss), [terms](https://vnexpress.net/dieu-khoan-su-dung) |
| A | Thanh Niên Sport | Reviewed; RSS attribution instructions coexist with a written-permission copyright footer; clarify commercial feed scope | [RSS and conditions](https://thanhnien.vn/rss.html) |
| A | VTV Sport | Reviewed; RSS attribution instructions coexist with a written-permission footer; clarify commercial feed scope | [RSS and conditions](https://vtv.vn/rss.htm) |
| A | Dân trí Sport | Reviewed; RSS personal/nonprofit and written-permission footer | [RSS and terms](https://dantri.com.vn/rss.htm) |
| B | Thể Thao 247 | Reviewed; RSS personal/nonprofit; written IP permission; mixed member content needs separate editorial review | [RSS](https://thethao247.vn/rss.html), [content agreement](https://thethao247.vn/thoa-thuan-chia-se-noi-dung-p8.html) |
| B | Bóng đá 24h | Reviewed; RSS personal/nonprofit; current feed endpoint still needs verification | [RSS and limits](https://bongda24h.vn/rss.html) |
| B | Bóng Đá Plus | Reviewed; footer requires written republication permission; feed endpoint not verified | [Publisher](https://bongdaplus.vn/) |
| B | VietNamNet Sport | Reviewed; written permission for republication; current feed endpoint not verified | [Publisher](https://vietnamnet.vn/) |
| B | Tuổi Trẻ Sport | Reviewed; RSS personal/nonprofit; current feed endpoint needs verification | [RSS and terms](https://tuoitre.vn/rss.htm) |
| B | VTC News Sport | Reviewed; RSS personal/nonprofit; current feed endpoint needs verification | [RSS and terms](https://vtcnews.vn/main-rss.html) |
| B | VOV Sport | Reviewed; written permission required; current feed endpoint not verified | [Publisher](https://vov.vn/) |
| B | PLO Sport | Unresolved: RSS directory redirected to Tuổi Trẻ during review; publisher identity/terms not verified | [Requested directory](https://plo.vn/rss.html) |
| B | Lao Động Sport | Unresolved: publisher/feed terms unavailable in review | [Publisher](https://laodong.vn/) |

These are operational review outcomes, not claims that RSS does not exist or that every possible use is prohibited. A restricted row uses the existing `RESTRICTED` enum; an incomplete review uses `UNREVIEWED`. Feed endpoints are retained only where verified from the publisher's directory; `null` means unresolved, never a guessed URL. Tier A priorities are 10–40; Tier B 50–130. Reputation is independent of rights.

## Permission matrix and activation

`NewsSource` stores enabled/review/status, `permissionScope`, `commercialReuseAllowed`, ingestion method, `feedUrl`, `lastTermsReviewAt`, `attributionRequirement`, priority and `ingestionNotes`. The authenticated ADMIN source form supports these fields and audits edits. Before activation, record the actual licence/permission reference and scope, verify the same-host HTTPS RSS URL, attribution, excerpt cap and commercial scope. Do not set ALLOWED just to populate the feed. Source tier/score cannot grant permission.

Supported narrowly scoped publisher grants:

- `RSS_METADATA`: headline, URL, timestamp and categories; no publisher description. Insufficient summary stays under review.
- `RSS_SUMMARY`: the above plus the permitted RSS description, capped at the reviewed excerpt limit (at most 280 characters in the current DTO).
- `DISCOVERY_METADATA`: discovery only; never permission to process or publicly republish publisher content.
- `NONE`: no granted feed scope.

Publisher terms are separate from open CC licences. `ArticleFeedSnapshot` binds the exact source/title/excerpt/publication timestamp to the feed URL, terms URL, attribution and terms-review version. Existing CC BY Wikinews handling remains intact. Processing, reliability and public reads recheck the current grant against the snapshot. Revocation, scope changes or terms-reference changes invalidate eligibility. A publisher grant does not automatically publish an article.

## Ingestion and processing

`VietnameseRssNewsProvider` implements `NewsProvider`, using existing robots-aware `NewsHttp`, URL normalization, JobRun/cache/lease handling and draft persistence. It reads one configured RSS feed, never follows article links, never stores full bodies, images or `content:encoded`, and rejects unsafe XML/entities. At most 200 feed entries are examined and 20 accepted per source. Only the previous 24 hours are considered; future/unknown dates and unrelated sports are excluded. Competition anchors and canonical current-scope club/player aliases provide conservative relevance. No free-text entity identities are created.

Already-Vietnamese permitted text goes through the M6 extractive fallback without translation. Original source text is preserved; the output remains NEEDS_REVIEW until reviewed evidence and explicit M16 approval pass. Unsupported/insufficient text stays private. No invented summary, authoritative source URL or confirmation is created. External references actually present in a permitted feed description are retained as **unverified references**, never as official evidence merely because they are links. Original-source pages are not fetched.

M7 remains authoritative: established publishers are RELIABLE MEDIA sources, while speculative stories remain RUMOR/INTEREST. Official confirmation requires reviewed scoped authoritative evidence. Thể Thao 247 currently identifies as a social network and disclaims member endorsement; its conservative COMMUNITY baseline needs editorial-feed review before promotion. Copied reports are not independent confirmation. M8 handles clustering; canonical selection prefers equivalent Vietnamese sources after reliability/evidence strength, and never chooses by volume alone.

## Commands

```powershell
npm.cmd run db:migrate:deploy
npm.cmd run db:generate
npm.cmd run news:sync -- sources
npm.cmd run news:sync -- vietnamese
npm.cmd run news:accept-vietnamese
npm.cmd run news:diagnose -- --output docs/samples/news-diagnostic-after.json
```

`news:accept-vietnamese` runs one bounded sync of the Vietnamese registry, then calls existing AI, reliability and clustering services for recent persisted records. It writes actual counts and classifications to `docs/samples/vietnamese-news-acceptance.json`. Disabled sources are not fetched; zero observed records is not a claim that a blocked publisher has no news. This command never auto-publishes, changes permission or modifies the normal scheduler.

Use `/admin/stories` for grounded content/evidence review and explicit publication. Public `/news` continues to require PUBLISHED/READY plus all current-data gates. Brief-only `/?preview=1` does not expose private news. Do not turn that switch into a restricted-news preview.

## Optional GDELT discovery and diagnostics

```powershell
npm.cmd run news:discover -- --output docs/samples/news-discovery-live.json
npm.cmd run news:coverage
```

No new API key is required. GDELT uses two bounded 24-hour league queries, ten records each, six seconds apart, with finite timeouts and no automatic retries. Successful discovery caches six hours; failed/partial jobs cool down ten minutes. A database lease prevents overlap. `ArticleDiscovery` preserves metadata/provenance and GDELT attribution; publisher rows remain independently restricted. DOC `seendate` is discovery time, **not a verified publication time**. Full publisher text/media are never fetched. Returned metadata is validated and exact URLs deduplicated before entering existing private processing/reliability/clustering gates. See [GDELT API](https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/) and [dataset terms](https://www.gdeltproject.org/about.html).

`news:diagnose` is read-only and reports current persisted per-source stages and actual gate blockers, including validated fallback processing versus publishable Vietnamese content. It is bounded to 500 article details and fails rather than reporting a partial article total. Wikinews coverage uses one identified, five-result metadata query; revision timestamps are not asserted publication dates. Stored licensed article publication dates remain separate.

The additive migrations `20261018150000_news_discovery` and `20261019013000_vietnamese_rss` preserve all existing data and publication policies. No reset or fake visible records are used.
