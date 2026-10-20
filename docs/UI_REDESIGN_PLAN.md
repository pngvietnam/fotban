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
