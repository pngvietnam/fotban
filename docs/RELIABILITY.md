# Reliability Engine — Milestone 7

Reliability is not a truth percentage. The deterministic, versioned `ReliabilityEngine` separates source quality, evidence strength, story certainty, usage permissions, publication label and freshness. It consumes persisted internal data only; it makes no AI/provider requests and never uses engagement as evidence.

## Usage and configuration

```powershell
npm.cmd run db:migrate:deploy
npm.cmd run db:validate
npm.cmd run db:generate
npm.cmd run reliability:assess -- batch 10
npm.cmd run reliability:assess -- article <persisted-article-uuid>
npm.cmd run db:studio
```

Only DATABASE_URL is required; no new environment variable, key or paid provider is needed. The CLI assesses sequentially, at most 50 drafts per manual batch. It reports controlled IDs, classifications and blocker codes, not source payloads or exceptions. An ineligible decision is a successful assessment, not a command failure.

Source configuration lives in NewsSource. Existing source score, official, enabled, language, country, rationale/reviewer/reviewedAt and permission fields are reused. New sourceTier defaults to TIER_3_UNVERIFIED and authorityScopes defaults to empty. The migration does not grant editorial trust, enable adapters, change scores or grant usage permission. The Premier League/LaLiga/club adapters remain disabled. Wikinews reuse permission remains valid, but permission and its baseline score do not constitute an approved editorial tier.

Authorized operators can review these fields through Prisma Studio until the later admin milestone. They must record an editorial rationale/reviewer/date and an explicit tier; ingestion-licence review alone is not an authority grant. There is no public write endpoint, admin UI, automatic override, source configuration import, or guessed production source tier in M7.

| Tier | Meaning |
| --- | --- |
| TIER_0_OFFICIAL | Reviewed official publisher; official=true and type=OFFICIAL are also required. Specific claim authority is still required. |
| TIER_1_HIGH | Editorially reviewed high-quality reporting; not official confirmation. |
| TIER_2_ESTABLISHED | Editorially reviewed established reporting; not official confirmation. |
| TIER_3_UNVERIFIED | Default/unknown source; publication requires source review. A high numeric score does not bypass this. |
| COMMUNITY | Social/community material, separate from factual-news confirmation. |

Scores remain editable source assessments, 0–100. Article.reliabilityScore is only a snapshot of that source score, never a combined truth, certainty or freshness score. No example BBC/Reuters/source scores are installed into production.

## Evidence and authority

Existing ClaimEvidence retains its actual sourceArticleId or matchId, claim, locator and permitted excerpt. Added metadata:

- kind: ARTICLE_SOURCE, OFFICIAL_STATEMENT, SECONDARY_SOURCE, SOCIAL_POST, QUOTE, MATCH_DATA or STRUCTURED_PROVIDER.
- stance: SUPPORTS or CONTRADICTS, against the particular generated claim. The claim must equal a current Vietnamese headline/summary; the exact source span must exist in the persisted source text and its URL must match the registered publisher's domain (www normalization only). An unrelated URL cannot borrow official source authority.
- claimKey: an editor-assigned stable proposition identifier. Contradictions and corrections must refer to the assessed proposition, not a merely related topic. M7 does not infer semantic equivalence or cluster articles.
- reviewedBy/reviewedAt: trusted operator review of the evidence-to-claim relationship. Both and a nonempty claimKey are required for reviewed evidence. Reviews predating the selected processing run cannot approve its generated text. AI-generated evidence starts unreviewed and cannot assign itself authority.
- lineageKey: reviewed originating publisher/lineage identity. Use the same canonical identifier, such as `source:<originating-source-uuid>`, for syndication/copies. Never assign a fresh arbitrary key to each repost.
- authorityScope: an exact `club:<uuid>`, `league:<uuid>`, `player:<uuid>` or `match:<uuid>` identity. Official confirmation requires it in both NewsSource.authorityScopes and the story's existing ArticleEntity links. No wildcard authority is granted. League disciplinary authority can use its league scope; player/manager statements require an actual existing relevant entity/scope, not an invented manager ID.
- supersedesId: optional prior ClaimEvidence FK. A correction is effective only when newer, reviewed, official, in scope and attached to the same claimKey. Invalid corrections block eligibility. Self-references and missing evidence IDs are rejected by SQL constraints.

An official source speaking outside its reviewed authority does not confirm a claim. A club news report discussing another club's signing is insufficient without the right scoped evidence. QUOTE alone does not prove authority; an official quotation can be reviewed as OFFICIAL_STATEMENT with its original source, relevant scope and locator.

Independence is conservative: only reviewed credible sources with declared lineage count. Common publisher domains and common lineage keys are joined transitively and count once. Multiple title/summary citations from one publication count once. Weak, social, unreviewed or unknown-lineage evidence cannot inflate independent credible-source counts. Undeclared or incorrectly reviewed copying cannot be discovered automatically; semantic/lineage discovery belongs to later ingestion/editorial work, not M7 clustering.

| Strength | Meaning |
| --- | --- |
| DIRECT | Reviewed official evidence within authority, or an exact mapped finished-match score. This alone does not erase speculation or conflict. |
| STRONG | At least two independent credible origins. Still not official confirmation. |
| SUPPORTING | One credible reviewed origin. |
| WEAK | Insufficient/weak/unreviewed evidence or undeclared credible lineage. |
| SOCIAL_ONLY | Social/community-only material; not factual confirmation. |

Match evidence is restricted to `fullTimeScore`, the derived `<homeScore>-<awayScore>` tuple. It must match a FINISHED persisted Match, have non-null scores, a matching ExternalIdentity/provider mapping, an explicit ArticleEntity match link, the same score in source text and in the reviewed generated claim. It applies only to MATCH stories. It cannot confirm an injury, transfer, player availability, or unrelated news. Upcoming/postponed/unknown results are not inferred as 0–0. Structured evidence explanations expose provider, match ID, field and value without hard-coding a sports vendor into policy.

## Labels, certainty and transfer rules

| Publication label | Badge meaning |
| --- | --- |
| OFFICIAL | Chính thức / Đã xác nhận; requires direct authority and no unresolved speculation/conflict. |
| RELIABLE | Nguồn tin đáng tin cậy; reporting, not official confirmation. |
| SOCIAL | Cộng đồng; opinions/reactions, not factual-news evidence. |
| RUMOR | Tin đồn / Chưa xác nhận, including speculation or unverified sources. |

Certainty is separate: CONFIRMED, HIGH_CONFIDENCE, REPORTED, POSSIBLE, SPECULATIVE, DISPUTED. DISPUTED is also exposed as a badge flag and Vietnamese label; a fifth overlapping publication-class column is unnecessary. Evidence can be direct while the particular story remains disputed or speculative.

Trusted media reporting interest yields a RELIABLE source classification, a RUMOR story label, POSSIBLE certainty and INTEREST transfer status. Credible active talks can yield NEGOTIATION/REPORTED, or HIGH_CONFIDENCE with independent credible corroboration. Repeated weak reports never become confirmed. A completed transfer requires reviewed scoped official evidence and explicit signing/completion wording in the current source. Even an official flag/score change cannot upgrade an existing rumor.

Milestone 6 uncertainty and source language remain authoritative. Reportedly/may/could/believed to/considering/linked with/interested in and Vietnamese uncertainty remain uncertain. Confirmed Vietnamese wording applied to uncertain input blocks eligibility. Existing speculative originals are not silently rewritten when new official news arrives: process an appropriate new grounded source/revision, then review its evidence. An official denial produces DISPUTED for the original report. A valid official correction can supersede a prior contradiction; all evidence and prior decisions are retained, not deleted or overwritten.

Social sources, COMMUNITY/SOCIAL stories, or stories supported only by social evidence stay SOCIAL_ONLY and cannot pass this factual-news gate, even if a trusted publisher repeats the post. Likes, views and engagement are not inputs. Future Fan Pulse, reactions, banter or meme modules need their own presentation policy; none is implemented here.

## Permissions, editorial gate and history

Usage is evaluated independently of quality. A source can have excellent quality or direct official evidence while permissionStatus is RESTRICTED/UNREVIEWED and publication is blocked. The existing enum's restricted/unreviewed states represent required/unconfirmed permission; no redundant PERMISSION_REQUIRED enum is introduced. Existing M5 reviewed/enabled/ALLOWED gates and the article-specific supported reusable text licence, commercial-reuse flag, attribution and evidence/revision/verification metadata must pass. Reviewed cited-source material must also be permitted for use. Reliability cannot enable a disabled source or override a licence.

Eligibility requires usable URLs, actual publication time, Vietnamese title/summary, a valid current M6 processing result, known story type, approved source tier, reviewed evidence for **both** generated fields, and no dispute, invalid correction, certainty upgrade or editorial lock. Raw stored output is revalidated against M6's schema/grounding guards and current original/generated fields, not trusted because JSON or a model says publishable=true. Manual overrides and hidden records require a future explicit audited editorial workflow rather than automatic relabeling.

ReliabilityService.assessArticle loads current data and evaluates it on every call, even when the persistence record is cached. Source permission locks precede the editorial row locks, and transactions perform no remote calls. Strictly validated decisions are appended to ReliabilityAssessment, unique by Article/input hash/policy version. Original/AI fields and ClaimEvidence are not changed. On ordinary drafts only, legacy reliabilityClass and reliabilityScore are updated as the label/source-score snapshot; processingStatus is not promoted to READY and publicationStatus is never changed.

`assertPublicationReady` rejects a current ineligible decision; it does not publish and its return is not a durable publication token. A future publishing transaction must invoke the current gate within its own permission/evidence-safe workflow. M7 adds no publication endpoint or direct SQL publication bypass. Existing baseline publication/evidence constraints remain in place; the complete publisher and continuous revocation/hide workflow are later work.

The initial finalized policy version was `reliability-v1.0.0`. Milestone 10 uses `reliability-v1.1.0` for stricter transfer completion wording, explicit bids/discussions and stopped-talks handling. An official announcement of talks is not a completed signing. Old assessments, including the development `reliability-v1` smoke snapshot, remain historical records; new policy decisions use their own versioned identity. Source/evidence/processing/permission changes or freshness-bucket transitions create a new hash. Repeated identical inputs under the same policy do not duplicate assessments. Historical decisions are evaluated-at snapshots; UI/service readers evaluate current data rather than treating an old eligible JSON row as current permission.

Freshness exposes ageHours plus FRESH (≤24h), AGING (≤72h), STALE (>72h), UNKNOWN or FUTURE. Future/unknown publication time blocks eligibility. Old content retains its source score/tier; age is never a quality deduction or a fact probability. No combined ranking formula is implemented. Later ranking can prefer new official updates over old rumors using these separate dimensions.

Structured explanations expose deterministic reason/blocker codes, evidence IDs, superseded IDs, source URLs and authority flags, source tier/score/reviewer/rationale snapshot, independent credible-origin count, structured-provider references, evaluatedAt and article updatedAt. They are not AI-generated justifications. Future M9 UI can use Vietnamese badge metadata without showing a misleading “87% true”. No News UI is added in M7.

## Validation and limitations

```powershell
npx.cmd prisma format
npx.cmd prisma validate
npx.cmd prisma generate
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```

Tests use deterministic test-only data and disposable PostgreSQL migrations; no live AI/news/sports API is called. Permission denial, source quality, rumor/transfer states, scoped authority, copied/independent origins, social engagement, disputes/corrections, current processing, freshness and idempotent persistence are tested separately. Real local validation can assess the already-persisted article twice and verify the second call is cached; no source permission or translation should be fabricated to make that article eligible.

The engine trusts explicitly reviewed operator metadata and cannot discover all copying, prove semantic entailment, verify every statement's jurisdiction or replace editorial judgement. The earlier M6 fallback cannot translate English; therefore existing untranslated drafts remain unavailable for Vietnamese publication. There is no new paid dependency, admin/auth system, semantic clustering, final News UI, Transfer Center, social ingestion, highlight system, Morning Brief or notification work. Stop after M7.
