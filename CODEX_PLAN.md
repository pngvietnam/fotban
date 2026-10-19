# Football Morning Brief — Codex Execution Plan

Phiên bản: 1.0 · Ngày: 2026-10-16 · Source of truth: `PRODUCT_SPEC.md`

## 1. Cách thực thi

Triển khai tuần tự theo milestone; mỗi milestone là một increment có thể kiểm tra độc lập, không phải chỉ tạo skeleton. Chỉ bắt đầu bước kế tiếp khi acceptance criteria của bước hiện tại đã đạt. Sprint là nhóm công việc đề xuất, không phải cam kết thời lượng khi chưa biết team, quota và provider.

Trong mỗi milestone: đọc code hiện có → ghi phạm vi/dependencies → triển khai → chạy build, lint, typecheck và tests phù hợp → sửa lỗi → cập nhật README, `.env.example`, migration/runbook nếu liên quan → ghi kết quả và phần còn thiếu trong `docs/PROGRESS.md`. Đừng báo pass khi chưa chạy; ghi rõ command, môi trường, kết quả và hạn chế. Nếu project chưa có script cần thiết, thiết lập script trước khi dùng làm gate.

Không triển khai toàn bộ trong một lần. Không dùng fake data trong production; seed/fixtures chỉ local/test và phải được cách ly bằng cấu hình. Không hard-code secrets, provider/model hoặc source scores trong component/business logic. Không dùng AI làm nguồn fact. Các API cần key chưa có phải hiển thị unavailable, giữ milestone tích hợp ở trạng thái chưa hoàn thành thay vì tạo dữ liệu thay thế.

Stop condition nghĩa là dừng chuyển milestone, ghi nguyên nhân và bước khắc phục; tiếp tục sửa trong phạm vi hiện tại nếu có thể. Khi thiếu credentials/quyền hoặc một quyết định không thể suy ra, chỉ yêu cầu đúng thông tin cần thiết; không bỏ gate. Không cần xin xác nhận lại cho các chỉnh sửa local có thể hoàn tác thuộc phạm vi đã yêu cầu.

## 2. Sprint map và dependency

| Sprint | Milestone | Kết quả |
| --- | --- | --- |
| S1 | 1–2 | Foundation và database |
| S2 | 3–4 | Match data thật đến UI |
| S3 | 5–8 | News pipeline có evidence, reliability và clusters |
| S4 | 9–11 | News UI, transfers, highlights |
| S5 | 12–14 | Morning Brief tự động và homepage |
| S6 | 15–18 | Following, admin, PWA, notification capability |
| S7 | 19–20 | Hardening và MVP release |
| S8 — sau MVP | 21 | Reddit Fan Pulse |

Core dependency: providers → normalized DB → processing/gates → cluster/ranking → Brief → scheduler → publication/UI. Milestone 16 là admin đầy đủ; trước đó có thể dùng protected operational scripts để test/review, không để nội dung chưa validate thành public. Auth foundation có thể chuẩn bị sớm nếu cần, nhưng following chỉ nghiệm thu ở Milestone 15.

## Milestone 1 — Foundation

### Goal

Khởi tạo ứng dụng chạy local, build được và có cấu hình an toàn.

### Tasks

- Tạo Next.js + TypeScript + Tailwind; cấu trúc `/app`, `/components`, `/lib`, `/types`, `/providers`, `/services`, `/jobs`, `/prisma`.
- Cài Prisma/PostgreSQL connection, ESLint, typecheck, test runner; logger có redaction, global error/loading handling và health endpoint.
- Tạo README setup và `.env.example`: `DATABASE_URL`, `SPORTS_API_KEY`, `NEWS_API_KEY`, `YOUTUBE_API_KEY`, `OPENAI_API_KEY`, `NEXT_PUBLIC_APP_URL`; thêm auth/scheduler/notification variables khi tích hợp. Keys là server-only; public URL không chứa secrets.
- Local thiếu optional provider key vẫn khởi động được, hiển thị trạng thái chưa cấu hình. Chọn package versions tương thích và lockfile.

### Acceptance Criteria

Install/dev/build/lint/typecheck pass; test runner chạy; Prisma kết nối local DB; health phân biệt app và DB status; không secret trong tracked files. README đủ để tái tạo môi trường.

### Stop condition

Không chuyển Milestone 2 khi build, DB connection hoặc environment validation chưa hoạt động.

## Milestone 2 — Data Model

### Goal

Schema đáp ứng domain và chống duplicate ở database.

### Tasks

- Tạo Prisma models: User, League, Season, Club, Player, Match, MatchEvent, MatchStat, NewsSource, Article, ArticleCluster, ArticleEntity, Video, DailyBrief, BriefItem, UserPreference, UserFollow, JobRun, ProviderStatus.
- Bổ sung Transfer/TransferUpdate, ClaimEvidence, Quote, AIProcessingRun, AdminAuditLog; Notification/PushSubscription khi cần. SocialPost/SocialTopic có thể migration sau Milestone 20.
- Article có original/source fields, Vietnamese output, timestamps, storyType, rumorStatus, reliabilityClass/score, cluster và processingStatus; DailyBrief có date/locale/status/window/cutoff/revision/publication timestamps.
- Tạo FK/join tables, unique constraints và indexes theo `PRODUCT_SPEC.md`; migration, local seed tách production, UTC policy và retention design.

### Acceptance Criteria

Schema validate, migration trên DB trống và DB đã migrate thành công; seed local hoạt động; test chứng minh canonical URL, external IDs, follows và date+locale Brief không trùng. Quan hệ evidence/BriefItem có integrity; rollback/restore approach được ghi lại.

### Stop condition

Không tiếp tục nếu migration lỗi, unique constraints thiếu hoặc schema cho phép published content mất provenance ngoài chính sách.

## Milestone 3 — Match Provider

### Goal

Dữ liệu EPL/La Liga thật chạy từ provider qua DB đến internal API.

### Tasks

- Chọn vendor sau khi kiểm tra coverage, quyền và quota; ghi capability matrix, không cam kết field vendor chưa hỗ trợ.
- Tạo `MatchProvider`: getCompetitions/getMatches/getMatch/getMatchEvents/getMatchStats; adapter map IDs, timezone, statuses và score components.
- Sync fixtures/results/clubs/events; stats tùy capability; idempotent upsert, checkpoint, timeout/retry/backoff và ProviderStatus.
- Internal API đọc domain/DB; credentials không ra browser; ghi source và lastUpdatedAt.

### Acceptance Criteria

Sync dữ liệu thật của cả hai giải → PostgreSQL → internal API thành công. Rerun không tạo trùng; contract tests cho status/time/penalty mapping; lỗi/429/missing fields có xử lý. Có bằng chứng integration thực, không chỉ mock.

### Stop condition

Không chuyển bước nếu một giải chưa có dữ liệu thật, mapping sai hoặc UI/API còn phụ thuộc raw vendor payload.

## Milestone 4 — Match UI

### Goal

Người dùng xem kết quả và chi tiết trận chính xác trên mobile/desktop.

### Tasks

- Tạo `/matches` và `/match/[slug]`; lọc ngày/giải, card có logo/tên/score/status/kickoff.
- Detail hiển thị info/timeline/goals/cards/substitutions/stats theo availability. Upcoming dùng giờ UTC+7; LIVE/FT và postponed/cancelled có nhãn đúng.
- Loading/error/empty/stale states, không render null; không đưa AI vào score pipeline.

### Acceptance Criteria

Kiểm tra viewport mobile/tablet/desktop, fixture thật và scenario upcoming/live/FT/hoãn/hủy/thiếu stats. Navigation hoạt động; timezone không lệch ngày; không coi score chưa có là 0–0.

### Stop condition

Dừng nếu tỷ số/trạng thái sai, route lỗi hoặc dữ liệu thiếu được biểu diễn như fact.

## Milestone 5 — News ingestion

### Goal

Thu thập bài nguồn có provenance và chạy lại an toàn.

### Tasks

- Tạo `NewsProvider.fetchLatestArticles` với cursor; source registry/config, bắt đầu 3–5 API/RSS/official sources hoạt động, có coverage hai giải.
- Kiểm tra quyền sử dụng và attribution; lưu sourceUrl/canonicalUrl, titleOriginal, excerpt/content được phép, language, publishedAt, collectedAt và raw metadata phù hợp retention.
- Canonicalize URL bảo toàn identity; upsert, pagination/checkpoint; không dịch trong ingestion; cô lập lỗi từng provider.

### Acceptance Criteria

Sync thật và rerun không tạo duplicate URL. Một source lỗi không hủy các source khác; missing date/content có trạng thái kiểm tra, không tự đoán thành fact. Logs nêu counts/cursor/errors an toàn.

### Stop condition

Dừng nếu thiếu quyền truy cập, không trace được nguồn hoặc ingestion làm mất original metadata.

## Milestone 6 — AI pipeline

### Goal

Chuyển raw news thành nội dung tiếng Việt có evidence và kiểm soát xuất bản.

### Tasks

- Tạo `AIProvider`, structured schema cho language/entity extraction/story classification/titleVi/summaryVi; story types theo spec.
- Pipeline có status/retries; summary 50–150 từ theo dữ liệu; fact/analysis tách rõ; uncertainty và quote giữ đúng.
- Lưu ClaimEvidence, Quote, input IDs/hash, model/prompt/schema versions và validation outcome; numeric/entity consistency checks.
- Chặn source prompt injection; thiếu evidence/output schema sai → NEEDS_REVIEW/FAILED. Chỉ đánh publishable sau reliability gate ở Milestone 7.

### Acceptance Criteria

Real AI integration tạo output có đủ titleVi/summaryVi/storyType/entities/evidence. Test could/may/reportedly, quote, unsupported injury/stat/score và injected instruction; claims không có input bị chặn. Reprocess không phá manual override.

### Stop condition

Dừng nếu AI tự tạo fact/URL/quote hoặc output chưa validate được publish.

## Milestone 7 — Reliability

### Goal

Nguồn, nhãn reliability và claim status được phân biệt nhất quán.

### Tasks

- Source config trong DB: score/rationale/reviewer/reviewedAt/enabled; các điểm minh họa trong spec cần review, không hard-code component.
- Gán OFFICIAL/RELIABLE/SOCIAL/RUMOR theo evidence; tách source score khỏi truth probability và transfer status.
- Publication gate bắt buộc source URL, evidence, label và Vietnamese output; audit overrides, unknown source chuyển review theo policy.

### Acceptance Criteria

Mọi publishable Article có source/link/label; test báo uy tín đưa tin đồn vẫn giữ uncertainty; social không xác nhận transfer; official ngoài thẩm quyền không tự xác nhận claim. Không có UI “95% chắc chắn” suy ra từ source score.

### Stop condition

Không tiếp tục nếu rumor tự thành confirmed hoặc record thiếu nguồn lọt gate.

## Milestone 8 — Deduplication

### Goal

Một câu chuyện có nhiều nguồn xuất hiện thành một cluster hợp lý.

### Tasks

- Similarity theo title/entities/storyType/time; embedding tùy chi phí, không bắt buộc cho baseline.
- Giữ tất cả source records, chọn representative và ghi lý do/version; không coi bài dẫn lại là nguồn độc lập.
- Có merge/unmerge service và conflict marker cho cập nhật/nguồn trái chiều; ranking dùng cluster identity.

### Acceptance Criteria

Test story trùng được nhóm; cùng cầu thủ nhưng sự kiện khác không bị gộp; nguồn mâu thuẫn giữ nguyên evidence; rerun ổn định và merge có thể hoàn tác. Homepage candidate feed không có duplicate rõ ràng.

### Stop condition

Dừng khi clustering xóa provenance, gộp sai các sự kiện quan trọng hoặc che mâu thuẫn.

## Milestone 9 — News UI

### Goal

Đọc tin tiếng Việt và kiểm tra nguồn dễ dàng.

### Tasks

- Tạo `/news`, `/news/[slug]`, Top Stories/Latest/Club Stories components, filters/pagination.
- Card có headline, summary, time, entities, reliability/rumor labels; source drawer có publication/original title/language/time/URL.
- Detail có citations cho claims, nhãn AI summary, analysis và quote; chỉ query published/non-hidden records.
- Bắt đầu club/player pages và global search cơ bản từ entities đã có.

### Acceptance Criteria

Luồng list → detail → source hoạt động trên mobile; nội dung biên tập tiếng Việt, giữ tên riêng; nguồn reachable từ mọi card. Hidden/unprocessed article không hiện; lỗi/empty/filter có trạng thái rõ.

### Stop condition

Dừng nếu UI thiếu citations, nhãn rumor hoặc làm lộ unpublished content.

## Milestone 10 — Transfer Center

### Goal

Theo dõi chuyển nhượng với trạng thái có bằng chứng.

### Tasks

- Tạo Transfer/TransferUpdate service và `/transfers`; link player/currentClub/targetClub/evidence/timestamps.
- Filters league/club/player/status/reliability; latest/reliable sorting; unknown fee/date giữ unknown.
- State transition CONFIRMED/NEGOTIATION/INTEREST/RUMOR có evidence/audit; không đổi status bằng text AI đơn thuần.

### Acceptance Criteria

RUMOR không thể hiển thị CONFIRMED khi thiếu official evidence. Test negotiation, status history, conflicting reports và duplicate update; mỗi item mở được nguồn và entity pages.

### Stop condition

Dừng nếu rumor bị nâng cấp không có bằng chứng hoặc lịch sử trạng thái bị mất.

## Milestone 11 — YouTube highlights

### Goal

Match Detail có video hợp lệ hoặc fallback chính xác.

### Tasks

- `VideoProvider.searchMatchHighlights`, YouTube API adapter; candidate search theo teams/date/competition.
- Channel ID allowlist đã review, kiểm tra match identity, quyền phù hợp, availability/embedding; verified badge không đủ.
- Lưu video/channel/thumbnail/duration/URL/trust/validation/match metadata; revalidation và handling deleted/region restricted.

### Acceptance Criteria

Chỉ video validated mới embed/link như highlight. Test wrong match, re-upload, deleted/unavailable và no-result. Fallback: “Highlight chính thức chưa được tìm thấy.” Không rehost video.

### Stop condition

Dừng nếu candidate chưa xác minh tự xuất hiện hoặc video chỉ được chọn vì title giống trận.

## Milestone 12 — Morning Brief engine

### Goal

Generate Brief cho một ngày từ DB snapshot có kiểm chứng.

### Tasks

- Sections Morning Summary, Last Night Matches, Top Match Insights, Player Spotlight, Club Stories, Transfer Watch, Coming Up, More News.
- Ranking baseline với normalized importance components/config version; không có social signal giả. Diversity/dedup theo cluster.
- Date/locale unique, window/cutoff và immutable input references; lifecycle DRAFT/VALIDATING/READY/PUBLISHED/FAILED/NEEDS_REVIEW.
- AI chỉ dùng DB input; evidence cho từng BriefItem; no-match/low-data behavior, hide empty sections, upcoming 48 giờ; revision khi sửa.

### Acceptance Criteria

Generate và lưu Brief cho ngày chỉ định. Tests: date boundary, no-match, missing highlights, unsupported claim, duplicate sources và repeat generation. Không bản rỗng/thiếu evidence nào đạt READY; content trace tới source/match fields.

### Stop condition

Dừng nếu Brief tự search/tạo fact, không tái hiện được input hoặc tạo duplicate date+locale.

## Milestone 13 — Scheduler

### Goal

Pipeline tự chạy và publish đúng 08:00 UTC+7.

### Tasks

- Scheduler/worker bền vững, IANA timezone Asia/Bangkok, DB timestamps UTC.
- Lịch: incremental 00:00–06:00; matches 05:30; news 06:00; process 06:20; dedup 06:40; cutoff/rank 07:00; generate 07:15; validate 07:30; publish 08:00.
- Dependency checks/checkpoints, distributed lease, logical job keys, bounded retry/backoff, failed queue, JobRun metrics, rerun và alerts.
- Publish atomically chỉ READY; delayed/failure policy và latest available UI contract; notifications chỉ sau commit PUBLISHED.

### Acceptance Criteria

Staging rehearsal chứng minh sequencing và publication. Test hai worker/rerun không trùng Brief; lỗi AI/provider hoặc job kéo dài không khiến job sau publish sai. Ngày local/UTC mapping chính xác; failed run quan sát được.

### Stop condition

Dừng nếu scheduler chỉ sống theo dev process, publish bỏ gate, duplicate hoặc thiếu failure recovery.

## Milestone 14 — Homepage / Morning experience

### Goal

Luồng đọc buổi sáng mạch lạc trong 5–10 phút.

### Tasks

- Home có date, Morning Summary, Top Story, Last Night, Player Spotlight, Transfer Watch, Coming Up, Latest; lấy published Brief revision.
- Mobile bottom nav Home/Matches/Transfers/Following/Search; desktop nav; bổ sung club/player/search routes cơ bản còn thiếu.
- Loading/empty/stale/error/no-match states; ngày Brief cũ rõ ràng; không hard-code số stories hoặc nội dung demo.

### Acceptance Criteria

Walkthrough mobile và desktop từ Home đến match/news/source/highlight/transfer hoàn tất; section rỗng ẩn, timestamp chính xác. Usability review xác nhận nội dung chính đọc được trong 5–10 phút, ghi kết quả và vấn đề.

### Stop condition

Dừng nếu Home hiển thị draft, gọi bản cũ là hôm nay hoặc luồng đọc bị chặn trên mobile.

## Milestone 15 — Auth & Following

### Goal

Preferences cá nhân bền vững và bảo vệ theo user.

### Tasks

- Thiết lập auth email/Google theo cấu hình, session/role server-side; login/logout/error flows.
- Follow/unfollow league/club/player, `/following`, UserPreference/UserFollow; hoàn thiện entity pages với follow controls.
- Ranking v2 thêm user relevance; Brief chung vẫn có một date+locale identity, cá nhân hóa selection/order không sửa bản gốc và không tạo shared cache leak.

### Acceptance Criteria

Follow persist sau logout/login; unique follows; user A không đọc/sửa preference của B. Guest đọc public Brief; personalized ranking không thay reliability/status. Tests ownership/session và preference persistence pass.

### Stop condition

Dừng nếu có cross-user access, session yếu hoặc private content rò qua cache.

## Milestone 16 — Admin

### Goal

Editor xử lý sai sót và vận hành không cần sửa DB thủ công.

### Tasks

- `/admin` có server authorization; dashboard provider/AI/YouTube/scheduler health, freshness, failures và quota nếu có.
- Hide/unhide, headline/classification/reliability override có lý do, feature, source disable, cluster merge/unmerge, inspect/rerun jobs và review AI/video.
- Audit log actor/before/after/reason/time; invalidate feed/Brief caches và tạo correction revision theo chính sách.

### Acceptance Criteria

Non-admin bị từ chối cả route/API; admin ẩn bài thì public surfaces liên quan phản ánh thay đổi. Test audit/merge reversal/rerun; không override CONFIRMED thiếu evidence. Failed job có đủ dữ liệu để xử lý, không lộ secrets.

### Stop condition

Dừng nếu admin chỉ bảo vệ phía UI, thao tác không audit hoặc nội dung ẩn vẫn tồn tại ở feed/Brief cache.

## Milestone 17 — PWA

### Goal

Website cài được và đọc trạng thái offline trung thực.

### Tasks

- Manifest/icons/service worker/HTTPS setup và install guidance theo browser support.
- Offline shell/cache public read content; TTL scores/news/history/Brief theo spec, revision invalidation; stale timestamp rõ ràng.
- Không cache admin/auth/private API dạng public; cleanup personal cache khi logout; update service worker flow.

### Acceptance Criteria

Kiểm tra installability trên Chrome mobile hoặc môi trường tương đương, mở từ Home Screen, offline/reconnect/update flows. Score stale có nhãn, logout không lộ private content; không có cache chặn correction.

### Stop condition

Dừng nếu cache làm sai freshness, rò dữ liệu cá nhân hoặc phiên bản cũ không cập nhật được.

## Milestone 18 — Notifications capability

### Goal

Chuẩn bị opt-in thông báo Brief, không làm chậm core release khi kênh chưa sẵn sàng.

### Tasks

- Feature flag, consent/preferences, subscribe/unsubscribe, notification provider abstraction và delivery log.
- Chỉ gửi “Morning Brief của bạn đã sẵn sàng.” sau publication; idempotency theo user/brief/channel, bounded retry và xử lý subscription hết hạn.
- MVP chưa gửi breaking hàng loạt. Email digest và preferences Match/Transfer official-only/Major News để Phase 2 nếu chưa tích hợp.

### Acceptance Criteria

Khi bật: end-to-end opt-in → publish → nhận một thông báo → click mở đúng Brief → unsubscribe không nhận nữa; rerun không gửi trùng. Khi chưa có delivery provider: feature tắt, không xin quyền/gửi thật, capability và phần hoãn được ghi rõ.

### Stop condition

Dừng việc bật notification nếu thiếu consent/dedup hoặc provider chưa hoạt động. Có thể chuyển Milestone 19 với feature tắt và ghi rõ deferred; không tuyên bố notification hoàn tất.

## Milestone 19 — Production hardening

### Goal

Ứng dụng sẵn sàng vận hành với dữ liệu thật và phục hồi lỗi.

### Tasks

- Security: secrets scan, input sanitization, XSS/SSRF protection ở content fetch, ownership/admin authorization, secure sessions, request limits và log redaction.
- Performance: pagination, indexes/query inspection, public/private caching, connection pooling, image optimization; kiểm tra mobile accessibility.
- Reliability: retries/timeouts, quota/cost limits, queue lag/failure alerts, backup/restore drill, migration và rollback runbook, graceful provider outage.
- SEO public club/player/match/story có canonical/metadata; personalized/admin noindex; analytics events cho Brief opens/completion, source/highlight clicks và follows.
- CI build/lint/typecheck/tests, staging smoke tests; deployment environment separation và health checks.

### Acceptance Criteria

Production build và required checks pass, không blocker security/data correctness. Staging tests thật cho provider/AI; test outage/concurrency/publication failure; restore drill có bằng chứng. Không secret trong client bundle/log; monitoring và runbook đủ để vận hành.

### Stop condition

Không release nếu còn blocker, backup chưa khôi phục được, mất citations hoặc pipeline lỗi âm thầm.

## Milestone 20 — MVP release

### Goal

Ra mắt một sản phẩm đọc bản tin buổi sáng dùng được thật.

### Tasks

- Đối chiếu toàn bộ acceptance criteria của `PRODUCT_SPEC.md`; tạo release checklist và ghi trạng thái từng requirement.
- Chạy rehearsal ít nhất hai ngày Brief liên tiếp; kiểm tra no-match và provider/AI outage qua scenario có kiểm soát, không bơm dữ liệu giả vào public production.
- Chuẩn bị environment/credentials/quota, migrations/backup, workers/scheduler, domain/HTTPS, smoke tests và rollback; feature flags social/notifications đúng phạm vi.
- Deploy qua pipeline được cấu hình, kiểm tra sau deploy và ghi release notes/known limitations. Chỉ thay đổi hạ tầng ngoài phạm vi/quyền đã có sau khi nêu rõ yêu cầu còn thiếu.

### Acceptance Criteria

Người dùng mở app buổi sáng → xem results EPL/La Liga và match detail → đọc Brief tiếng Việt → xem tin CLB/cầu thủ và transfers → phân biệt rumor/official → mở nguồn → xem highlight hợp lệ hoặc fallback → follow CLB/cầu thủ → quay lại hôm sau có Brief mới. Admin xử lý lỗi được; lịch tự chạy đúng; không fake production data. Optional notifications tắt được ghi rõ, không chặn core.

### Stop condition

Không đánh dấu MVP released nếu luồng trên thất bại, publication không tự chạy hoặc còn blocker. Nếu chưa có hosting/keys/quyền deploy, bàn giao bản local/staging đã kiểm tra và nêu release đang pending, không tuyên bố production thành công.

## Milestone 21 — Fan Pulse (Phase 2)

### Goal

Tổng hợp chủ đề và cảm xúc của mẫu thảo luận công khai sau khi core ổn định.

### Tasks

- Chỉ bắt đầu khi Milestone 20 đạt gate core. Tạo SocialProvider/Reddit adapter, kiểm tra API access/quota/retention, SocialPost/SocialTopic migrations.
- Ingest posts/comments/engagement; entity detection, spam/dedup, topic clustering, sentiment; giới hạn tác động một thread/tài khoản và xác định sample window/baseline.
- `/fan-pulse` filters league/club/player/match/topic; tích hợp club/player/match/Brief sections theo feature flag. Trending 5–10 topics trong 12–24 giờ khi mẫu đủ.
- Hiển thị sample size, window, communities, nguồn, cách tính sentiment/topic shares/velocity và caveat bắt buộc. Mẫu dưới ngưỡng thì ẩn tỷ lệ; không chế số liệu.
- Thêm moderation, xử lý deletion, monitoring và tests tách social opinion khỏi fact pipeline. X/YouTube comments là phase sau, không tự mở rộng.

### Acceptance Criteria

Output tính từ real public sample; percentages có mẫu số/cách tính, không diễn giải là toàn bộ fan. Luôn ghi “Dựa trên các thảo luận công khai được hệ thống thu thập.” Social không xác nhận injury/transfer; cited sources truy cập được, insufficient sample/ingestion failure có fallback. Pipeline mới không làm trễ core Brief.

### Stop condition

Không bật Fan Pulse nếu core chưa ổn, thiếu API rights, mẫu không đủ hoặc opinion bị trình bày thành fact. Giữ feature tắt và không block core.

## 3. Test matrix bắt buộc

| Business rule | Bằng chứng nghiệm thu |
| --- | --- |
| Không có source/evidence | Article/BriefItem bị chặn publish |
| Rumor không thành fact | Status transition bị từ chối khi thiếu official evidence |
| Idempotency | Rerun/concurrent workers không duplicate Article/Brief/notification |
| No-match day | Ẩn Last Night, còn tin có nguồn và upcoming |
| Provider/AI/YouTube failure | Core không crash; dữ liệu stale/thiếu được ghi rõ; không tạo fact thay thế |
| Match normalization | UTC+7, postponed/cancelled, null score và extra-time/penalties mapping đúng |
| AI factuality | Unsupported number/injury/quote/URL và prompt injection không lọt gate |
| Dedup/conflicts | Trùng story được nhóm, khác sự kiện không gộp, nguồn trái chiều còn hiển thị |
| Permissions | Guest/public, user ownership, admin server authorization đúng |
| Corrections/cache | Hide/revision phản ánh trên Home/Brief/PWA, private data không rò |
| Fan Pulse | Mẫu/denominator/window đúng, social opinion không xác thực fact |

Fixtures cho unit/contract tests tách hoàn toàn production. Integration với API thật kiểm tra ở staging với quota giới hạn; tests deterministic không phụ thuộc dịch vụ live cho mọi CI run. E2E tập trung luồng quan trọng, không viết test chỉ lặp lại chi tiết implementation.

## 4. Handoff và báo cáo sau mỗi milestone

Ghi trong `docs/PROGRESS.md`: milestone/status, hành vi đã hoàn thành, schema/API changes, commands/checks và kết quả thực, integration evidence không chứa secrets, known limitations, env cần thêm và next step. README luôn có cách chạy web/worker/scheduler, seed local, migrations và cách khôi phục lỗi.

Completion report phải phân biệt rõ `implemented`, `verified`, `deferred`, `blocked`; chỉ đóng milestone khi các gate bắt buộc đã verified. Fan Pulse và advanced social không được dùng để bù cho Morning Brief core chưa đạt.
