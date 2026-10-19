`football-data/` implements the primary free structured MatchProvider. DTO validation and normalization stay inside the adapter. See `docs/MATCH_PROVIDER.md` for capabilities, configuration, attribution and licensing.

`news/` implements Milestone 5 RSS/Atom and public-index metadata strategies behind NewsProvider. Official league/club candidates remain disabled. `wikimedia/` implements the enabled public Wikinews API adapter with per-article licence/attribution checks, published-policy evidence and bounded access. See `docs/NEWS_INGESTION.md` and `docs/WIKIMEDIA_NEWS.md`.

`youtube/` implements optional server-side VideoProvider discovery and metadata refresh. Services enforce reviewed source identity, finite competition/season mapping and conservative match validation. See `docs/VIDEO_HIGHLIGHTS.md`; no download/rehosting or provider requests on page render.
