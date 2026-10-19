# Story clustering — Milestone 8

`StoryClusteringService` groups persisted internal Articles without deleting articles, URLs, citations, processing runs or reliability history. It requires no model, embedding, API key or paid service. The existing AIProvider handles article processing only; no semantic-similarity capability is assumed and no remote AI call is made here.

## Commands

```powershell
npm.cmd run db:migrate:deploy
npm.cmd run db:validate
npm.cmd run db:generate
npm.cmd run news:cluster
npm.cmd run news:cluster -- --since 24h
# Optional upstream stages, when permitted/configured:
npm.cmd run ai:process -- batch 10
npm.cmd run reliability:assess -- batch 10
npm.cmd run news:cluster
```

DATABASE_URL is the only required environment variable. `--since Nh` selects articles published or collected since that UTC instant. Historical articles collected recently remain historical; collection time never replaces their publication date in similarity windows. Commands print only controlled IDs/counts/revision/eligibility metadata, not article text, credentials or raw exceptions.

The default bounded workload is 200 articles; the service policy supports an explicitly configured maximum up to 500. Candidate neighbors and complete membership of affected existing clusters are included even if outside the seed filter. Oversized work fails atomically with CLUSTER_BATCH_TOO_LARGE; it never silently truncates a cluster. Narrow the selection where possible or deliberately adjust the service policy. This is a manual bounded reconciliation tool, not the future scheduler, paginated corpus processor or search index.

## Architecture and signals

Separate modules handle candidate generation/scoring (`story-similarity.ts`), merge decisions/partitioning, canonicalization (`story-canonicalization.ts`) and database orchestration (`story-clustering.ts`). No clustering logic is embedded in routes or components.

1. Candidate retrieval uses stored URLs/titles, publication proximity, existing club/player/match associations and complete existing cluster membership. In-memory inverted indexes add normalized URLs, title hashes, linked entities, conservative source-provided manager mentions and reviewed proposition keys.
2. Exact normalized URL/title bundles are established before near-duplicate comparison. URL normalization removes fragments and known tracking parameters and sorts remaining query parameters; it preserves identity-bearing query values, paths and protocols. Canonical/source/ArticleUrl aliases are considered. Existing M5 ingestion deduplication is unchanged.
3. Near-duplicate scores expose title/event-word similarity, entity overlap, type agreement, time distance, transfer-pair compatibility, reviewed proposition and lineage agreement. Similarity is **not** reliability or a truth percentage.
4. Names/aliases are stripped from event-word comparison so a shared player/club name cannot supply all the similarity. A small deterministic English/Vietnamese/Spanish football vocabulary equates obvious interest, talks, injury and departure wording. It is not a general semantic model or translator.
5. Common league membership alone is not a shared story identity. Different known players, matches, transfer targets/current clubs and explicit injury details are guarded. A club-only match requires stronger event wording than a shared player/match. Unknown story types stay conservative. Exact URLs identify a source resource even across updates, but mixed types/stages block a public candidate rather than hiding their differences.
6. Every pair in a proposed near-duplicate group must pass the guards. A~B and B~C do not imply A~C. Stable article/time/ID ordering and deterministic tie-breaking avoid random memberships.

Publication-based default windows: MATCH 36h; TRANSFER 96h; INJURY 48h; CONTRACT/FINANCIAL 72h; other types 48h. Policy overrides are centralized in the service configuration (positive windows up to 168h), and actual window values are recorded in snapshots. Missing publication time blocks near matching; exact resource identity remains a duplicate signal. Identical titles weeks apart are not automatically the same event.

Club/player/league/match identities come from existing internal associations, which already resolve provider identities/aliases. Transfer roles are accepted only from validated M6 extraction resolvable to these identities. Manager mentions use conservative short, exact source-provided spans because M2 has no manager entity table; they do not create manager/player records or assume a manager alias service. Cross-language/unusual paraphrases can be missed without a semantic provider; manual review handles those false negatives.

## Transfers and evolving stories

INTEREST, NEGOTIATION, BID, REPORTED_COMPLETION, CONFIRMED and DEPARTURE are event-stage buckets for similarity, not replacements for M7 transfer certainty. Default automatic clustering keeps materially different stages separate. Interest/monitoring/contacting an agent can group when player/club roles and event evidence match. Different known target/current clubs or incompatible linked identity sets stay separate.

An Article changing to a new processing/source revision can move into a new stage partition. Earlier ArticleClusterRevision snapshots retain the former membership/state, while AIProcessingRun and ClaimEvidence history stay intact. A new Article at a later stage normally gets a separate cluster. Nothing promotes an interest article to confirmed because another cluster contains a confirmed signing.

An explicit audited manual merge may relate stages as an evolving story, but the resulting MIXED_TRANSFER_STAGES state blocks public eligibility until editorial boundaries are resolved. Any CONFIRMED metadata still comes from an individually authoritative M7 result, never from similarity, source count or the merge itself.

## Canonical story and lineage

Canonicalization reuses the current M7 engine on original source, permissions, current validated AI output and reviewed evidence. It does not trust an old assessment JSON row as present permission.

The representative is selected only from currently eligible permitted members: reviewed official evidence first, then reliable/rumor/social labels and evidence strength, then publication recency and stable ID. The Vietnamese headline **and** summary are copied as an exact pair from that member. No combined sentence, inferred fact, translation, quote or new summary is generated. If no member qualifies, both fields and the representative are null and the cluster has no public candidate.

Each validated snapshot exposes internal article count/IDs, permitted source count, reviewed independent-origin count, strongest evidence, reliability label, certainty, type, linked primary entities, firstSeen (earliest collection), lastUpdated (latest member update), transfer stages, disputed/featured state and eligibility/blockers. It also retains input fingerprints, effective windows and explainable per-member merge decisions/factors. Similarity scores stay internal diagnostics.

Source count includes distinct permitted publishers and their reviewed cited-source links. Independent-origin count reuses M7's transitive grouping of shared publisher domains and reviewed lineage keys. Copied/syndicated articles keep their URLs and publishers but share one origin; absent/unreviewed/weak/social origins cannot manufacture corroboration. Two reviewed independent credible origins can give STRONG evidence, never automatic CONFIRMED certainty. Article IDs and citations outside a member's own publisher can remain supporting provenance without copying their article body.

`publicStoryCandidate(clusterId, snapshot)` returns one grounded candidate per eligible cluster. It excludes internal restricted membership and diagnostics. The service's `current(clusterId)` refreshes rights/reliability and returns a candidate or null. Future feeds should use cluster identity and this fresh projection, not list every member Article or directly trust cached headline fields. M8 does not add a homepage/news feed or any UI.

## Conflicts and permissions

Existing M7 disputes propagate to a cluster. Opposed departure language (leave/stay) or opposite wording on an explicitly reviewed proposition can mark a similar group DISPUTED. The process retains all member/evidence records; it does not silently pick one as truth. Disputed clusters have null canonical text and no public candidate. A generic cross-source contradiction cannot always be inferred from wording; reviewed proposition/stance metadata and editorial dispute overrides remain important.

Clustering grants no permission, tier, certainty or Article publication status. Restricted/disabled/hidden members can retain existing IDs, hashes and provenance internally under their prior retention policy, but cannot supply canonical text, public source links, independent permitted evidence or eligibility. An individually unpublishable article stays unpublishable even beside eligible members. A cluster can present a permitted eligible story without laundering a restricted source's content. Source-usage-blocked evidence is excluded from public aggregate inputs; a known M7 dispute remains a conservative blocking flag.

`current()` and reconciliation reread source configuration, licence metadata, AI validity and evidence on each call. Permission revocation clears unsafe cached canonical fields and appends a new revision; retained historical snapshots are evaluation-time audit material, **not** current publication permission. Rights erasure/retention enforcement remains the broader source/retention workflow; M8 adds no fetch, extra restricted full-text storage or publication endpoint.

## Persistence, revisions and manual readiness

The existing Article.clusterId FK remains the single membership link. No redundant membership table is added. ArticleCluster retains canonical fields and gains manualOverrideAt, manualDisputed and featured. Additive ArticleClusterRevision stores monotonic revisions, canonical/aggregate snapshots, member fingerprints, algorithm version and a canonical-JSON input hash. Current identical state is a no-op. Restoring an older state after a merge is a new revision; hashes are intentionally not unique across all history so undo can preserve the complete timeline.

One transaction serializes reconciliation with a database advisory lock, then locks permission configuration and selected editorial/evidence/cluster rows in consistent order. There are no external calls inside transactions. Membership edits do not rewrite original/generated article fields or their content timestamps. Unique representative pointers are temporarily cleared/restored within the transaction to avoid conflicting representatives during moves. Empty retired clusters and their history are retained, never deleted. Existing cluster IDs are reused deterministically where possible; the oldest stored route identity is not promised as a redirect across every merge because routes are a later milestone.

Published/referenced clusters and Article/manual-locked memberships are protected from automatic remapping. Existing manual clusters are pinned; related new articles may need explicit editorial merging rather than bypassing that boundary. Canonical/permission aggregates still refresh on pinned clusters. Unclustered published/manually overridden articles are not silently assigned by the automatic job.

Backend methods prepare M16 without adding an admin UI or public endpoint:

- `merge(clusterIds, targetId, actorId, reason)` preserves emptied cluster records, pins membership and records before/after in AdminAuditLog.
- `undoMerge(auditId, actorId, reason)` restores prior memberships if the merged state has not changed since that audit. It revalidates present permissions/canonical content instead of blindly restoring stale licensed text. Canonical JSON hashing handles PostgreSQL JSONB key reordering. Repeated/stale undo is rejected.
- `split(clusterId, articleIds, actorId, reason)` creates a new pinned partition and preserves history.
- `override(clusterId, {representativeArticleId, featured, disputed}, actorId, reason)` selects an exact currently eligible member headline/summary, sets feature/dispute metadata and records the action. It cannot install arbitrary ungrounded prose. Free-form editorial text should first become a separately evidenced, reviewed article revision in the later admin workflow.

These methods require an existing ADMIN database user and a meaningful reason, refuse published/referenced edits, and never override licence/confirmation gates. They are trusted server APIs: future authenticated callers must derive actorId from the authenticated session, not accept an arbitrary browser-supplied admin ID. M8 does not create production admin accounts or implement auth. Manual corrections may override similarity boundaries, but do not turn unsupported/contradictory claims into published facts.

## Validation

```powershell
npx.cmd prisma format
npx.cmd prisma validate
npx.cmd prisma generate
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```

Tests use deterministic fixtures and all checked-in migrations in disposable PostgreSQL. They cover duplicates-first ordering, near duplicates, unrelated identities/events, transfer stages, copied/independent origins, conflicts, time windows, permissions, grounded canonicalization, source revisions, idempotent/concurrent reconciliation, manual merge/undo/split/overrides, stale undo, batch rollback and published membership protection. No live external provider or paid AI is required. The sparse current production corpus may only exercise singleton clustering; multi-source correctness is demonstrated by deterministic SQL integration tests, not fake production rows.
