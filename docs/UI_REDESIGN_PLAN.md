# Kế hoạch áp giao diện prototype FOTBAN

Nguồn: `fotban_prototype/` (React + Vite, CSS thuần + Tailwind v4), design system `fotban_prototype/fotban-design-system/`, ảnh chụp `fotban_prototype/fotban-screenshots/` (19 trang × desktop 1440 / mobile 390).
Nguyên tắc bàn giao: giữ nguyên thiết kế, spacing, typography, responsive, luồng điều hướng; thay dữ liệu mẫu bằng dữ liệu thật; không biến dữ liệu mẫu thành tin, kết quả hay chuyển nhượng thật; dữ liệu thiếu thì ẩn hoặc ghi rõ, không điền 0.

## 1. Hiện trạng prototype

- **Khung chung:** sidebar trái 236px (logo fotban., 5 mục chính, Bảng tin của tôi, Tin đã lưu, Đội bóng của tôi, thẻ mời theo dõi); topbar (khẩu hiệu "Không chỉ tỷ số. Cả câu chuyện.", giờ VN, chuông, nút Đăng nhập); mobile: thanh điều hướng dưới đáy 5 mục.
- **Nhận diện:** Be Vietnam Pro; Pitch Green `#126344`, Stadium Green `#103D2E`, Electric Lime `#D2ED79`; nền `#F7F8FA`; màu nhấn coral/navy/ivory/plum cho thẻ khám phá; màu trạng thái success/info/warning có chữ đi kèm.
- **Mã:** router hash, dữ liệu mock nằm trong component, CSS class ngữ nghĩa (`.sidebar`, `.md-*`, `.tm-*`…) ~150 KB, một số dòng rất dài. Design system có `tokens.css/json` và vài primitive (DSText, DSButton, DSCard, DSBadge…).
- **Tài sản ngoài:** ảnh Unsplash (minh hoạ), logo api-sports, video YouTube quốc tế (chung kết C1 cũ) → không dùng nguyên trạng.

## 2. Đối chiếu trang ↔ FotBan ↔ dữ liệu thật

| # | Trang prototype | Route FotBan | Dữ liệu thật | Ghi chú |
|---|---|---|---|---|
| 1 | Bảng tin | `/` | Có: trận hôm nay, highlight, tin xếp hạng, Nắm nhanh, BXH, chuyển nhượng (thẻ tin) | Khối biên tập ("Lướt một chút", "Đọc sâu hơn", "Chiếc áo đầu tiên"), bình chọn khán đài: chưa có nguồn |
| 2 | Trận đấu | `/matches` | Có đủ | Prototype là dòng thời gian cuộn (xem trận trước / xem thêm trận sắp tới), thay dải 7 ngày vừa làm. Có tab Ligue 1 |
| 3 | Tin tức (feed) | `/news` | Có: thẻ tin báo chí | Prototype là feed mạng xã hội (Đồng cảm/Bình luận/Chia sẻ, Fan nói gì, Thảo luận) |
| 4 | Chuyển nhượng | `/transfers` | Một phần: tin chuyển nhượng có cầu thủ, CLB nhắc tới, giai đoạn theo cách báo viết | Chưa có phí chuyển nhượng, chưa có CLB đi/đến có cấu trúc |
| 5 | Danh sách giải | (mới) `/leagues` | Có 3 giải | Prototype 4 giải (có Ligue 1) |
| 6 | Chi tiết giải | `/league/[slug]` | Có đủ | |
| 7 | Chi tiết CLB | `/club/[slug]` | Có đủ | |
| 8 | Chi tiết cầu thủ | `/player/[slug]` | Có | |
| 9 | Chi tiết tin | `/news/[slug]` | Tiêu đề + mô tả + link báo gốc | Prototype có thân bài biên tập và ô bình luận: không làm |
| 10 | Chi tiết trận | `/match/[slug]` | FotBan đầy đủ hơn prototype (6 tab dữ liệu thật) | Chỉ áp phong cách (hero xanh đậm), giữ nội dung |
| 11 | Chi tiết chuyển nhượng | `/transfers/[slug]` | Một phần | |
| 12 | Quản lý theo dõi | `/following` | Có (theo dõi lưu DB, cần đăng nhập) | Prototype cho khách theo dõi bằng localStorage |
| 13 | Tin đã lưu | (mới) `/saved` | Chưa có tính năng | |
| 14–15 | Tài khoản, Đăng nhập | `/account`, `/login` | Có (Google) | |
| 16–19 | Giới thiệu, Điều khoản, Ghi công ảnh, Quy tắc cộng đồng | `/ghi-cong-anh` có; còn lại mới | Nội dung tĩnh | Quy tắc cộng đồng chỉ cần nếu có cộng đồng |

## 3. Cách làm kỹ thuật

1. **Nền tảng:** đưa `tokens.css` và CSS prototype vào FotBan (thư mục `styles/fotban/`, import toàn cục); Be Vietnam Pro qua `next/font/google` (tự host, đủ weight 400–800, có tiếng Việt); giữ Tailwind cho phần chưa chuyển.
2. **Khung mới `AppShell`:** sidebar + topbar + thanh điều hướng mobile, thay `SportsShell` cho mọi trang trong một lần (tránh hai giao diện song song). "Đội bóng của tôi" trong sidebar lấy từ theo dõi thật.
3. **Từng trang:** dựng lại bằng server component, dùng đúng markup/class của prototype, đổ dữ liệu thật; tương tác (tab, carousel, lưu tin) là client component nhỏ.
4. **Bỏ** các nhãn "Bản xem trước / dữ liệu minh họa" của prototype vì dữ liệu đã thật; **giữ** nhãn trung thực (giai đoạn chuyển nhượng theo cách báo viết, "chưa có dữ liệu").
5. **Ảnh:** chỉ ảnh của báo (đã được phép), logo CLB football-data, ảnh cầu thủ Wikimedia, thumbnail YouTube của video thật. Không dùng Unsplash/api-sports.
6. **Kiểm chứng mỗi phase:** typecheck, lint, test, chụp desktop 1440 + mobile 390 đặt cạnh ảnh prototype, rồi xin duyệt trước khi commit phase sau.

## 4. Các phase

| Phase | Nội dung | Kết quả để duyệt |
|---|---|---|
| P0 | Token, font, CSS nền, AppShell (sidebar/topbar/bottom nav), đổi tên thương hiệu "Football Morning Brief" → "fotban" | Mọi trang mang khung mới |
| P1 | Trận đấu (dòng thời gian, tab giải, cột phải: trận tâm điểm, BXH, "Bỏ lỡ trận? Xem lại") + hero chi tiết trận | `/matches`, `/match/*` |
| P2 | Bảng tin: Trên sân cỏ, FOTBAN PLAY (highlight thật), 90 giây bắt nhịp, Tâm điểm, Vừa cập nhật, sidebar Đội bóng của tôi + BXH, Chuyển động thị trường | `/` |
| P3 | Tin tức feed (thẻ tin báo chí theo kiểu bài đăng) + chi tiết tin | `/news`, `/news/*` |
| P4 | Danh sách giải (mới), chi tiết giải, CLB, cầu thủ | `/leagues`, `/league/*`, `/club/*`, `/player/*` |
| P5 | Chuyển nhượng + chi tiết | `/transfers*` |
| P6 | Theo dõi, Tin đã lưu (mới), Tài khoản, Đăng nhập, Giới thiệu, Điều khoản, Ghi công ảnh | còn lại |

## 5. Quyết định của chủ sản phẩm (2026-10-20)

1. **Tương tác:** bỏ Bình luận, Bình chọn, "Góp một góc nhìn", "Đồng cảm" dạng cảm xúc; **giữ Like và Chia sẻ**. Like: khách lưu trên trình duyệt, người đăng nhập lưu vào tài khoản; chỉ hiện số lượt khi đếm từ dữ liệu thật.
2. **Ligue 1:** thêm như Champions League (trận, BXH, CLB, cầu thủ, tin). Highlight chỉ khi có kênh bản quyền Việt Nam được duyệt.
3. **Tin đã lưu & theo dõi cho khách:** lưu trên trình duyệt; khi đăng nhập thì đồng bộ vào tài khoản.
4. **Khối biên tập không có nguồn:** lấp bằng tin thật theo loại (phân tích, ngoài lề…), ẩn khi trống; bỏ bình chọn.
5. **Bảng chuyển nhượng:** giữ bảng, ẩn cột phí, trạng thái theo cách báo đưa tin. Nguồn phí tìm sau.
6. **Trận đấu:** theo prototype, dòng thời gian cuộn ("Xem trận trước" / "Xem thêm trận sắp tới"), thay dải 7 ngày.
7. **Chuông thông báo:** ẩn cho tới khi có hệ thống thông báo.

## 6. Prototype v2 (2026-10-20, ba đợt chỉnh)

Nguồn: `fotban_prototype/v2/` (`fotban-source`, `fotban-screenshots` 22 trang, `fotban-design-system`). Token không đổi so với v1. Từ đây v2 là bản đích; v1 chỉ để tham khảo.

### 6.1 Thay đổi so với v1 và cách áp

| Thay đổi v2 | Áp vào FotBan |
|---|---|
| Cỡ chữ meta/caption lớn hơn, vùng chạm 44px (`ui-refinements.css`) | Áp vào shell P0 ngay và mọi phase sau |
| Nút "Của tôi" (menu: Bảng tin của tôi, Tin đã lưu, Quản lý theo dõi, Tài khoản, Đăng nhập); mobile ẩn nút Đăng nhập, chỉ còn "Của tôi" | Áp vào shell P0. Mục "Tin đã lưu" hiện khi P6 xong. Bỏ mục "Bàn giao" |
| Chuông thông báo | Vẫn ẩn (quyết định 7) |
| Footer sidebar: Về Fotban · Điều khoản · Ghi công ảnh · Cộng đồng · Design System · Bàn giao | Chỉ giữ link có trang thật; bỏ Design System, Bàn giao; "Cộng đồng" bỏ vì không có bình luận |
| Bảng tin: Trên sân cỏ → 3 điểm tin → Chuyện đáng chú ý → Vừa cập nhật (tab theo loại) → Khoảnh khắc (video) → khu khám phá (Lướt một chút, Chuyển động thị trường) | P2 theo đúng thứ tự. Video cũ ghi "Khoảnh khắc kinh điển" chỉ khi là video thật đã duyệt; "Khán đài đang nói gì" (bình chọn) bỏ |
| Trận đấu: tab giải (Tất cả/PL/La Liga/Ligue 1/C1), lọc trạng thái, "Đội theo dõi", chọn ngày, dòng thời gian theo ngày → giải → vòng, "Xem các trận trước đó"/"Xem thêm trận sắp tới"; cột phải: Trận tâm điểm, Cuộc đua BXH, Bỏ lỡ trận? Xem lại | P1. Quay lại lịch đấu giữ giải/ngày/vị trí cuộn (sessionStorage). "Đọc điểm tin" chỉ hiện khi có bài thật; "Chờ highlight hợp lệ" giữ nguyên ý |
| Chi tiết trận mở tab Dữ kiện; "← Quay lại lịch đấu"; hero xanh đậm | P1: chỉ đổi hero và nút quay lại, giữ 6 tab dữ liệu thật đã có (giàu hơn prototype) |
| Tin tức: 3 tab Dành cho bạn / Mới nhất / Sôi nổi; bộ lọc Loại tin + Giải đấu; khối "Nguồn & ngữ cảnh" thay dấu tick; "Dành cho bạn" lọc theo theo dõi | P3. "Sôi nổi" = cụm tin nhiều báo đưa nhất trong 24 giờ (dữ liệu thật). "Nguồn & ngữ cảnh" = tên báo, giờ đăng, link bài gốc. Thẻ "Phân tích": chỉ mô tả của báo, không tự viết "Ba điểm để hiểu nhanh". "Fan nói gì": chỉ khi nguồn là cộng đồng thật, nếu không thì ẩn. Không có Bình luận; giữ Like/Chia sẻ, số like chỉ hiện khi đếm thật |
| Bảng tin của tôi (`/following`): lọc theo CLB/giải/cầu thủ đang theo dõi, cột "Cuộc hẹn tiếp theo"; không mặc định Arsenal | P6 (có thể kéo lên sau P3 vì dùng chung thẻ tin) |
| Quản lý theo dõi tách riêng (`/following/manage`): ô tìm, danh sách CLB/giải/cầu thủ với nút Theo dõi | P6. Khách lưu localStorage, đăng nhập thì đồng bộ (quyết định 3) |
| Trang CLB/giải/cầu thủ chỉ hiện nội dung liên quan + trạng thái trống; nút BXH mở đúng giải và tab BXH | P4 |
| Chuyển nhượng: bảng CLB đi → đến, phí, trạng thái; chi tiết: CLB đi/đến, phí, phụ phí, hợp đồng, nguồn & bằng chứng | P5. Bảng `Transfer` hiện trống: trang dựng từ tin báo. Hiện CLB đi–đến khi báo nêu rõ và đối chiếu được với CLB trong DB, nếu không ghi "chưa rõ". Ẩn phí, phụ phí, hợp đồng (quyết định 5). "Những cái tên đáng chú ý" chỉ dùng cầu thủ có tin thật |
| Trang Design System, Bàn giao | Không làm (công cụ nội bộ của prototype) |

### 6.2 Thứ tự làm

1. **P0b** – cập nhật shell theo v2: menu "Của tôi", cỡ chữ/vùng chạm, footer sidebar, mobile chỉ còn "Của tôi".
2. **P1** – Trận đấu (dòng thời gian) + hero chi tiết trận.
3. **P2** Bảng tin → **P3** Tin tức → **P4** Giải/CLB/cầu thủ/Ligue 1 → **P5** Chuyển nhượng → **P6** Bảng tin của tôi, Quản lý theo dõi, Tin đã lưu, tài khoản, trang tĩnh.

Mỗi phase: typecheck, lint, test, ảnh 1440/390 đặt cạnh `fotban_prototype/v2/fotban-screenshots`, chờ duyệt.

## 7. Nguồn dữ liệu cho phần prototype chưa có dữ liệu thật (đề xuất 2026-10-20)

| Phần prototype | Nguồn / phương án | Trạng thái kiểm chứng | Chi phí, giới hạn |
|---|---|---|---|
| Chuyển nhượng đã xong: CLB đi → đến, phí, loại (mua đứt/cho mượn/hết hạn mượn), ngày, mùa | Highlightly `GET /players/{id}` → `transfers[]` (`from`, `to`, `fee` dạng "€69.87M", `type`, `transferDate`, `season`) | Đã gọi thử (Gyökeres: Sporting → Arsenal, €69.87M, 26/07/2025). Gói BASIC trả "All data available" | Dùng chung 100 lượt/ngày với chi tiết trận. Id cầu thủ Highlightly đã có trong đội hình đã lưu (`externalId`), nên 1 lượt/cầu thủ |
| Tin đồn chuyển nhượng (CLB quan tâm, ngày) | Cùng endpoint → `rumours.current[]` (`club`, `rumourDate`; `transferProbability` thường "N/A") | Đã thấy dữ liệu | Như trên. Ghép với tin báo Việt Nam để có trạng thái theo cách báo đưa |
| Giá trị cầu thủ, hợp đồng đến, ngày gia nhập | `marketValue[]`, `profile.club.contractExpiry`, `joinedAt` | Đã thấy | Như trên |
| Chấn thương / vắng mặt (trang CLB, cầu thủ, trận) | `injuries[]` (lý do, từ–đến, số trận vắng) | Đã thấy | Như trên |
| Phong độ 5 trận, trận tâm điểm | Tính từ dữ liệu trận đã có trong DB; dự phòng Highlightly `/last-five-games` | Có sẵn | 0 |
| Ligue 1: lịch, tỉ số, BXH, đội hình CLB | football-data.org (FL1 nằm trong gói miễn phí) + Highlightly cho sự kiện/đội hình/thống kê | football-data đã dùng cho 3 giải; cần thêm mã FL1 | Thêm ~10 trận/tuần vào hạn mức Highlightly |
| Video Ligue 1 | Bản quyền tại Việt Nam: VTVcab (độc quyền từ mùa 2025–26). Kênh VTVcab **On Champions League** (`@OnChampionsLeague`, `UCbdlxg0t8O7WGPrFsVcz6Gg`) đăng highlight Ligue 1 dạng "Highlights LYON vs NICE \| … \| Ligue 1 26/27" qua RSS không cần key. Kênh `@OnSportschannel` (`UCIWo7q6irZUBaoPOrlf5IVw`) chủ yếu là bình luận, bóng chuyền: không dùng | Đã đọc RSS 20/10/2026: 4 highlight Ligue 1 trong 15 bản mới nhất; oEmbed 200 (nhúng được) | 0. Làm cùng lúc thêm Ligue 1 (P4) |
| "Khoảnh khắc kinh điển" / video cũ hơn 15 bản gần nhất | Không dùng API key (chủ sản phẩm chọn miễn phí hoàn toàn, chưa tạo key). Worker lưu mọi video RSS mỗi 20 phút từ 19/10/2026, nên kho video tự dày lên theo thời gian. Video đăng trước 19/10/2026 mà đã rơi khỏi 15 bản mới nhất thì không lấy được. Nếu sau này cần: YouTube Data API v3 (`playlistItems.list`, 1 đơn vị/lượt, 10.000 đơn vị/ngày, miễn phí, không cần thẻ) | — | 0 |
| "Sôi nổi" (tin tức), "Đang nóng" | Tự tính: số báo cùng đưa một cụm tin trong 24h + lượt Like thật của FotBan | Dữ liệu cụm tin đã có | 0 |
| "Ba điểm để hiểu nhanh" (phân tích) | Không viết lại bài báo. Với bài gắn trận: tạo 3 điểm từ số liệu trận (kiểm soát bóng, cú sút, xG, cầu thủ điểm cao). Bài khác: chỉ hiện mô tả của báo | Số liệu trận đã có | 0 |
| "Fan nói gì", "Khán đài đang nói gì" | Không có API cộng đồng tiếng Việt hợp lệ (Facebook/diễn đàn không mở; Reddit API cần duyệt thương mại). Ẩn cho tới khi FotBan có tính năng cộng đồng riêng | — | — |
| Chuông thông báo | Web Push (chuẩn trình duyệt, khoá VAPID tự tạo) kích hoạt từ dữ liệu sẵn có: trận đội theo dõi sắp đá, kết quả, tin chuyển nhượng mới | Chưa làm | 0, nhưng là tính năng riêng, làm sau P6 |
| Số áo cầu thủ ("Những cái tên đáng chú ý") | Highlightly lineups (`number`) đã lưu | Có sẵn | 0 |

**Tiêu chí (chủ sản phẩm, 2026-10-20): miễn phí hoàn toàn.** Không nâng gói trả phí.

**Hạn mức Highlightly (gói miễn phí, 100 lượt/ngày, worker dùng tối đa 90):** chia lại thành chi tiết trận 70 lượt + hồ sơ cầu thủ 20 lượt. Hồ sơ cầu thủ ưu tiên cầu thủ có trong tin chuyển nhượng 48h qua, sau đó cầu thủ đội được theo dõi, rồi quay vòng làm mới mỗi 7 ngày (hơn 800 cầu thủ quay hết trong khoảng 6 tuần). Thêm Ligue 1 làm tăng nhu cầu chi tiết trận: ưu tiên trận đã kết thúc trong 48h và trận của đội được theo dõi; trận cũ hơn chỉ lấy khi còn dư lượt.

**Dự phòng miễn phí (chưa kiểm chứng):** API-Football gói miễn phí 100 lượt/ngày có endpoint `transfers`. Không dùng Sportmonks (trả phí). Không dùng Transfermarkt (không có API, không cào trang).

**Ghi nguồn:** dữ liệu chuyển nhượng, giá trị, chấn thương ghi "Dữ liệu: Highlightly". Trạng thái "Đã xác nhận" chỉ dùng cho chuyển nhượng đã có `transferDate` trong `transfers[]`; tin đồn và đàm phán vẫn theo cách báo đưa tin.
