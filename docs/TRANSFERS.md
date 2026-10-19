# Transfer Center — Milestone 10

## Workflow and routes

`Article → current M6/M7 evidence → canonical ArticleCluster → TransferTrackingService → Transfer / append-only TransferUpdate → TransferQueryService → Vietnamese UI`.

```powershell
npm.cmd run db:migrate:deploy
# Existing news processing/review/clustering precedes transfer tracking:
npm.cmd run news:cluster
npm.cmd run transfers:sync
npm.cmd run dev
```

Visit `/transfers`; a tracked relationship opens `/transfers/giao-dich-<transfer-uuid>`. An eligible published cluster with incomplete/untracked identity links to its existing `/news/tin-<cluster-uuid>` source summary. Public data always requires PUBLISHED/READY Articles and the current M9 rights/processing/canonical gates. The sync command can track eligible internal drafts, but never promotes Article status or grants permission. Processing pending, restricted and untranslated content stays private. No real Article was published for this milestone.

No new environment variable, paid provider, external API or dependency is required. DATABASE_URL supports the existing database and operational commands; NEXT_PUBLIC_APP_URL supplies canonical metadata. Page requests perform internal reads only. No scheduler, admin, authentication, social ingestion or highlights are added.

## Status and confirmation rules

| State | Meaning / UI |
| --- | --- |
| CONFIRMED | Reviewed, scoped authoritative evidence explicitly completes the signing/transfer; green + checkmark. |
| NEGOTIATION | Credible active talks, submitted bid/offer or advanced discussions; blue + in-progress symbol. |
| INTEREST | Credible interest/monitoring/scouting/shortlist/exploratory contact; neutral watch label. |
| RUMOR | Speculative/unconfirmed reporting; amber + question mark. |

M7 source quality, story certainty, publication label and usage permission remain separate. M10 reuses a current deterministic M7 assessment and adds an explicit reviewed completion-span check scoped to the canonical player, current/target club or relevant league. AI cannot declare its own authority. A confident AI result, cached Transfer.status, publisher count, copied report, engagement or a high score never confirms a signing. Official social accounts can qualify only through an independently reviewed OFFICIAL source identity/authority scope and explicit completion evidence; no social adapter is implemented.

M7 policy **reliability-v1.1.0** corrects transfer wording: an official announcement of talks is not a completed signing; explicit bids/discussions are negotiations, stopped talks remain unconfirmed. Earlier policy decisions are preserved. The snapshot records the policy version used. Unconfirmed stories with affirmative completed-signing headlines are withheld until proper Vietnamese uncertainty/review exists; this layer does not invent a replacement headline.

Each factual upgrade needs newly reviewed evidence. Previously seen evidence IDs are retained in snapshots; relabeling old evidence/source configuration does not count as new authoritative confirmation. A new confirmation must include a fresh, reviewed authoritative completion record. Fee-only additions or repeated sources cannot upgrade a rumor. Reported talks can regress to unconfirmed when new evidence says they ended. A confirmed completion survives later speculation; reviewed contradictions, disputes or editorial conflict flags block stale public confirmation pending resolution. No new FAILED/ENDED enum or automatic guess is added.

## Identity, evolution and provenance

Tracking uses existing M6/M8 resolved internal UUIDs, aliases and ArticleEntity links. It creates no Club/Player or provider identity. Distinct destination UUIDs always mean distinct relationships. Current-club identity is matched exactly, including unknown; missing current identities are not silently guessed or merged with known origins. Player mappings are required to create Transfer rows. Without a destination, tracking stays bound to that cluster and never groups by player alone.

Across canonical stage clusters, a fully matching player/current/target relationship can evolve within a **30-day source-publication span**. Ambiguous matches and older windows are kept separate. TransferUpdate links each historical observation to its original cluster and evidence, preserves Vietnamese text, source time, roles, processed-input hash, reviewed proof IDs, facts and reliability policy version. Updates are append-only, including at the database layer. Identical input hashes reuse the prior record; metadata/status changes require fresh evidence. Existing unique evidence/status constraints remain intact.

The public current state is reconstructed from currently permitted, published and validated snapshots. It never trusts the cached Transfer.status, fee or contract columns. Each snapshot is fingerprint-checked against current original/processed/evidence data, and its role IDs must agree with its relationship. Old/revoked/stale/unpublished entries remain stored but cannot leak through a historical timeline. Fresh reviewed disputes are checked before a clustering rerun. An event with unresolved conflict is unavailable under M7/M8 factual-publication policy; the badge component supports a warning state without weakening that policy.

The visible timeline is chronological, with one canonical cluster/status entry and links to the underlying news summary/evidence. A later official signing does not rewrite earlier rumor/interest/talks labels. Original text and all processing/cluster/reliability histories remain untouched. Public first-seen/current-state times use permitted source publication timestamps, with Asia/Ho_Chi_Minh display and DAY precision preserved. Unknown precision does not become a fabricated hour.

Sources aggregate across permitted history. Publisher count and reviewed independent lineage count are separate; copied/syndicated origins count once using the existing M7 helper. These counts do not mean that every source independently confirms the current stage. Source tiers, original headlines/languages/dates/URLs, license, attribution and revision links reuse the M9 evidence UI. No third-party full bodies/photos/crests are rendered. Club/player identity uses text/initials.

## Fees, currency and contracts

The old nullable Transfer.fee/currency/date columns are preserved as legacy data and **not trusted for publication**. Structured financial/contract values live in validated TransferUpdate snapshots, with field-specific proof references. Unknown values remain absent; a missing fee never means free, and an absent transfer type is not inferred.

Optional facts are extracted only from **reviewed ClaimEvidence** for the same Article/player/destination, not by mining arbitrary monetary numbers or asking an AI to guess. Supported fieldPath values:

- `transfer.confirmedFee`, `transfer.reportedFee`
- `transfer.contractDuration`, `transfer.contractExpiry`, `transfer.extensionDuration`
- `transfer.transferType`

The existing evidence record must have a reviewer, review time after current processing, locator, claimKey, lineageKey, SUPPORTS stance, permitted reusable source and an exact persisted excerpt. Its `claim` uses this reviewed structured contract (replace identifiers with existing canonical UUIDs):

```json
{
  "playerId": "<canonical-player-uuid>",
  "targetClubId": "<canonical-destination-uuid>",
  "value": "up to €40m including add-ons",
  "currency": "EUR"
}
```

`value` must occur verbatim in the persisted source excerpt. Monetary values require explicit currency evidence (unambiguous EUR/€/GBP/£/USD/US$ or a literal currency code); ambiguous `$` is not assumed to mean USD. No amount normalization or exchange-rate conversion occurs. Caps/add-on/estimate qualifiers must survive in the source value. A confirmed fee additionally requires a confirmed transfer and scoped OFFICIAL_STATEMENT evidence; reported/conditional/questioned prices cannot become confirmed fees even on an official source. A signing can be CONFIRMED while its price remains only reported. The UI labels both categories separately and links to the supporting source.

Contract values remain source-provided text under Vietnamese labels, with uncertainty preserved; duration never generates an inferred expiry. Transfer type uses an explicit source phrase plus a reviewed `type`: PERMANENT, LOAN, FREE_TRANSFER, CONTRACT_EXTENSION or RELEASE. UNKNOWN/absent remains unset. Example: `value: "permanent transfer", type: "PERMANENT"`. Conflicting reviewed values for the same field are omitted rather than silently selecting one. Facts without compatible proof stay nullable. There is no public fact-write endpoint; future Admin tooling can author these existing evidence records.

## Filters, sorting, SEO and operating bounds

`/transfers?league=premier-league` / `league=la-liga`; `status=CONFIRMED|NEGOTIATION|INTEREST|RUMOR`; optional `page=2`. Filter links preserve the other selection and reset pagination. League context uses the same persisted entity/dates logic as News UI. Current verified statuses sort confirmed → negotiation → interest → rumor, then high-confidence reporting and recency with a stable tie-break; source counts never rank a transfer. Pages contain at most 12 cards.

The initial deterministic projection is intentionally bounded: at most 100 candidate clusters per atomic sync, 100 tracked relationships plus 100 untracked candidates per read, and 200 history records per relationship. Oversized work fails safely rather than truncating trusted history or deleting data. Reads can perform several current-gate queries per item; large-corpus batching/filter pushdown is a later hardening task. Unknown origins can produce conservative separate relationships until reviewed; there is no automatic speculative merge.

Public details share a request-memoized checked result for HTML/metadata. Only permitted public Vietnamese content gets canonical/Open Graph metadata; private/invalid/error details and filtered list variants are noindex. Next streaming may return unavailable UI with HTTP 200 + noindex after a loading boundary; no private source content appears. Mobile cards, wrapping filters/navigation, semantic headings, source link names, visible focus, loading/error/empty and missing-mapping/fee/destination states are provided.

## Validation

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd run transfers:sync
npm.cmd run start
```

Tests use disposable databases, deterministic AI results and explicitly synthetic reviewed sources; no paid model or live provider is called. Runtime smoke uses the production Next build against a newly created, separately named test database and cleans it up; no fixture is published into football_morning. The configured database still has no approved published Vietnamese transfer story, so its correct real-data state is empty. After an authorized real publication exists, repeat `/transfers` → detail → sources against that content; do not change a draft's status merely to fill a UI.
