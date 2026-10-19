# Codex Milestone Prompts — Football Morning Brief

## Source of truth

Luôn coi hai file sau là source of truth:

- `/PRODUCT_SPEC.md`
- `/CODEX_PLAN.md`

Không tự ý mở rộng scope ngoài hai file này.

---

# MILESTONE 1 — Project Foundation

Read `/PRODUCT_SPEC.md` and `/CODEX_PLAN.md` first.

Inspect the current repository before making changes.

Work only on **Milestone 1 — Project Foundation**.

Implement:

- Next.js
- TypeScript
- Tailwind CSS
- Prisma
- PostgreSQL configuration
- environment configuration
- `.env.example`
- ESLint
- type checking
- basic logging
- basic error handling
- README setup instructions

Do not implement:

- match data
- news
- AI
- YouTube
- social
- personalization

Before coding:

1. Inspect the repository.
2. Summarize what exists.
3. State briefly what will change.

After implementation run:

- lint
- typecheck
- tests if configured
- production build

Fix all errors.

Update README.

Report:

- status
- files created
- files changed
- commands run
- test/build results
- known limitations
- manual setup required

Stop after Milestone 1.

---

# MILESTONE 2 — Data Model

Read `/PRODUCT_SPEC.md` and `/CODEX_PLAN.md`.

Verify Milestone 1 still passes.

Work only on **Milestone 2 — Data Model**.

Create Prisma models for:

- User
- League
- Club
- Player
- Match
- MatchEvent
- MatchStat
- NewsSource
- Article
- ArticleCluster
- ArticleEntity
- Video
- DailyBrief
- BriefItem
- UserPreference
- JobRun
- ProviderStatus

Add:

- relationships
- indexes
- unique constraints
- timestamps
- processing statuses

Ensure Article supports:

- original source
- original language
- Vietnamese title
- Vietnamese summary
- story type
- rumor status
- reliability score
- clustering

Ensure DailyBrief is unique by date and locale.

Add:

- migration
- development seed structure

Do not integrate external APIs yet.

Run:

- Prisma validate
- migration
- seed
- lint
- typecheck
- tests
- build

Fix all errors.

Report:

- models created
- constraints
- indexes
- migration status
- seed behavior
- known limitations

Stop after Milestone 2.

---

# MILESTONE 3 — Match Provider

Read the specs.

Verify Milestones 1–2.

Work only on **Milestone 3 — Match Provider**.

Create a provider abstraction:

`MatchProvider`

It must support:

- competitions
- fixtures
- match detail
- events
- statistics

Support initially:

- Premier League
- La Liga

Do not expose raw provider responses to the UI.

Create a normalized internal football domain model.

Implement provider configuration through environment variables.

If no real API key exists:

- keep adapter production-ready
- allow development fallback
- do not create fake production behavior

Add sync logic:

External API  
→ normalize  
→ database

Do not build advanced UI yet.

Run tests for:

- provider normalization
- duplicate match handling
- provider errors

Run:

- lint
- typecheck
- tests
- build

Stop after Milestone 3.

---

# MILESTONE 4 — Match UI

Read the specs.

Verify previous milestones.

Work only on **Milestone 4 — Match UI**.

Create:

- `/matches`
- `/match/[slug]`

Match card must show:

- competition
- home team
- away team
- team crests
- score
- kickoff
- match status

Match detail should show when available:

- score
- events
- goals
- cards
- substitutions
- venue
- match stats

Statuses:

- upcoming
- live
- finished

Display times in UTC+7.

Make UI:

- mobile-first
- tablet responsive
- desktop responsive

Do not add news or AI yet.

Handle missing data gracefully.

Run:

- lint
- typecheck
- tests
- build

Stop after Milestone 4.

---

# MILESTONE 5 — News Ingestion

Read specs.

Work only on **Milestone 5 — News Ingestion**.

Create:

`NewsProvider`

Support ingesting articles from a small high-quality initial source set.

Prioritize:

- official league sources
- official club sources
- BBC Sport
- Sky Sports
- Reuters
- ESPN
- Marca
- AS

Start with 3–5 working sources.

Store raw article data before AI processing.

Required fields:

- source
- source URL
- original title
- original text or excerpt
- original language
- published timestamp
- collected timestamp

Implement duplicate URL prevention.

Provider failure must not stop all ingestion.

Do not translate yet.

Do not summarize yet.

Run tests for:

- duplicate URL
- provider failure
- malformed article
- timestamp normalization

Run full validation.

Stop after Milestone 5.

---

# MILESTONE 6 — AI Processing Pipeline

Read specs.

Work only on **Milestone 6 — AI Processing Pipeline**.

Implement AI processing for stored articles.

Pipeline:

Raw Article  
→ language detection  
→ entity extraction  
→ story classification  
→ Vietnamese translation  
→ Vietnamese summary  
→ publishability assessment

Supported story types:

- MATCH
- PLAYER
- CLUB
- TRANSFER
- INJURY
- MANAGER
- TACTICAL
- CONTRACT
- FINANCIAL
- OFF_FIELD
- INTERVIEW
- DISCIPLINE

Rules:

AI must never invent:

- score
- stats
- quote
- injury
- transfer
- club statement

Preserve uncertainty.

Examples:

- reportedly
- may
- could
- interested
- understood to

must remain uncertain in Vietnamese.

Persist:

- titleVi
- summaryVi
- entities
- storyType
- processing status

Run AI pipeline tests with deterministic fixtures where possible.

Stop after Milestone 6.

---

# MILESTONE 7 — Reliability Engine

Read specs.

Work only on **Milestone 7 — Reliability Engine**.

Implement source reliability and story classification.

Labels:

- OFFICIAL
- RELIABLE
- SOCIAL
- RUMOR

Store source reliability configuration outside frontend components.

Create admin-configurable or data-driven source scores.

Example baseline:

- Official club: 100
- Reuters: 98
- BBC: 95
- Sky Sports: 93
- The Athletic: 93
- Marca: 85
- AS: 82
- Unknown source: low score

Important:

Source reliability is not the same as truth probability.

Every publishable story must expose:

- source
- source URL
- label
- reliability score

Add tests preventing rumor from appearing as confirmed.

Stop after Milestone 7.

---

# MILESTONE 8 — News Deduplication

Read specs.

Work only on **Milestone 8 — News Deduplication**.

Implement ArticleCluster.

Cluster similar stories using a combination of:

- title similarity
- entities
- clubs
- players
- story type
- publication time
- embeddings if available

Do not merge unrelated stories just because teams are the same.

Cluster display should support:

- canonical headline
- summary
- multiple sources

Example:

BBC + Sky + Marca  
→ one story cluster.

Add tests for:

- obvious duplicates
- near-duplicates
- unrelated articles

Stop after Milestone 8.

---

# MILESTONE 9 — News UI

Read specs.

Work only on **Milestone 9 — News UI**.

Create:

- `/news`
- `/news/[slug]`

Homepage may now include:

- Top Stories
- Latest News
- Club Stories

News cards must show:

- Vietnamese headline
- Vietnamese summary
- source
- reliability
- published time
- related club/player

News detail must include source information:

- original source
- original title
- language
- publication time
- original URL

All user-facing primary content must be in Vietnamese.

Do not implement transfers as a separate page yet.

Run accessibility and responsive checks.

Stop after Milestone 9.

---

# MILESTONE 10 — Transfer Center

Read specs.

Work only on **Milestone 10 — Transfer Center**.

Create:

`/transfers`

Transfer fields:

- player
- current club
- target club
- status
- source
- reliability
- published time

Statuses:

- CONFIRMED
- NEGOTIATION
- INTEREST
- RUMOR

Filters:

- league
- club
- player
- status
- reliability

Critical rule:

RUMOR must never render as CONFIRMED.

Add business rule tests.

Stop after Milestone 10.

---

# MILESTONE 11 — YouTube Highlights

Read specs.

Work only on **Milestone 11 — YouTube Highlights**.

Create:

`VideoProvider`

Implement YouTube highlight discovery.

Priority order:

1. official league
2. official club
3. rights-holding broadcaster
4. trusted verified channel

Validate:

- channel
- teams
- match
- publish timing

Store:

- video ID
- title
- channel
- thumbnail
- URL
- publishedAt
- trustLevel
- matchId

Never prefer unknown re-upload channels over official sources.

Fallback text:

“Highlight chính thức chưa được tìm thấy.”

Add tests for trusted/untrusted channel ordering.

Stop after Milestone 11.

---

# MILESTONE 12 — Morning Brief Engine

Read specs.

Work only on **Milestone 12 — Morning Brief Engine**.

Create DailyBrief generation.

Sections:

- Morning Summary
- Last Night Matches
- Match Insights
- Player Spotlight
- Club Stories
- Transfer Watch
- Coming Up
- More News

Brief generator must only use stored internal data.

Do not let AI independently search the internet during generation.

Input:

- Matches
- Articles
- Clusters
- Transfers
- Videos

Add basic ranking based on:

- source reliability
- recency
- football significance
- club relevance

If no matches exist:

do not show empty match section.

Store generated brief in database.

Allow regeneration safely.

Add tests.

Stop after Milestone 12.

---

# MILESTONE 13 — Scheduler

Read specs.

Work only on **Milestone 13 — Scheduler**.

Timezone:

Asia/Bangkok / UTC+7

Create scheduled jobs:

- 05:30 match sync
- 06:00 news sync
- 06:20 article processing
- 06:40 clustering
- 07:00 ranking
- 07:15 brief generation
- 07:30 validation
- 08:00 publication

Jobs must be:

- idempotent
- retryable
- logged
- observable

Use JobRun.

Running the same job twice must not duplicate DailyBrief.

Add retry/error tests.

Stop after Milestone 13.

---

# MILESTONE 14 — Morning Homepage

Read specs.

Work only on **Milestone 14 — Home / Morning Experience**.

Build the final Morning Brief homepage.

Structure:

- date
- morning greeting
- Morning Summary
- Top Story
- Last Night
- Player Spotlight
- Transfer Watch
- Coming Up
- Latest News

Mobile bottom navigation:

- Home
- Matches
- Transfers
- Following
- Search

Design direction:

modern sports intelligence

Avoid traditional newspaper-style clutter.

Optimize for a 5-minute morning reading experience.

Stop after Milestone 14.

---

# MILESTONE 15 — Authentication & Following

Read specs.

Work only on **Milestone 15 — Authentication & Following**.

Implement authentication.

Allow users to follow:

- leagues
- clubs
- players

Create:

`/following`

Persist preferences.

Add personalized ranking:

general importance  
+ user relevance

Do not create complex recommendation algorithms yet.

Add tests for:

- preference persistence
- authenticated access
- following/unfollowing

Stop after Milestone 15.

---

# MILESTONE 16 — Admin Dashboard

Read specs.

Work only on **Milestone 16 — Admin Dashboard**.

Create:

`/admin`

Protect admin routes.

Display system health:

- match provider
- news providers
- AI pipeline
- YouTube provider
- scheduler

Allow admin to:

- hide article
- feature article
- change classification
- change source reliability
- merge clusters
- inspect failed jobs
- disable sources

Do not require database CLI for common editorial fixes.

Add authorization tests.

Stop after Milestone 16.

---

# MILESTONE 17 — PWA

Read specs.

Work only on **Milestone 17 — PWA**.

Implement:

- manifest
- installability
- icons
- service worker
- offline shell
- basic caching

Avoid caching live match scores for too long.

Ensure app can be installed from mobile Chrome.

Test:

- offline shell
- installability
- cache behavior

Stop after Milestone 17.

---

# MILESTONE 18 — Notifications

Read specs.

Work only on **Milestone 18 — Notifications**.

Implement Morning Brief notification support.

Initial preference:

- Morning Brief notification

Optional settings structure may include:

- Match updates
- Official transfers

But do not fully implement those unless already trivial.

Notification example:

“Morning Brief đã sẵn sàng.”

Respect user preference and timezone.

Do not spam users.

Add notification delivery tests where possible.

Stop after Milestone 18.

---

# MILESTONE 19 — Production Hardening

Read specs.

Work only on **Milestone 19 — Production Hardening**.

Audit:

## Security

- secrets
- authorization
- input validation
- admin access
- exposed endpoints

## Performance

- pagination
- caching
- DB indexes
- query efficiency

## Reliability

- timeouts
- retries
- fallbacks
- logs
- provider failures

## SEO

Public pages:

- club
- player
- match
- public news

Private personalized pages:

- noindex where appropriate

Run:

- lint
- typecheck
- tests
- production build
- security review
- performance review

Fix blocker and high-severity issues.

Stop after Milestone 19.

---

# MILESTONE 20 — MVP Release Validation

Read specs.

Work only on **Milestone 20 — MVP Release Validation**.

Do not add major new features.

Perform full end-to-end validation.

Verify user can:

1. open the app
2. view EPL results
3. view La Liga results
4. open match detail
5. read Vietnamese news
6. inspect sources
7. distinguish rumor vs official
8. use Transfer Center
9. open trusted YouTube highlights
10. read Morning Brief
11. follow clubs
12. follow players
13. return the next day and receive a new brief

Validate scheduler.

Validate provider failures.

Validate admin corrections.

Validate mobile UX.

Create:

- final README
- deployment notes
- environment checklist
- known limitations
- production readiness report

Do not start Fan Pulse yet.

Stop after Milestone 20.

---

# PHASE 2 — Fan Pulse

Only begin after Milestone 20 is stable.

Read `/PRODUCT_SPEC.md` and `/CODEX_PLAN.md`.

Verify MVP is stable.

Implement **Fan Pulse Phase 1 using Reddit only**.

Create:

`SocialProvider`

Collect public:

- posts
- comments
- engagement metrics

Pipeline:

Social Data  
→ entity detection  
→ topic clustering  
→ sentiment  
→ Fan Pulse

Fan Pulse must clearly state that it reflects public discussion, not verified facts.

Do not add X/Twitter yet.

Add filters by:

- league
- club
- player
- match

Add tests for:

- social source labeling
- sentiment processing
- entity detection
- no social claim promoted to factual news

Stop after Reddit Fan Pulse.

---

# PHASE 3 — Advanced Social

Only start after Fan Pulse Phase 1 is stable.

Evaluate separately:

- X
- YouTube comments
- other public social sources

Do not add integrations without validating:

- API availability
- cost
- rate limits
- terms of service
- data licensing
- moderation requirements

Implement one source at a time.

---

# Standard end-of-milestone checklist

At the end of every milestone, Codex must report:

1. Milestone completed
2. Files created
3. Files changed
4. Database changes
5. Environment variables added
6. Commands executed
7. Test results
8. Typecheck result
9. Lint result
10. Build result
11. Known limitations
12. Manual configuration required
13. Recommended next milestone

Never automatically continue to the next milestone.

---

# Standard validation commands

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

If a command does not exist:

- configure it when appropriate; or
- explain clearly why it is not available.

Never report a milestone as complete while build-breaking errors remain.
