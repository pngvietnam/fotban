# Codex Workflow — Football Morning Brief

## 1. Mục tiêu của workflow

Workflow này dùng để triển khai dự án theo từng milestone nhỏ, kiểm soát được chất lượng và tránh tình trạng Codex xây quá nhiều tính năng cùng lúc.

Ba file chính trong repo:

- `/PRODUCT_SPEC.md` — xác định **What / Why**
- `/CODEX_PLAN.md` — xác định **Roadmap / Milestones**
- `/CODEX_PROMPTS.md` — xác định **Prompt thực thi cho Codex**

Nguyên tắc cốt lõi:

> One milestone → validate → review → continue.

---

# 2. Quy trình chuẩn cho mỗi milestone

## Step 1 — Chọn đúng milestone

Mở `/CODEX_PROMPTS.md`.

Copy đúng prompt của milestone cần thực hiện.

Ví dụ:

`MILESTONE 3 — Match Provider`

Không gộp Milestone 3 + 4 + 5 trong cùng một yêu cầu.

---

## Step 2 — Cho Codex đọc source of truth

Mỗi phiên làm việc phải bắt đầu bằng việc Codex đọc:

- `/PRODUCT_SPEC.md`
- `/CODEX_PLAN.md`

Codex phải inspect repository hiện tại trước khi sửa code.

---

## Step 3 — Codex lập brief ngắn trước khi code

Codex phải trả lời ngắn:

- repo đang có gì;
- milestone hiện tại cần thay đổi gì;
- file/module dự kiến tác động.

Không cần lập kế hoạch dài.

Mục đích là phát hiện sớm việc Codex hiểu sai scope.

---

# 3. Quy tắc coding

Codex chỉ được triển khai milestone hiện tại.

Không tự ý:

- thêm tính năng tương lai;
- thay đổi product scope;
- đổi tech stack;
- hard-code API credentials;
- thêm fake production data;
- bỏ qua test để đi nhanh hơn.

Nếu milestone phụ thuộc API key chưa có:

Codex phải:

1. tạo provider abstraction;
2. thêm env variable;
3. hỗ trợ development fixture nếu cần;
4. không giả lập dữ liệu thành production data;
5. ghi rõ phần nào chưa thể verify production.

---

# 4. Validation bắt buộc

Sau mỗi milestone, Codex phải chạy:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Nếu project dùng command khác thì cập nhật README và giải thích.

Milestone không được coi là hoàn thành nếu:

- build fail;
- typecheck fail;
- test critical business rule fail;
- migration fail;
- secret bị commit;
- production path phụ thuộc mock data.

---

# 5. Báo cáo cuối milestone

Codex phải trả về:

## Status

- Completed
- Partially completed
- Blocked

## Files

- files created
- files changed

## Database

- migrations
- new models
- indexes
- constraints

## Environment

- env variables added
- API keys required

## Validation

- lint
- typecheck
- tests
- build

## Limitations

- known issues
- external dependencies
- production blockers

## Next

- recommended next milestone

---

# 6. Quyết định Go / No-Go

Sau mỗi milestone, người vận hành quyết định:

## GO

Đi tiếp nếu:

- acceptance criteria pass;
- tests pass;
- build pass;
- không còn blocker;
- code không phá milestone trước.

Sau đó chạy prompt milestone tiếp theo.

## NO-GO

Không đi tiếp nếu:

- build lỗi;
- integration chưa chạy;
- database migration lỗi;
- data model sai;
- business rule quan trọng chưa test;
- provider abstraction chưa rõ;
- Codex dùng mock trong production path.

Khi NO-GO, yêu cầu Codex:

> Fix only the issues preventing the current milestone from passing. Do not start the next milestone.

---

# 7. Workflow theo Sprint

## Sprint 1 — Foundation

Milestones:

1. Project Foundation
2. Data Model
3. Match Provider
4. Match UI

Exit criteria:

- app chạy local;
- PostgreSQL hoạt động;
- EPL + La Liga có match data;
- match list/detail render được.

---

## Sprint 2 — News Intelligence

Milestones:

5. News Ingestion
6. AI Processing Pipeline
7. Reliability Engine
8. News Deduplication
9. News UI

Exit criteria:

- news được ingest;
- nội dung hiển thị bằng tiếng Việt;
- có source;
- có reliability;
- duplicate được cluster.

---

## Sprint 3 — Football Content

Milestones:

10. Transfer Center
11. YouTube Highlights

Exit criteria:

- transfer rumor/confirmed phân biệt rõ;
- highlight ưu tiên nguồn hợp lệ.

---

## Sprint 4 — Core Product

Milestones:

12. Morning Brief Engine
13. Scheduler
14. Morning Homepage

Exit criteria quan trọng nhất:

08:00 người dùng mở app và đọc được một Morning Brief thật gồm:

- kết quả;
- highlight;
- top stories;
- player spotlight;
- transfer watch;
- source;
- reliability;
- nội dung tiếng Việt.

Nếu Sprint 4 chưa ổn:

Không bắt đầu Fan Pulse.

---

## Sprint 5 — Personalization

Milestones:

15. Authentication & Following
16. Admin Dashboard
17. PWA
18. Notifications

Exit criteria:

- user follow CLB/cầu thủ;
- admin kiểm soát nội dung;
- app installable;
- Morning Brief notification hoạt động.

---

## Sprint 6 — Production

Milestones:

19. Production Hardening
20. MVP Release Validation

Exit criteria:

- production build pass;
- security review;
- provider failure handling;
- mobile validation;
- deployment checklist hoàn chỉnh.

---

# 8. API decision gates

Có bốn điểm cần dừng để quyết định external provider.

## Gate A — Before Milestone 3

Chọn football data API.

Đánh giá:

- EPL support;
- La Liga support;
- live score;
- match stats;
- player stats;
- rate limits;
- pricing;
- commercial use.

Không để Codex tự quyết provider production nếu chưa review.

---

## Gate B — Before Milestone 5

Chốt news ingestion strategy.

Ưu tiên:

- official feeds;
- RSS;
- licensed news APIs;
- nguồn cho phép crawling phù hợp.

Review:

- ToS;
- copyright;
- article excerpt limits;
- API cost.

---

## Gate C — Before Milestone 6

Chốt AI provider/model.

Đánh giá:

- translation quality;
- Vietnamese summary;
- structured output;
- cost;
- latency;
- batch processing.

---

## Gate D — Before Milestone 11

Chốt YouTube Data API setup.

Review:

- quota;
- channel whitelist;
- official rights-holder validation.

---

# 9. Git workflow đề xuất

Mỗi milestone dùng một branch riêng.

Ví dụ:

```text
main
develop

feature/m1-foundation
feature/m2-data-model
feature/m3-match-provider
...
```

Workflow:

```text
create branch
↓
Codex implement
↓
tests
↓
review diff
↓
commit
↓
merge to develop
```

Không để Codex làm 5 milestone trên cùng một branch chưa review.

---

# 10. Commit convention

Khuyến nghị:

```text
feat(matches): add MatchProvider abstraction
feat(news): add article ingestion pipeline
feat(ai): add Vietnamese processing service
fix(brief): prevent duplicate daily brief
test(transfers): enforce rumor classification
docs: update environment setup
```

---

# 11. Review checklist trước khi merge

Kiểm tra:

- [ ] Scope đúng milestone
- [ ] Không có secret
- [ ] Không có production mock
- [ ] Build pass
- [ ] Typecheck pass
- [ ] Tests pass
- [ ] Migration review
- [ ] Env example updated
- [ ] README updated
- [ ] Error handling có fallback
- [ ] Không phá feature cũ

---

# 12. Khi Codex bị lệch scope

Dùng prompt:

```text
Stop.

Review `/PRODUCT_SPEC.md`, `/CODEX_PLAN.md`, and the current milestone in `/CODEX_PROMPTS.md`.

You have expanded beyond the current milestone.

Revert or isolate out-of-scope changes.

Complete only the current milestone and run the standard validation suite.

Do not start future milestones.
```

---

# 13. Khi build/test lỗi

Dùng prompt:

```text
Do not start any new feature.

Fix only the errors preventing the current milestone from passing.

Run:

- lint
- typecheck
- tests
- production build

Repeat until all critical checks pass.

Then report the root cause and files changed.
```

---

# 14. Khi cần refactor

Không refactor lớn giữa milestone nếu không cần.

Chỉ refactor khi:

- code duplication ảnh hưởng milestone hiện tại;
- architecture vi phạm provider abstraction;
- testability kém;
- security issue;
- performance blocker.

Refactor phải giữ behavior cũ.

---

# 15. Khi cần rollback

Nếu milestone mới phá milestone cũ:

1. xác định regression;
2. rollback phần gây lỗi;
3. giữ data migration an toàn;
4. fix;
5. chạy lại full validation;
6. chỉ merge khi regression hết.

---

# 16. Production deployment workflow

Sau Milestone 20:

```text
develop
↓
staging deploy
↓
smoke test
↓
scheduler test
↓
provider test
↓
mobile test
↓
admin test
↓
production approval
↓
main
↓
production deploy
```

Không deploy production trước khi:

- secrets được cấu hình;
- DB backup strategy có;
- scheduler timezone đúng;
- monitoring hoạt động;
- provider quota đủ.

---

# 17. Daily development routine

Mỗi phiên Codex:

```text
1. Pull latest code
2. Read milestone prompt
3. Inspect repo
4. Implement one milestone
5. Run validation
6. Review diff
7. Update docs
8. Commit
9. Merge only if GO
```

---

# 18. Critical product checkpoint

Checkpoint quan trọng nhất:

## Sau Milestone 14

Demo phải chứng minh được:

- dữ liệu thật;
- Morning Brief thật;
- nguồn thật;
- tiếng Việt;
- EPL + La Liga;
- highlight;
- transfers;
- reliability.

Nếu trải nghiệm này chưa tốt:

Không mở rộng social.

---

# 19. Sau MVP

Sau khi Milestone 20 stable:

## Phase 2

Fan Pulse với Reddit.

## Phase 3

Đánh giá riêng:

- X
- YouTube comments
- các nguồn social khác.

Mỗi nguồn phải review:

- API availability;
- cost;
- rate limits;
- licensing;
- moderation;
- privacy.

---

# 20. Prompt mở đầu chuẩn cho mỗi phiên Codex

```text
Read:

- `/PRODUCT_SPEC.md`
- `/CODEX_PLAN.md`
- `/CODEX_PROMPTS.md`

Inspect the current repository and git status.

Work only on the milestone I specify.

Do not expand scope.

Before coding, briefly summarize:

1. current repository state;
2. what this milestone requires;
3. files/modules you expect to change.

After implementation, run the standard validation suite.

Fix all blocking errors.

Update README and `.env.example` if necessary.

Report the milestone status and stop.

Do not start the next milestone automatically.
```

---

# 21. Definition of success

Workflow được coi là thành công khi:

- mỗi milestone có thể review riêng;
- không có feature lớn bị build bằng placeholder rồi bỏ dở;
- external provider được quyết định có chủ đích;
- app luôn build được sau mỗi milestone;
- Morning Brief end-to-end chạy được trước khi mở rộng social;
- production release có thể trace toàn bộ dữ liệu về nguồn ban đầu.
