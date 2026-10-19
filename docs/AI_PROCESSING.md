# Free-first article processing — Milestone 6

Services depend on `AIProvider`, never a vendor SDK. `RuleBasedFallbackProvider` is the default, costs nothing and needs no credentials. `RemoteAIProvider` is an optional vendor-neutral HTTPS JSON gateway adapter, not a direct integration with a particular commercial API. `LocalAIProvider` is an extension interface for a future local runtime; choosing `local` currently reports unavailable configuration and uses the honest fallback. No model runtime, vendor dependency or new package is installed.

## Run locally

```powershell
npm.cmd run db:migrate:deploy
npm.cmd run db:validate
npm.cmd run db:generate
# Default mode requires DATABASE_URL but no AI key.
npm.cmd run ai:process -- batch 10
# Select an actual persisted Article UUID (not a source/provider ID).
npm.cmd run ai:process -- article <article-uuid>
# Explicit retry of FAILED/expired runs only; maximum three attempts per input/version.
npm.cmd run ai:process -- article <article-uuid> --retry-failed
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```

Batch selection is a bounded manual scan of oldest drafts (1–50). Unchanged articles are cached, including failed/fallback results; selection is not a scheduler or durable queue. For later drafts beyond the batch window, select their IDs explicitly. Nothing polls continuously. One CLI processes sequentially, at most one active call per article across processes. Network calls run outside database transactions. Stale PROCESSING claims expire after two minutes; rerun with `--retry-failed` recovers them. Attempt checks prevent expired workers from committing over recovered runs. There are no automatic network retries or per-call paid retry loops.

The CLI prints controlled statuses/codes, never source text, endpoint, key, arbitrary response or raw exception. `cached` includes already-processed and currently-claimed records, and does not mean an article is publishable. `skipped` reports a rights/input/editorial gate; `FAILED` reports invalid output or a changed input/permission snapshot. All generated results, including validated translations, use existing `NEEDS_REVIEW` (equivalent to REVIEW_REQUIRED) and remain DRAFT. M6 never sets READY, reliability or publication status.

## Eligibility and provenance

Both enabled/reviewed ingestion permission and article-specific supported reusable text licence/attribution/revision/verification/commercial-reuse evidence are required. Metadata/link ingestion permission alone does not authorize AI processing. Current licence allowlist is CC BY 4.0 / CC BY 2.5, reused from M5; full original bodies are not transmitted. Restricted league/club sources remain disabled. Rights are rechecked before calling a provider and under a source lock at commit. Manual overrides, hidden/published records, missing/invalid source URLs, missing dates, malformed text and excerpts shorter than 40 characters are skipped. This conservative floor avoids title-only speculation.

Original headline, excerpt, body, source URL, language and publication date are never changed by processing. An `AIProcessingRun` snapshots the exact permitted title/excerpt, source/licence/attribution/revision metadata, resolved internal entity candidates and requested provider/model. Its SHA-256 input hash includes originals, rights revision, resolved entities, provider configuration and prompt/schema/output versions. Generated fields and processing timestamps are excluded. Changed source input creates another run; unchanged input makes no provider call or extra evidence/entity record. Changing a key alone is not a reprocessing reason. Original content and evidence history are retained.

Only schema-validated output is stored as trusted `output`; invalid payloads are discarded. The run records actual provider/model (including fallback), input hash, versions, attempts, safe failure/fallback code, processedAt and validation/review outcome. Generated title/summary each have a `ClaimEvidence` linking the same Article plus the exact supporting original source span and run/field locator. Quotes present in permitted input are stored separately in `Quote.original` with a source-provided locator; `translated` stays null. No generated quotation is accepted. Existing evidence is not rewritten or deleted on a new revision.

## Vietnamese and extraction behaviour

The fallback detects obvious Vietnamese/English/Spanish features, then uses supported persisted language hints. It copies title/excerpt only when already Vietnamese and unquoted; no English/Spanish translation is fabricated. Untranslated results retain the original headline in their input snapshot and receive TRANSLATION_REQUIRED, null titleVi/summaryVi, review status and publishable=false. Unknown language remains review-required. Extractive Vietnamese text is not represented as an editorial rewrite.

A configured remote gateway may return natural Vietnamese translations and summaries. Short licensed excerpts justify short summaries rather than filling a 50–150-word target with guesses. Classification supports all 14 requested story types, plus nullable future community subtypes BANTER/MEME/CONTROVERSY. Weak evidence defaults to OTHER in fallback. Existing legacy SOCIAL data is preserved. Conservative boundary/alias matching resolves existing club/player/league records and explicit match slugs; it never creates entities or external mappings. Existing ExternalIdentity-resolved records are used through their canonical identity/aliases. Ambiguous aliases are omitted. There is no manager table in M2; exact source-grounded manager mentions are stored in validated run output, without inventing player/club IDs.

Transfer and injury extraction lives in validated run output only, not Transfer Center records or UI. Values must be exact portions of persisted source text. A return date retains speculative language. Transfer interest/negotiation require corresponding source terms; rumors cannot become confirmed. M6 rejects AI assertions of AUTHORITATIVE/CONFIRMED rather than granting source authority automatically; that assessment belongs to the M7 reliability gate.

## Guards and limits

Strict Zod schema disallows unknown fields and validates language, status, story type, entities and structured extraction. Generated fields require exact source evidence, Vietnamese features, numeric/date-token consistency and known-name consistency. Unsupported injury, contract, score/statistic and statement vocabulary, invented Latin-script proper names, generated URLs, markup and quotation marks are rejected. Uncertainty markers in English/Spanish/Vietnamese require UNCERTAIN and Vietnamese uncertainty in both title and summary. Untrusted source instructions are isolated from instructions and obvious prompt injection is blocked before any remote call.

These deterministic checks cannot prove semantic equivalence of arbitrary prose, detect every injection, or certify every unknown/translated name. The external model is never its own fact authority. **All output requires editorial review and remains unpublished**, even if the model claims publishable=true; candidatePublishable is diagnostic only. M7 must apply its evidence/reliability gate before publication. No semantic clustering, reliability engine, notifications, social/Fan Pulse, Brief generation or later-milestone UI is implemented.

## Optional remote gateway contract

Server-only configuration (never NEXT_PUBLIC):

```dotenv
AI_PROVIDER=remote
AI_ENDPOINT=https://your-approved-gateway.example/process
AI_MODEL=your-model
AI_API_KEY=
```

Use a gateway under operator control, compatible with this contract and permitted to receive the licensed public input. A gateway may use a free/local model. This is not a promise that an arbitrary AI vendor endpoint understands this protocol. Set any required credential privately in ignored `.env`; never paste it into chat. Missing endpoint/model uses fallback with an explicit configuration-unavailable mode. The key is optional for anonymous free gateways; authenticated gateways require their own configured key. Legacy OPENAI_API_KEY is not automatically used or selected.

POST JSON contains `model`, `versions`, `outputSchema` (JSON Schema derived from the actual strict Zod schema), fixed `instructions` and a separate untrusted `article` object. Return the structured object itself as JSON, not a chat/completions envelope. The authoritative contract is `providers/ai/schema.ts`; titleVi/summaryVi can be null only together. Evidence contains exactly one `{field, sourceText}` for each non-null generated field. `sourceText` is an exact original span, never a translation. Entities must use supplied internal UUID/kind and source alias; manager mentions are exact source text. Structured transfer/injury fields are nullable and extractive. Warnings are controlled enum codes. The adapter accepts HTTPS only, rejects credential-bearing/query URLs, refuses redirects, caps response bytes at 64 KiB, and the pipeline enforces a 15-second wall-clock timeout even for providers ignoring AbortSignal. Input text is capped at 10,000 characters; only matched entities are sent. The gateway must enforce its own model token/budget cap; no hidden token-based paid retry is implemented here.

Timeout/network/HTTP failures (including 401/403/429) invoke fallback once, preserving its actual provenance and a safe failure code. Malformed JSON, oversize/schema-invalid or ungrounded output is not trusted and cannot overwrite good originals. No browser endpoint triggers processing; use the server-side CLI.

Optional smoke: configure your approved gateway privately, then run the single-article command above for one eligible persisted Article. Repeat it to confirm `cached`. Inspect AIProcessingRun/Article using `npm.cmd run db:studio`: validated Vietnamese fields/evidence if supported; DRAFT/NEEDS_REVIEW in every case. This is optional; deterministic fake providers and disposable SQL integration tests validate M6 without live paid access. Fallback runtime validation is separate from live model validation.
