# Morning homepage (Milestone 14)

`/` is the Vietnamese morning experience. It reads persisted internal data only; rendering never calls football-data.org, Wikinews, YouTube API or an AI provider. There are no new dependencies, environment variables, schema changes, migrations or publication operations.

## Read boundary and publication

`MorningHomepageService` runs a repeatable-read, read-only transaction. It reuses `readLatestBrief` from BriefQueryService, including M12's immutable-content/current-fact/permission validation and M11's current verified-highlight read. It then enriches **only selected brief items** with the existing checked `readPublishedStory` / `readTransferEvent` boundaries. It does not load the news/transfer list pages to assemble a second feed, rerank stories, or query Prisma from UI components. Existing M12 bounded candidate validation remains authoritative.

Public selection considers up to ten recent **PUBLISHED** revisions, with non-future publication/generation timestamps. Invalid/revoked revisions are withheld and an older still-eligible published brief may be used. **READY, DRAFT and FAILED are never public by default.** No read changes publication state. Current source withdrawal or factual correction can withhold an entire revision until regeneration; history does not grant continuing usage rights.

All homepage content and enrichment use the same database snapshot. Selected Vietnamese headline/summary and backend reliability/certainty are preserved. Enrichment must agree with that content/status before it appears; missing enrichment does not expose original-language substitutes. The view model contains display content, selected entities, links, citations and safe freshness flags; no scheduler error payload, credential or configuration-status panel is passed to the UI.

## Safe local preview

```powershell
npm.cmd run dev
# Open http://localhost:3000/?preview=1
```

Only an exact scalar `preview=1` **and server `NODE_ENV=development`** allow an eligible READY revision alongside published candidates. The same source/fact validation still applies. Preview is clearly labeled **Bản xem trước · Chưa xuất bản**. There is no preview secret, new authentication system, cookie or mutation endpoint. Do not expose a development server as a production/public deployment.

```powershell
npm.cmd run build
npm.cmd start
# / and /?preview=1 both remain PUBLISHED-only under next start.
```

Every preview-query URL has `noindex,nofollow` and canonical `/`, even if production ignores the parameter. Drafts cannot enter this preview. Existing local revisions 1–3 remain READY/unpublished; a populated public production homepage requires a separate valid editorial publication decision, not a testing bypass.

## Sections and presentation

1. **Morning header**: Vietnamese target date, actual publication/generation update time, EPL/La Liga coverage, all displayed in Asia/Ho_Chi_Minh. Stored UTC timestamps are unchanged.
2. **Morning summary**: exact M12 key points linked to their rendered card anchors, maximum six. First three are immediately visible; the rest use native keyboard-accessible `<details>`. Sparse days show fewer instead of padding facts. Full story cards appear once.
3. **Results**: exact persisted teams/score, finished label, kickoff time, match-detail link and verified-highlight CTA or **Chưa có highlight từ nguồn được xác minh.** Existing prominence metadata or an actual total of at least five goals adds visual emphasis; no title-race/rivalry significance is invented. Existing brief order is preserved. Penalties appear only when supplied.
4. **Top stories**: canonical selected clusters with Vietnamese summary, story type, entities, backend reliability/certainty and time. Transfer clusters stay in Transfer Watch rather than reappearing as club news.
5. **Highlights**: compact viewing links derived from selected result highlights, not another result narrative. Source/channel, type, publication time and safe direct watch URL; no embedding, downloading, proxying, random reupload or assumed Vietnam playback.
6. **Club/player spotlight**, **Transfer Watch**, **off-field** and **community**: selected sections only. Transfer roles/status/fee come from M10; absent player/club mapping has a clear Vietnamese state, absent fees are omitted. Confirmed and reported fees retain distinct labels/source currency. Rumor/interest wording is never promoted. Meaningful culture/off-field content retains reliability labels.
7. **Coming up**: selected M12 upcoming fixtures, typically the next 24 hours, with Vietnam dates/times and match links. It is not a second complete schedule.

Empty sections are omitted. M12 currently excludes social/disputed factual material and has no community ingestion; M14 does not relax those gates. Presentation contracts support approved future community/disputed labels with explicit opinion/conflict wording, but no Fan Pulse or fake reaction is created. No imagery is required: initials/text cards work without publisher photos, club crests or remote assets.

Reliability badges map backend labels to Vietnamese: **Chính thức / Đã xác nhận**, **Báo chí uy tín**, **Cộng đồng / Mạng xã hội**, **Tin đồn**, **Có thông tin trái chiều**. Source quality and story certainty stay separate. No client score/reliability computation or truth percentage. Every story offers a detail/source-section link, 1–3 source names plus a remainder, and native expandable original-source links with time/language/tier/attribution. Independent counts use M7/M8 metadata, never raw article counts. Structured match attribution is rendered from persisted citation metadata.

## Empty, stale and partial states

- No eligible published brief: **Bản tin sáng hôm nay đang được chuẩn bị.** Navigation to matches/news/transfers stays available.
- Database/read error: generic Vietnamese unavailable/retry-later guidance; no stack trace or connection information.
- Older target date: actual date plus **Cập nhật gần nhất** and a new-brief preparation notice. It is not called today's brief.
- M13 PARTIAL or stale inputs: a brief remains usable with **Một số nguồn đang cập nhật.** The scheduler audit is matched to the exact BriefRevision, so an unrelated day's failure cannot mislabel it. Only safe boolean state enters the view; raw failures/keys are never exposed. Age/freshness is independent of reliability and publication permission.
- Video removed/expired/revoked: existing M11 read gates remove the CTA and restore the clean fallback. No replacement from an unverified source.

## Layout, accessibility and SEO

The shared SportsShell now has four active routes: **Trang chủ, Trận đấu, Tin tức, Chuyển nhượng**. Mobile uses a four-column wrapping nav and one reading column; desktop uses a main column and secondary rail when meaningful content exists. A schedule-only day uses available width with responsive fixture cards. No inactive auth/following/search navigation is invented; the explicit M14 request supersedes those older planning examples.

Semantic heading order, unique section/summary anchors, focusable main skip target, 3px focus outlines, text-labeled color badges, native details, safe named external links and flexible min-width-zero grids support keyboard and narrow-screen use. No autoplay, large hero, ticker, image dependency or new Client Component. Styles use the existing Tailwind/font setup. A loading shell retains navigation and a status announcement. Public metadata is generic Vietnamese title/description/canonical/Open Graph; source snippets/private text never enter homepage SEO.

## Validation and limitations

42 new deterministic tests cover published/private/READY/DRAFT policy, exact development preview gating, permission revocation, old/partial states, canonical deduplication, all reliability/transfer labels, source lineage/counts/links, fee distinctions, timezone rollover, verified/absent highlights, hidden empty/community sections, malformed/missing Vietnamese content, safe failures, mobile structure and server rendering with external fetch forbidden. All migration-backed tests use disposable PGlite and no live paid provider.

Runtime evidence is in [morning-homepage-validation.json](samples/morning-homepage-validation.json): real local READY preview, production preview denial, four route checks, five target viewport widths, read-only preservation audit, and a separate disposable PostgreSQL scheduler → published brief → homepage → match/highlight/news/transfer/source journey. Original database content is unchanged. Fake permitted fixture records existed only in that disposable database; external source URLs/watch targets were inspected, not fetched/played. Source reachability/actual video playback is not claimed.

Remaining editorial limits: the real database still lacks a published Vietnamese brief/news/transfer/highlight sample. Production therefore correctly shows preparation until a genuine eligible brief is explicitly published. Existing bounded M12 validation corpus and upstream source coverage still apply. This milestone adds no accounts, following, admin, PWA, notifications or social ingestion. Next is **Milestone 15 — Auth & Following**, only on request.
