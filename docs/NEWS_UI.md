# Vietnamese News UI — Milestone 9

## Routes and read boundary

- `/news`: one canonical ArticleCluster per card; All, Premier League and La Liga filters. `?league=premier-league` / `?league=la-liga` select a competition; `after` is a bounded server pagination offset, reset when changing league. Pages contain at most 12 public stories. A scan budget of 120 candidates prevents unbounded permission checks; continue with the next link across a large filtered/withdrawn span. There is no misleading total of private records.
- `/news/tin-<cluster-uuid>`: stable cluster identity, unaffected by headline/representative changes. The UUID appears only in the URL, never as a visible story label. No new slug column or migration is needed.
- The homepage and Match UI link to news through shared sports navigation. No `/transfers`, club/player detail routes, search, social ingestion or later milestone UI is added.

Server Components use `NewsQueryService` through `news-page-data`; the browser never queries Prisma, news publishers, football-data.org or AI. There is no new public write endpoint, provider call, key, dependency or publication side effect.

Reads run in a read-only repeatable-read transaction. The shared M8 loader retains its original locking behavior for clustering jobs and has an explicit read-only mode for public queries. Page reads never call the state-changing `StoryClusteringService.current()` or create revisions.

## Publication, permissions and Vietnamese text

Clustering eligibility is a candidate decision, **not publication approval**. Both the representative and supporting Article metadata must be PUBLISHED/READY. Current M6 output/evidence, M7 permissions/reliability and M8 canonicalization are rechecked. Revoked sources/licences, hidden/draft/pending members, stale processing and missing Vietnamese content cannot supply public text or source counts. A claim relying on a private citation blocks the public story rather than laundering private evidence into confirmation. Published status alone does not bypass the current gate.

The persisted representative must still be eligible and its exact paired Vietnamese headline/summary must match the canonical cluster. A stale/manual ungrounded pair is unavailable until corrected through the existing editorial/clustering workflow. Conflicts remain private under M7/M8 policy. The display components support Social and Disputed badges for future permitted projections, but M9 does not weaken the factual-news gate to populate them.

Only `titleVi`/`summaryVi` form primary content. Missing translations show a generic empty/pending/unavailable state; foreign originals are never substituted. Original titles appear only in source metadata. Detail pages identify AI-assisted summaries versus rule-based extraction, retain uncertainty and display no full article body, invented quote, statistics or analysis.

There is no automatic READY/PUBLISHED promotion. The existing real archived English Wikinews draft remains private until Vietnamese processing, source/evidence review and an authorized publication workflow are complete. Do not publish fixtures or run a direct SQL status update merely to populate this screen.

## Reliability and source transparency

Badge text and certainty come from the backend M7 result. Color expresses class, never a truth percentage:

| Class | Presentation |
| --- | --- |
| Official / Confirmed | Green; Chính thức / Đã xác nhận |
| Reliable | Blue; Nguồn tin đáng tin cậy |
| Social / Community | Purple; Cộng đồng, explicitly not factual confirmation |
| Rumor | Amber; Tin đồn / Chưa xác nhận |
| Disputed | Rose warning; Thông tin mâu thuẫn |

Cards show up to three distinct publisher names plus `+N nguồn`, with a direct anchor link to evidence. Details list all permitted supporting Article citations, including multiple distinct reports from one publisher: source name, original-language headline, original publication date/precision, language, editorial source tier, original URL, reusable text licence/link, stored attribution, source revision link and an explicit Vietnamese-summary change notice. External HTTP(S) links reject credentials/unsafe schemes and use `target="_blank" rel="noopener noreferrer"` with meaningful accessible names. An unavailable URL gets a text state.

Publisher count is separate from credible independent lineage count. The existing M8/M7 lineage helper is reused on current public evidence. `N nguồn độc lập` appears only when that result exceeds one; copied/syndicated reports never manufacture confirmation. Transfer previews use M7 CONFIRMED/NEGOTIATION/INTEREST/RUMOR and M8-resolved internal player/current/target club roles; unknown roles are omitted. Rumor remains explicitly unconfirmed.

## Sections, sorting, leagues and imagery

The backend orders published candidates by editorial `featured`, stored M7 class (official, reliable, rumor, social), updated time, then stable cluster ID; each candidate must still pass the fresh gate before rendering. This is a deterministic feed fallback, not a new ranking/reliability engine. Disjoint sections on each page allocate Top Stories, latest remaining updates, club/player stories, transfer previews and off-field/culture as data permits. Empty sections are hidden and cards do not repeat across sections.

League filtering uses persisted ArticleEntity league/match links and dated ClubSeason memberships whose known season boundaries cover the source publication time. Unknown memberships/boundaries are not guessed. General stories with no league association remain in All. It does not classify by keyword, country or current club alone.

The internal news model has no independently licensed image attachment contract, so this UI intentionally requests **no publisher photos, crests or profile graphics**. Club/player labels use stored names/TLA or initials. Text cards remain fully usable without imagery. A future licensed MediaProvider can extend the read model separately.

UTC timestamps remain untouched. Visible date/time uses Asia/Ho_Chi_Minh with relative Vietnamese labels, absolute accessible time descriptions and UTC+7 context. Source dates recorded only to DAY precision display no invented hour.

## Accessibility, SEO and error behavior

Responsive one/two/three-column layouts, semantic h1/h2/h3 headings, native links/buttons, visible keyboard focus, skip-to-main links, readable badge text and source accessible names support mobile and keyboard scanning. Loading, empty, pending, bad filter, service failure and not-found states use Vietnamese copy and never expose exception text or raw enums.

Public detail metadata shares the same request-memoized safe read as HTML. Canonical URLs and Open Graph article/title/description use only permitted Vietnamese text and NEXT_PUBLIC_APP_URL. Missing/private/error stories receive generic noindex metadata; filtered/paginated list variants are also noindex. Pages are dynamic; there is no cross-request permission cache. With Next.js streaming/loading boundaries, a late `notFound()` can return HTTP 200 with unavailable UI plus `robots=noindex`; before streaming it returns 404. Neither response exposes private content. This follows the installed Next.js not-found convention.

## Validation and local smoke

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd run start
```

Open `/news`, switch EPL/La Liga, and follow a **real published** card to its sources. If no Vietnamese story has passed the publication gate, the correct real-data outcome is empty; a private/invalid slug must stay unavailable and noindex. Do not turn draft/hidden rows public for a smoke check. No external source/AI API call is required for these pages.

`tests/news-query.test.ts` runs the real migrations and processing/clustering/public-read flow against disposable PGlite, with explicitly test-only providers/evidence/editorial approval. It covers a valid published story, independent/copied lineage, source revocation, private citations, translation/processing gates, canonical drift, disputes, league filtering, pagination and read idempotency. `tests/news-ui.test.tsx` renders deterministic cards/details/badges/states/metadata, including external-link safety and Vietnam time conversion. No test fixture enters the configured production database.

Performance scope: public reads deliberately revalidate current evidence and can make several queries per candidate; pagination/scan/member caps and transaction timeouts bound work. Production-scale batching/query-plan tuning belongs to hardening. Offset pagination may shift when editorial updates arrive; per-page cluster identity remains unique. Full screen-reader/a11y audit and a live detail smoke with editorially published Vietnamese content remain operational follow-ups.
