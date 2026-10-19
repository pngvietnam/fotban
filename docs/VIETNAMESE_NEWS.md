# Vietnamese-first news operations

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
