# Football Morning Brief

## Business & Product Specification

Phiên bản: 1.0 · Ngôn ngữ: vi-VN · Ngày: 2026-10-16

Tài liệu này là source of truth về nghiệp vụ. `CODEX_PLAN.md` quy định thứ tự triển khai. Các ví dụ là mô tả hành vi, không phải dữ liệu để đưa lên production. Các chi tiết vận hành được cụ thể hóa ở đây là baseline triển khai; vendor, chi phí và quyền sử dụng dữ liệu phải được xác minh khi tích hợp.

## 1. Mục tiêu và giá trị sản phẩm

Football Morning Brief là website/PWA bóng đá bằng tiếng Việt, giúp người dùng nắm tình hình Premier League (EPL) và La Liga trong 5–10 phút mỗi sáng. Người đọc biết kết quả đêm qua, diễn biến đáng chú ý, cầu thủ nổi bật, tin CLB, chuyển nhượng, highlight hợp lệ và mức độ chắc chắn của từng thông tin.

Thông tin hiện phân tán giữa báo chí, trang CLB, dịch vụ tỷ số, YouTube và cộng đồng. Sản phẩm thu thập → chuẩn hóa → phân loại → kiểm tra nguồn → loại trùng → dịch/tóm tắt → xếp hạng → tạo bản tin. Giá trị chính là tiết kiệm thời gian, giảm nhiễu và giúp người đọc phân biệt fact, reporting, rumor, analysis và social opinion.

Ưu tiên giai đoạn đầu: chất lượng dữ liệu, nguồn minh bạch, xuất bản đều đặn và thói quen quay lại. Chưa triển khai paywall, quảng cáo phức tạp hoặc mô hình doanh thu trước khi chứng minh nhu cầu sử dụng.

## 2. Persona và hành trình

| Persona | Nhu cầu | Hành trình chính |
| --- | --- | --- |
| Fan bận rộn tại Việt Nam | Không thức đêm nhưng muốn biết chuyện gì xảy ra | Mở Home lúc sáng → đọc Brief → xem kết quả/highlight |
| Fan trung thành của CLB | Theo dõi đội, cầu thủ và chuyển nhượng liên quan | Follow → Following → xem tin theo CLB/cầu thủ |
| Người quan tâm tính xác thực | Phân biệt thông báo chính thức và tin đồn | Xem reliability/status → mở source drawer → đọc nguồn gốc |
| Editor/Admin | Vận hành và sửa lỗi nhanh | Xem provider/job health → kiểm duyệt → sửa hoặc ẩn nội dung |

Khách chưa đăng nhập đọc được nội dung công khai. Đăng nhập dùng cho preferences/following và notifications. Admin có quyền riêng, kiểm tra ở server.

## 3. Phạm vi theo phase

| Phase | Phạm vi |
| --- | --- |
| MVP core — Milestone 1–20 | EPL/La Liga; fixtures/results; match detail; news CLB/cầu thủ/off-field có chọn lọc; Transfer Center; dịch/tóm tắt; citations; reliability; deduplication; YouTube highlights; Morning Brief 08:00; homepage; auth/follow CLB/cầu thủ/giải; admin; responsive PWA; hardening/release |
| Phase 2 — Milestone 21 và mở rộng | Reddit Fan Pulse, sentiment, trending topics; cải tiến personalized ranking; email digest và mở rộng push |
| Phase 3 | X API, YouTube comments/community analysis, AI recommendations nâng cao, native iOS/Android; chỉ làm khi nguồn và điều kiện truy cập phù hợp |

Morning Brief push có milestone chuẩn bị trước release nhưng là capability bật bằng feature flag khi có hạ tầng và opt-in; thiếu push không chặn MVP đọc Brief. Không để social integration chặn core. Match lineups, player ratings, xG, player stats và standings phụ thuộc gói dữ liệu; không tự tạo giá trị khi provider thiếu.

## 4. Morning Brief

Mỗi ngày có một bản Brief công khai cho `date + locale`, dự kiến xuất bản 08:00 `Asia/Bangkok` (UTC+7). Nội dung chính bằng tiếng Việt; tên riêng, thương hiệu và thuật ngữ kỹ thuật phù hợp được giữ nguyên.

Các section:

1. **Morning Summary**: đoạn tổng quan ngắn, dẫn đến các story gốc.
2. **Last Night Matches**: các trận kết thúc trong cửa sổ lấy dữ liệu, kèm tỷ số, trạng thái, sự kiện chính và highlight nếu có.
3. **Top Match Insights**: 3–5 ý có chứng cứ từ match data hoặc bài nguồn; phân biệt nhận định với fact.
4. **Player Spotlight**: tối đa 3–5 cầu thủ có căn cứ đáng chú ý trong 24 giờ; chỉ hiển thị stats/rating thực có.
5. **Club Stories**: diễn biến CLB, HLV, hợp đồng, tập luyện, tài chính và tin liên quan.
6. **Transfer Watch**: cập nhật chuyển nhượng với trạng thái và nguồn.
7. **Coming Up**: fixtures trong 48 giờ tới, giờ địa phương; không dự đoán tỷ số trong MVP.
8. **More News**: tin bổ sung theo mức độ quan trọng.

Fan Pulse/Trending chỉ xuất hiện sau Phase 2. Section không có dữ liệu phải ẩn. Ngày không có trận chuyển trọng tâm sang tin CLB/cầu thủ/chuyển nhượng và lịch sắp tới. Không tạo nội dung cho đủ số lượng.

Cửa sổ tin mặc định là 24 giờ trước cutoff 07:00; lấy thêm story cũ khi có cập nhật quan trọng và ghi rõ thời điểm. Match đã kết thúc kể từ cutoff hôm trước được xét đưa vào Brief, dùng match ID để tránh lặp. Đây là baseline cấu hình, lưu `windowStart`, `windowEnd`, `cutoffAt` theo từng bản để tái hiện được đầu vào.

Lifecycle: `DRAFT → VALIDATING → READY → PUBLISHED`; lỗi chuyển `FAILED` hoặc `NEEDS_REVIEW`. Publication gate phải kiểm tra nguồn, factual claims, trạng thái rumor, dữ liệu trùng và section rỗng. Bản đã publish có revision khi sửa, không âm thầm ghi đè. Nếu pipeline trễ/lỗi, giữ bản gần nhất với ngày rõ ràng và trạng thái đang cập nhật; không gọi bản cũ là bản hôm nay. Bản thiếu module phụ như highlights vẫn có thể xuất bản nếu các nội dung còn lại đạt gate và ghi rõ thiếu dữ liệu. Không xuất bản bản rỗng hoặc claims không có bằng chứng.

## 5. Match results và Match Detail

`/matches` có bộ lọc ngày/giải, upcoming/live/finished. Card gồm giải, hai đội/logo được phép sử dụng, kickoff, trạng thái và score nếu đã có. Lưu thời gian UTC, hiển thị mặc định UTC+7.

`/match/[slug]` gồm score, match info, venue, timeline, goal/card/substitution events, statistics, lineup và player rating nếu được cung cấp, AI Match Summary có citation, Key Moments, highlight và related news. Fan Reaction chỉ mở ở Phase 2.

Chuẩn hóa các trạng thái ít nhất `SCHEDULED`, `LIVE`, `HALFTIME`, `FINISHED`, `POSTPONED`, `CANCELLED`, `SUSPENDED`; phân biệt regulation/extra time/penalty score nếu API có. Không coi trận hoãn là hòa 0–0; không hiển thị null/undefined. Dữ liệu thiếu ghi “Chưa có dữ liệu”; dữ liệu stale có `lastUpdatedAt`. Mục tiêu MVP là cập nhật kết quả, không cam kết live từng giây.

## 6. News, Club, Player và Outside The Pitch

Quyết định nguồn tin ngày 19/10/2026: ưu tiên RSS của các nhà xuất bản tiếng Việt đã có quyền sử dụng phù hợp cho luồng tin production; nguồn quốc tế được phép là bổ sung, GDELT chỉ là discovery metadata. Báo tiếng Việt không tự động là OFFICIAL. Thông tin chính thức vẫn cần bằng chứng có thẩm quyền từ CLB/giải/cầu thủ/HLV/liên đoàn. RSS công khai không đồng nghĩa quyền thương mại; giữ nguồn bị hạn chế ở trạng thái tắt cho đến khi có phạm vi cấp phép rõ ràng. Không thu thập toàn văn mặc định. Ma trận triển khai và căn cứ review tại `docs/VIETNAMESE_NEWS.md`.

`/news` hiển thị story đã xử lý, tìm kiếm/lọc theo giải, CLB, cầu thủ, loại tin, thời gian và reliability. `/news/[slug]` đại diện story/cluster với các nguồn liên quan. Card có headline tiếng Việt, summary, source, reliability label, published/updated time và entities.

Story types: `MATCH`, `PLAYER`, `CLUB`, `TRANSFER`, `INJURY`, `MANAGER`, `TACTICAL`, `CONTRACT`, `FINANCIAL`, `OFF_FIELD`, `INTERVIEW`, `DISCIPLINE`, `SOCIAL`.

Summary thông thường 50–150 từ, văn phong biên tập tự nhiên, giữ mức độ không chắc chắn của nguồn. “Why it matters” là analysis được gắn nhãn, không được thêm fact không có nguồn. Không sao chép toàn văn bài báo khi chưa có quyền.

`/club/[slug]`: thông tin CLB, follow, kết quả gần nhất, lịch tới, news, transfers, players; Fan Pulse/Trending sau. `/player/[slug]`: tên, ảnh hợp lệ, CLB, vị trí, quốc tịch và stats nếu có, performance/news/transfers. Thông tin tuổi, CLB hiện tại phải có nguồn và thời điểm cập nhật.

Outside The Pitch gồm phỏng vấn, sponsorship, hoạt động cộng đồng, documentary, giải thưởng, tổ chức CLB và controversy có giá trị thông tin. Không ưu tiên scandal rác, đời tư không có căn cứ hoặc cáo buộc bị trình bày như kết luận. Nội dung nhạy cảm/nguồn mâu thuẫn đưa vào review.

## 7. Transfer Center

`/transfers` là feed riêng, lọc league/club/player/status/reliability; sắp theo latest hoặc source reliability, thêm most discussed khi social có dữ liệu.

Mỗi transfer gồm player, currentClub tại thời điểm báo cáo, targetClub, loại giao dịch nếu biết, status, summary, source/evidence, publishedAt, updatedAt và lịch sử trạng thái. Fee/currency/contract dates chỉ hiển thị nếu nguồn nêu; chưa rõ dùng unknown.

| Status | Ý nghĩa |
| --- | --- |
| `CONFIRMED` | Có bằng chứng xác nhận chính thức từ CLB/giải/đại diện có thẩm quyền phù hợp với claim |
| `NEGOTIATION` | Nguồn nói đang thương lượng; chưa phải hoàn tất |
| `INTEREST` | Quan tâm/theo dõi/tiếp cận sơ bộ |
| `RUMOR` | Thông tin chưa xác nhận hoặc suy đoán |

Nguồn báo chí uy tín đưa tin không tự động biến thương vụ thành `CONFIRMED`. Chuyển trạng thái cần evidence ID và audit trail. `confidence`, nếu dùng nội bộ, phải mô tả căn cứ; không trình bày như xác suất thương vụ sẽ thành công.

## 8. Reliability classification và citations

Tách ba khái niệm: `sourceReliabilityScore` (0–100, đánh giá nguồn), `reliabilityClass` (nhãn xuất bản) và `rumorStatus/transferStatus` (trạng thái claim). Độ uy tín nguồn không phải xác suất tin là thật; số bài cùng chép một nguồn không phải nhiều xác nhận độc lập.

| Class | Quy tắc |
| --- | --- |
| `OFFICIAL` | Nguồn chính thức phát biểu về vấn đề thuộc thẩm quyền của mình |
| `RELIABLE` | Reporting từ nguồn được biên tập đánh giá đáng tin; vẫn giữ từ ngữ chưa chắc chắn |
| `SOCIAL` | Thảo luận/ý kiến cộng đồng, không dùng xác nhận sự kiện |
| `RUMOR` | Claim chưa được xác nhận; luôn gắn nhãn Tin đồn |

Source registry lưu category, domain, external identity/channel ID, score, rationale, reviewer, reviewedAt, enabled và quyền truy cập. Điểm ví dụ từ trao đổi gốc (official 100, Reuters 98, BBC 95, Sky/The Athletic 93, Marca 85, AS 82, unknown 30) chỉ là cấu hình khởi đầu để review, không phải chứng nhận tuyệt đối hay đánh giá tự động. Admin override phải có lý do và audit log.

Mỗi card/story/BriefItem có source link truy cập được từ UI. Source drawer gồm publication, original title, publishedAt, collectedAt, language, canonical URL, thời điểm cập nhật, reliability và nhãn AI summary. Mỗi factual claim trong nội dung AI cần ánh xạ tới source record hoặc match field; không chỉ gắn một nguồn chung không liên quan ở cuối bài. Sources đã mất phải giữ provenance phù hợp quyền lưu trữ và báo trạng thái liên kết; không tự bịa URL thay thế.

Quote lưu nguyên văn, bản dịch và source ID/vị trí bằng chứng. Bản dịch không được biến diễn giải thành lời trích dẫn trực tiếp. Cluster có nguồn mâu thuẫn phải thể hiện khác biệt, không gộp thành một fact chắc chắn.

## 9. YouTube highlights hợp lệ

VideoProvider sử dụng YouTube API hoặc đường truy cập được phép. Search theo đội, giải, ngày và highlights chỉ tạo candidate. Validation đối chiếu đúng trận, ngày/mùa giải, channel ID trong allowlist, publisher được phép, availability và embed eligibility.

Ưu tiên league official → club official → broadcaster có quyền phù hợp → trusted channel được review. Verified badge hoặc title trùng tên trận không đủ chứng minh quyền. Không tự động embed re-upload chưa xác minh; không tải/rehost video. Khi embed không khả dụng nhưng video được phép xem, cung cấp “Xem trên YouTube”; vùng bị hạn chế cần trạng thái phù hợp.

Lưu `youtubeVideoId`, title, channel ID/name, thumbnail, duration nếu có, URL, publishedAt, trustLevel, validationStatus/reason, checkedAt, matchId. UI hiển thị thumbnail, channel, thời lượng và CTA. Không có video hợp lệ: “Highlight chính thức chưa được tìm thấy.” Video bị gỡ phải được vô hiệu hóa khi kiểm tra lại.

## 10. Personalization, ranking và search

Mặc định chọn EPL và La Liga. User có thể follow/unfollow leagues, clubs, players; preferences lưu server, duy trì qua logout/login. Following lọc nội dung liên quan và tăng ưu tiên; không nâng độ tin cậy hoặc biến rumor thành confirmed. Khách đọc Brief chung.

MVP dùng Importance Score 0–100 có cấu hình/version: source reliability, recency, football significance và club relevance; khi có user thêm user relevance. Tất cả thành phần chuẩn hóa, recency suy giảm theo thời gian, tie-break ổn định theo thời gian/ID. Đảm bảo đa dạng giải/CLB/loại tin, giới hạn số story cùng cluster và không để popularity vượt publication gate.

Công thức định hướng mở rộng đã trao đổi: 30% reliability + 25% social attention + 20% club relevance + 15% recency + 10% user preference. Chỉ áp dụng khi các tín hiệu đã có; MVP có profile trọng số riêng được chuẩn hóa về 100%, không giả lập social score. Lưu component scores để giải thích/debug. Ranking không đại diện độ đúng của story.

Global search cho club/player/match/news, thêm topic sau; MVP dùng PostgreSQL Full Text Search, pagination và xử lý tên có/không dấu. Typesense/Elasticsearch chỉ bổ sung khi nhu cầu chứng minh cần.

## 11. Fan Pulse và Trending — sau core MVP

SocialProvider đầu tiên là Reddit qua API/quyền truy cập phù hợp; candidate communities gồm r/soccer và cộng đồng CLB. X, YouTube comments và public communities khác thuộc phase sau. Không lấy dữ liệu riêng tư hoặc vượt quyền truy cập.

Pipeline: posts/comments → entity mapping → deduplication/spam filtering → topic clustering → sentiment → aggregate. Không chỉ chọn bài nhiều likes; giới hạn ảnh hưởng một tài khoản/thread, giữ sample window, sample size, source/community và phương pháp tính.

Fan Pulse theo club/player/match/topic gồm top discussions, mentions, sentiment, velocity và engagement. Trending chọn 5–10 chủ đề tăng nhanh trong 12–24 giờ so với baseline được ghi rõ. Phần trăm topic và sentiment phải có mẫu số, cách tính, ngưỡng mẫu tối thiểu cấu hình và làm tròn nhất quán. Mẫu thiếu thì không hiện tỷ lệ; không tạo số minh họa trong production.

Luôn ghi: “Dựa trên các thảo luận công khai được hệ thống thu thập.” Đây là mẫu cộng đồng đã thu thập, không đại diện toàn bộ fan; sentiment không xác thực sự kiện. Có source links, thời gian phân tích, xử lý nội dung độc hại và cơ chế xóa theo điều kiện nguồn. Social opinion không vào fact pipeline để xác nhận injury/transfer/quote.

## 12. Data sources và provider abstraction

Match: chọn football data API hỗ trợ EPL/La Liga, fixtures/results, teams và events; stats/lineups tùy entitlement. News: ưu tiên API/RSS/official feeds; bắt đầu 3–5 nguồn ổn định. Candidate sources: Premier League, La Liga, club sites, BBC Sport, Sky Sports, Reuters, Guardian, ESPN, The Athletic, Marca, AS, Mundo Deportivo. Danh sách không có nghĩa các nguồn đều có API miễn phí hoặc đã được cấp quyền.

Trước tích hợp xác minh coverage, freshness, quota, chi phí, quyền lưu/trình bày nội dung, attribution và quyền ảnh/logo. Không vượt paywall hoặc dùng scraping khi không được phép. Provider chưa cấu hình thì trả unavailable, không thay bằng fake production data.

| Interface | Trách nhiệm |
| --- | --- |
| `MatchProvider` | `getCompetitions`, `getMatches`, `getMatch`, `getMatchEvents`, `getMatchStats` |
| `NewsProvider` | `fetchLatestArticles` có cursor, provenance và timestamps |
| `VideoProvider` | `searchMatchHighlights`, validation metadata |
| `AIProvider` | translate/summarize/classify/extract theo schema có version |
| `SocialProvider` | thu thập public discussions và metadata, chỉ kích hoạt Phase 2 |

Adapters chuyển external IDs/statuses về domain model nội bộ. Services không phụ thuộc raw vendor response. Provider capabilities mô tả field nào hỗ trợ. Mọi call server-side, timeout, retry/backoff có jitter cho lỗi tạm thời, tôn trọng rate limit, circuit breaker/fallback khi phù hợp. Lưu sync cursor/checkpoint, provider status và data freshness. Không gọi API có secret từ browser.

## 13. Database entities và invariants

PostgreSQL + Prisma; thời gian UTC, ID nội bộ ổn định, external identity riêng theo provider. Raw payload chỉ lưu theo quyền và thời hạn cần thiết. Các quan hệ nhiều-nhiều dùng join models, không chỉ lưu danh sách ID không có ràng buộc.

| Entity | Dữ liệu và quan hệ chính |
| --- | --- |
| `User` | auth identity, role, locale, timezone, timestamps |
| `League`, `Season`, `Club`, `Player` | domain identities, tên/alias, external IDs, quan hệ giải/CLB theo thời điểm |
| `Match` | league/season/round, home/away club, kickoff, status, score components, venue, provider, updatedAt |
| `MatchEvent`, `MatchStat` | match, player/club, event time/type hoặc metric/value, provenance |
| `NewsSource` | source registry, access policy, reliability config, enabled |
| `Article` | sourceId, sourceUrl/canonicalUrl, titleOriginal, contentOriginal hoặc excerpt được phép, language, titleVi, summaryVi, publishedAt, collectedAt, storyType, rumorStatus, reliabilityClass/score, clusterId, embedding tùy chọn, processingStatus |
| `ArticleCluster`, `ArticleEntity` | story group, representative article, entity links tới club/player/match/league, merge history |
| `ClaimEvidence`, `Quote`, `AIProcessingRun` | claim/source mapping, original/translated quote, model/prompt/schema versions, input IDs/hash, validation outcome |
| `Transfer`, `TransferUpdate` | player, current/target club, status, evidence và status history |
| `Video` | YouTube metadata, trust/validation status, match/source association |
| `DailyBrief`, `BriefItem` | date, locale, status, window/cutoff, generatedAt/publishedAt, revision; section, order, entity/source references |
| `UserPreference`, `UserFollow` | league preferences, club/player/league follows, notification opt-in |
| `Notification`, `PushSubscription` | channel, brief/user, delivery status, dedupe key, consent; bật khi có capability |
| `JobRun`, `ProviderStatus` | job name/key, start/end, status, attempts, counts, error, checkpoint/freshness |
| `AdminAuditLog` | actor, action, target, before/after, reason, timestamp |
| `SocialPost`, `SocialTopic` | Phase 2: source identity/URL, community, entity mapping, topic/sample metrics/window |

Unique constraints: provider + externalId; canonical source URL; user + follow target; DailyBrief date + locale (một identity, revision riêng); job logical key; notification user + brief revision/channel theo chính sách gửi. Upsert idempotent; transaction cho publish và status transitions. Index theo kickoff, publishedAt, league/entity IDs, clusterId, processingStatus và brief date. Không xóa provenance đang được nội dung published tham chiếu; dùng trạng thái ẩn/retention policy phù hợp.

## 14. Pipeline, scheduler và vận hành

Luồng core: fetch → normalize/store → AI extraction/classification/translation/summary → reliability validation → deduplication → ranking → Brief generation → publication validation → publish. Bước nào fail lưu trạng thái, retry có giới hạn; không đánh dấu publishable trước khi gate hoàn tất.

Lịch baseline hợp nhất các mốc đã trao đổi, theo `Asia/Bangkok`:

| Giờ | Job |
| --- | --- |
| 00:00–06:00 | Incremental collection theo quota; live scores có interval cấu hình |
| 05:30 | Match reconciliation |
| 06:00 | Full news/official feed aggregation |
| 06:20 | AI article processing và reliability validation |
| 06:40 | Deduplication/cluster reconciliation |
| 07:00 | Cutoff snapshot và ranking |
| 07:15 | Generate DailyBrief |
| 07:30 | Validate; chuyển READY hoặc NEEDS_REVIEW |
| 08:00 | Publish READY, sau đó gửi notification nếu bật |

Các giờ chỉ là trigger dự kiến; dependencies phải kiểm tra completion/checkpoint, không chỉ chờ đồng hồ. Cutoff snapshot chứa đầu vào đã sẵn sàng; tin đến muộn sang update/revision hoặc bản tiếp theo. Scheduler dùng IANA timezone, lưu run timestamps UTC. Có distributed lock/lease, idempotency key, bounded retry, dead-letter/failed queue, manual rerun, lịch sử run và cảnh báo trước giờ publish khi pipeline không sẵn sàng.

JobRun ghi `jobName`, logical date/key, startedAt, finishedAt, status, attempts, recordsProcessed, error an toàn và correlation ID. Chạy lại hoặc hai worker đồng thời không tạo duplicate Brief hoặc gửi trùng notification. Không chạy scheduler quan trọng chỉ trong process dev/web dễ bị suspend.

## 15. AI safeguards và publication gates

AI chỉ xử lý dữ liệu đã thu thập, không làm nguồn dữ liệu và không tự search Internet ở bước Brief generation. Không tự tạo score, player stats, injury, quote, transfer, club statement hoặc URL. Bản dịch giữ sắc thái `could`, `may`, `reportedly`, `interested`; không chuyển “được cho là” thành “đã xác nhận”.

Đầu vào source là untrusted data; không thực thi chỉ dẫn được chèn trong bài báo. Structured output có schema validation, entity consistency, numeric checks và evidence mapping. Kiểm tra unsupported claims; thiếu evidence, sai quote, nguồn mâu thuẫn hoặc output lỗi → NEEDS_REVIEW/FAILED, không publish. Admin review không thay thế yêu cầu phải có evidence.

Tách factual match fields từ provider khỏi prose AI; kiểm chứng số liệu với input, không dùng một model gọi lại làm bằng chứng duy nhất. Lưu model/prompt/schema versions, input references/hash, output version và kết quả gate. Reprocess không ghi đè manual override hoặc published revision ngoài quy trình. Có cost budget, token limit, timeout và giới hạn concurrency; lỗi AI không làm sai dữ liệu gốc.

## 16. UX, routes, PWA và notifications

Giao diện mobile-first, card-based, scorecard rõ, typography dễ đọc, ít clutter, dark/light mode khi triển khai phù hợp. Nội dung thể hiện identity riêng. Home gồm date, Morning Summary, Top Story, Last Night, Player Spotlight, Transfer Watch, Coming Up, Latest; section Phase 2 nằm sau feature flag.

Routes chuẩn: `/`, `/matches`, `/match/[slug]`, `/news`, `/news/[slug]`, `/transfers`, `/club/[slug]`, `/player/[slug]`, `/following`, `/search`, `/admin`; Phase 2 thêm `/fan-pulse`. Dùng một quy ước route nhất quán; alias plural nếu cần phải redirect canonical, tránh duplicate SEO pages.

Desktop nav: Morning, Matches, News, Transfers, Following, Search; thêm Fan Pulse khi bật. Mobile bottom nav: Home, Matches, Transfers, Following, Search. Có loading/empty/error/stale states, keyboard navigation, contrast tốt, ảnh alt text, text co giãn; kiểm tra từ viewport 360px.

PWA: manifest, icons, HTTPS, service worker, offline shell, Add to Home Screen. Offline cache chỉ nội dung public đã đọc; ghi rõ thời điểm dữ liệu. Không cache auth/admin/private API như public. Logout xóa cache cá nhân phù hợp. Live score cache baseline 5–10 phút theo quota và ghi stale; news 10–20 phút; historical 24 giờ hoặc lâu hơn; DailyBrief theo ngày/revision và invalidate khi sửa/ẩn. Các TTL cấu hình được, không thay cho kiểm tra freshness.

Notification MVP tùy capability: “Morning Brief của bạn đã sẵn sàng.” Chỉ gửi sau PUBLISHED, opt-in rõ ràng, unsubscribe, không gửi trùng. Phase 2 thêm preferences Official only/Major News/Transfers/Match và email digest 08:00 gồm trích yếu + CTA, không cần toàn văn. Không tự bật quyền push hoặc gửi breaking hàng loạt.

## 17. Admin

`/admin` cần server-side role authorization. Dashboard có provider health, quota/freshness, ingestion, AI processing, YouTube, scheduler và failed jobs với trạng thái Healthy/Warning/Error.

Admin quản lý sources/reliability, news, clusters, clubs/players/matches, highlights, AI outputs, users và jobs. Có hide/unhide article, đổi classification/reliability kèm lý do, sửa headline, feature story, merge/unmerge cluster, disable source và rerun job. Hide/disable phải loại nội dung khỏi feed và Brief/caches liên quan theo chính sách sửa, giữ audit/provenance. Override confirmed vẫn phải có evidence hợp lệ.

## 18. Architecture và deployment principles

Stack: Next.js, TypeScript, Tailwind CSS, PostgreSQL, Prisma. Next.js server/API hoặc Node-compatible service layer; background worker riêng cho jobs dài. Redis là tùy chọn cho queue/cache/lock khi cần; không mặc định bắt buộc cho local MVP.

```text
/app                 # routes, server/API entrypoints
/components          # UI
/lib                 # config, logger, DB, auth
/types               # domain contracts
/providers           # matches, news, videos, ai, social adapters
/services            # matches, articles, briefs, ranking, clustering,
                     # reliability, transfers
/jobs                # ingestion, processing, generation, publication
/prisma              # schema, migrations, development seed
```

Browser → internal API/server → services → database; workers dùng services/providers. Không hard-code API vendor/model trong business logic. Unit/contract tests kiểm tra adapter mapping; fixtures/mock chỉ local/test, production thiếu dữ liệu trả trạng thái thật.

Tách local/staging/production, credentials và DB riêng. `.env.example` chỉ tên biến; secrets giữ ở secret manager/env server, không `NEXT_PUBLIC_*`. Deploy dùng CI build/lint/typecheck/tests, migrations có backup/roll-forward strategy và tương thích version, health/readiness checks, HTTPS, connection pooling phù hợp hosting và worker/scheduler bền vững. Không thực hiện production migration phá dữ liệu tự động khi chưa có kế hoạch phục hồi.

Logs/metrics/traces có correlation ID; không ghi secrets/token hoặc nội dung nhạy cảm. Giới hạn request, sanitize rich text, chống SSRF ở fetch URL, kiểm tra auth/ownership/admin, cookie/session an toàn và backups có restore drill. Theo dõi quota/cost, latency, queue lag, failed jobs và on-time publication; có rollback app/feature flags và runbook xử lý provider outage. Không phụ thuộc provider lỗi làm crash toàn hệ thống; fallback không làm người dùng tưởng dữ liệu stale là mới.

SEO cho public club/player/match/story pages: canonical metadata, sitemap theo nội dung published, không index dashboard cá nhân/admin. Theo dõi DAU, Brief opens/completion, Article CTR, Highlight CTR, follows, session duration, next-morning return và notification opens nếu bật; không thu thập dữ liệu vượt nhu cầu.

## 19. KPI và acceptance criteria

North Star: **Morning Brief Weekly Active Readers**. Đo tỷ lệ mở Brief ít nhất 3 ngày/tuần, thời gian đọc, return next morning, follow conversion và highlight CTR. Chưa có target tăng trưởng bằng số được chốt; thiết lập baseline sau beta, không dùng số giả để tuyên bố thành công.

MVP được nghiệm thu khi:

1. Responsive web/PWA hoạt động trên mobile và desktop; luồng đọc chính hoàn tất trong 5–10 phút qua usability review.
2. Results EPL/La Liga và match detail lấy từ dữ liệu thật, có provenance/freshness; states hoãn/hủy/thiếu dữ liệu chính xác.
3. News CLB/cầu thủ/off-field có chọn lọc và transfers hiển thị tiếng Việt với citations/reliability; tên riêng không cần dịch.
4. Không story published nào thiếu source/evidence; rumor không trở thành confirmed khi thiếu xác nhận phù hợp.
5. Highlights chỉ dùng nguồn đã validate; thiếu video có fallback rõ ràng.
6. Không duplicate story rõ ràng trên Home; cluster có source drawer và xử lý mâu thuẫn.
7. Brief tự tạo, validate và publish 08:00 UTC+7; idempotent khi rerun/concurrent run; có no-match/failure behavior.
8. User follow/unfollow CLB/cầu thủ/giải, preferences duy trì qua login và được bảo vệ theo user.
9. Admin sửa/ẩn bài, quản lý sources, xem lỗi/rerun jobs; audit log và cache invalidation hoạt động.
10. Build/lint/typecheck và tests nghiệp vụ quan trọng pass; không có blocker về security/data correctness; staging dùng real provider thành công.
11. Release rehearsal có ít nhất hai ngày Brief liên tiếp, gồm kiểm tra rerun, no-match và provider/AI outage bằng scenario kiểm soát; runbook/backup/rollback sẵn sàng. Đây là gate kỹ thuật đề xuất cụ thể hóa yêu cầu “core ổn định”.

Fan Pulse chỉ nghiệm thu riêng sau core release: có nguồn/mẫu/cửa sổ/cách tính minh bạch, số liệu tính từ dữ liệu thật, không social opinion nào được trình bày thành fact. Chi tiết các gate và thứ tự thực hiện nằm trong `CODEX_PLAN.md`.
