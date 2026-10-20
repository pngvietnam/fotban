# FOTBAN — TÀI LIỆU THIẾT KẾ UI/UX

**Bàn giao cho Product Designer / UI Designer**  
Phiên bản: 1.0 · Ngày: 20/10/2026 · Ngôn ngữ sản phẩm: tiếng Việt

> Thiết kế một nơi giúp người hâm mộ nắm nhanh bóng đá Anh và Tây Ban Nha: chuyện gì vừa xảy ra, điều gì đáng chú ý, thông tin chắc chắn đến đâu và nguồn ở đâu.

## 1. Mục tiêu và phạm vi bàn giao

### 1.1. Designer cần giải quyết điều gì?

FotBan đã có nền tảng sản phẩm và các màn hình chính. Nhiệm vụ thiết kế là làm trải nghiệm hiện có mạch lạc, dễ đọc, nhất quán và có bản sắc hơn; không thiết kế lại thành một sản phẩm khác.

Ba mục tiêu ưu tiên:

1. **Nắm nhanh:** mở trang buổi sáng, trong vài giây hiểu các diễn biến quan trọng; có thể đọc sâu trong 5–10 phút.
2. **Tin có ngữ cảnh:** nhận biết đâu là nguồn báo chí, đâu là xác nhận chính thức, đâu còn là tin đồn; luôn tìm được bài gốc.
3. **Theo đội mình:** từ một tin hoặc trận đấu đi tiếp đến CLB, cầu thủ, giải đấu và bảng tin cá nhân.

### 1.2. Quy ước trong tài liệu

| Ký hiệu | Ý nghĩa |
| --- | --- |
| **Hiện có** | Có route, thành phần hoặc quy tắc trong repository tại thời điểm rà soát. Không đồng nghĩa đã kiểm tra trực tiếp toàn bộ dữ liệu trên máy người dùng. |
| **Yêu cầu thiết kế** | Designer phải thể hiện trong phương án và bàn giao tương tác. |
| **Đề xuất** | Hướng xử lý để designer thử nghiệm; chưa phải quyết định thương hiệu hay chức năng đã được triển khai. |
| **Ngoài phạm vi** | Không đưa vào bản thiết kế triển khai đợt này. |

Tài liệu bám vào `PRODUCT_SPEC.md`, `CODEX_PLAN.md`, `CODEX_PROMPTS.md`, `CODEX_WORKFLOW.md`, `docs/PROGRESS.md` và các màn hình hiện tại. Với quyết định cập nhật, đối chiếu thêm tài liệu vận hành nguồn tin và hình ảnh ở mục 15. Nếu tài liệu cũ mâu thuẫn với quyết định mới đã ghi nhận của chủ sản phẩm, không tự quay về quy tắc cũ.

**Phạm vi:** trải nghiệm đã có sau Milestone 1–16 và các cập nhật giao diện sau đó. Không triển khai Milestone 17 trong công việc này.

**Ngoài phạm vi:** cài PWA, push notification, bình luận, lượt thích, đăng bài của người dùng, chat, Fan Pulse ingestion, thanh toán, quảng cáo cá nhân hóa và bản tin sáng riêng cho từng người. “Vui” hiện là bài giải trí do báo viết, không phải mạng xã hội của người dùng.

### 1.3. Lưu ý về tên thương hiệu

Tên làm việc dùng trong tài liệu: **FotBan**. Giao diện hiện tại còn dùng chữ **Football Morning Brief** và dấu hiệu **FB.**. Designer cần đề xuất cách thống nhất tên, wordmark và nhận diện; chủ sản phẩm duyệt trước khi đổi toàn bộ giao diện. Chưa mặc định có bộ logo thương hiệu hoàn chỉnh.

## 2. Người dùng và nguyên tắc trải nghiệm

| Người dùng | Nhu cầu chính | Ưu tiên thiết kế |
| --- | --- | --- |
| Người đọc nhanh buổi sáng | Biết kết quả, tin lớn, trận sắp tới | Tỷ số rõ, tóm tắt ngắn, thời gian dễ thấy |
| Fan theo CLB/cầu thủ | Theo tin đội mình, lịch đấu, chuyển nhượng | Liên kết thực thể nhất quán, theo dõi dễ dùng |
| Người quan tâm độ tin cậy | Phân biệt tin đồn với thông báo chính thức | Nhãn dễ hiểu, nguồn và mức chắc chắn tách biệt |
| Biên tập viên / quản trị | Duyệt nội dung, nguồn và bản tin an toàn | Màn hình thao tác rõ, lịch sử và xác nhận hành động |

**Tính cách sản phẩm:** gọn, năng động, đáng tin, gần người hâm mộ nhưng không giật gân. Có cảm giác một không gian bóng đá theo đội và giải, không phải tờ báo dày đặc hay ứng dụng cá cược.

Các nguyên tắc bắt buộc:

- Đọc công khai không cần đăng nhập. Đăng nhập bổ sung theo dõi và bảng tin cá nhân.
- Dữ liệu ít vẫn phải đẹp. Không dùng nội dung giả để lấp khoảng trống.
- Không biến “nhiều báo đăng” thành “đã xác nhận”.
- Không hy sinh thông tin nguồn để lấy chỗ cho hình ảnh.
- Thời gian công khai dùng giờ Việt Nam, **Asia/Ho_Chi_Minh — UTC+7**.
- Nội dung và trạng thái đến từ dữ liệu nội bộ; giao diện không tự suy luận độ tin cậy, chuyển nhượng hay thống kê.

## 3. Kiến trúc thông tin

### 3.1. Bản đồ màn hình hiện có

| Nhóm | Route | Vai trò |
| --- | --- | --- |
| Trang chủ | `/` | Bản tin sáng đã xuất bản, tin báo chí và khối cá nhân khi đăng nhập |
| Trận đấu | `/matches` | Lịch, kết quả và trạng thái trận |
| Chi tiết trận | `/match/[slug]` | Tỷ số, dữ kiện, diễn biến, đội hình, thống kê khi có |
| Tin tức | `/news` | Tin theo nhóm câu chuyện, nguồn báo chí và tin đã kiểm chứng |
| Chi tiết tin | `/news/[slug]` | Tóm tắt/ngữ cảnh và các nguồn gốc |
| Chuyển nhượng | `/transfers` | Theo dõi các diễn biến có phân loại trạng thái |
| Chi tiết chuyển nhượng | `/transfers/[slug]` | Quan hệ cầu thủ–CLB, bằng chứng và dòng thời gian |
| Giải đấu | `/league/premier-league`, `/league/la-liga` | Tin, BXH, lịch, đội bóng, chuyển nhượng theo giải |
| CLB | `/club/club-<id>` | Trung tâm nội dung của CLB |
| Cầu thủ | `/player/player-<id>` | Hồ sơ và nội dung liên quan cầu thủ |
| Bảng tin cá nhân | `/following` | Nội dung theo các mục người dùng đang theo dõi |
| Đăng nhập | `/login` | Đăng nhập Google, quay lại nơi đang xem |
| Tài khoản | `/account` | Danh tính, danh sách theo dõi, tùy chọn |
| Ghi công | `/ghi-cong-anh` | Ghi công và giấy phép ảnh cầu thủ |
| Quản trị | `/admin` và các trang con | Vận hành nội bộ, chỉ ADMIN |

Slug kỹ thuật chỉ phục vụ liên kết; không đưa UUID, mã nội bộ vào tên màn hình cho người đọc.

### 3.2. Điều hướng chung

**Hiện có:** Trang chủ · Trận đấu · Tin tức · Giải đấu · Chuyển nhượng; lối vào “Bảng tin của tôi”.

**Yêu cầu thiết kế:** thể hiện vị trí hiện tại; có đường về danh sách từ trang chi tiết; giữ lối vào tài khoản và đăng xuất dễ tìm sau đăng nhập. Giải đấu phải chuyển rõ giữa Premier League và La Liga, không tự mở rộng sang giải khác.

**Đề xuất mobile:** thử một phương án thanh đầu trang gọn và một phương án điều hướng cố định dưới màn hình. Chọn một phương án sau kiểm tra thao tác; không mặc định bổ sung cả hai thanh đầy đủ. Nếu dùng thanh cố định, phải chừa khoảng trống nội dung và vùng an toàn thiết bị.

Không thiết kế ô tìm kiếm toàn bộ sản phẩm như chức năng đã có. Tìm kiếm quản lý theo dõi và một số danh sách admin đã có phạm vi riêng.

## 4. Các hành trình cần có prototype

| Mã | Hành trình | Điểm kết thúc thành công |
| --- | --- | --- |
| J1 | Trang chủ → kết quả → chi tiết trận → highlight | Xem được nguồn video đã xác minh hoặc hiểu vì sao chưa có |
| J2 | Tin tức → nhóm tin → chi tiết → bài báo gốc | Biết tin từ ai, mức chắc chắn, mở đúng nguồn |
| J3 | Tin/Trận → CLB → theo dõi → đăng nhập → tiếp tục | Không mất ngữ cảnh; trạng thái theo dõi rõ ràng |
| J4 | Giải đấu → BXH → CLB → cầu thủ | Di chuyển tự nhiên qua các thực thể chuẩn |
| J5 | Bảng tin của tôi → quản lý theo dõi → quay lại | Hiểu vì sao nội dung xuất hiện; quản lý được mục quan tâm |
| J6 | Chuyển nhượng → diễn biến → nguồn/bằng chứng | Phân biệt tin quan tâm, đàm phán và đã xác nhận |
| J7 | Admin → xem bản tin READY → kiểm tra → xuất bản | Hành động có xác nhận, người thực hiện và lịch sử |

Prototype phải có ít nhất một nhánh thiếu dữ liệu và một nhánh lỗi, không chỉ luồng thành công.

## 5. Đặc tả màn hình công khai

### 5.1. Trang chủ — `/`

**Mục tiêu:** cho người đọc biết nhanh điều đáng chú ý và có điểm đi tiếp.

Thứ bậc nội dung:

1. Tiêu đề bản tin, ngày tiếng Việt, thời điểm cập nhật và hai giải được theo dõi.
2. Khối **Đội của tôi** nếu đã đăng nhập: đội/giải theo dõi, tối đa vài trận tới và tin mới, đường tới bảng tin cá nhân.
3. **Nắm nhanh buổi sáng:** 3 điểm đầu; mở thêm nếu có, tổng khoảng 3–6 điểm.
4. **Kết quả đêm qua:** đội, logo, tỷ số, trạng thái, giờ và highlight.
5. Tin đáng chú ý; các khối spotlight, chuyển nhượng, văn hóa bóng đá, trận sắp tới khi có dữ liệu.
6. Khối tin từ báo chí Việt Nam hiện có, với nhận diện nguồn riêng.

Designer có thể đề xuất điều chỉnh vị trí các khối trong wireframe, nhưng phải ghi rõ đó là đề xuất. Không trộn tin dẫn báo vào “bản tin đã kiểm chứng” chỉ để làm trang đầy hơn.

**Mobile:** tránh banner lớn; màn đầu nên có ngày/cập nhật, 2–3 điểm chính và bắt đầu nội dung hữu ích tiếp theo. Có thể thu gọn khối cá nhân khi nó đẩy toàn bộ bản tin xuống quá sâu.

**Desktop:** hai cột có ưu tiên rõ; nội dung chính rộng hơn, cột phụ dành cho chuyển nhượng/trận sắp tới. Không dùng bốn cột dày đặc.

Trạng thái cần thiết kế:

- Chưa có bản tin: “Bản tin sáng hôm nay đang được chuẩn bị.” + lối tới Trận đấu, Tin tức, Chuyển nhượng; vẫn có thể hiển thị khối báo chí độc lập nếu đủ điều kiện.
- Bản tin cũ: ghi đúng ngày bản tin và “Cập nhật gần nhất…”, không giả là hôm nay.
- Dữ liệu cập nhật một phần: “Một số nguồn đang cập nhật.”; giữ phần hợp lệ.
- Xem trước nội bộ: “Bản xem trước · Chưa xuất bản.”; không có nút mở preview công khai.
- Không có dữ liệu cộng đồng: bỏ hẳn mục, không tạo câu phản ứng fan.

### 5.2. Danh sách trận — `/matches`

- Bộ lọc giải và ngày/khoảng ngày theo khả năng màn hình hiện tại; nhóm trận theo ngày Việt Nam.
- Mỗi hàng/card có giải, hai đội và logo, tỷ số hoặc giờ bắt đầu, trạng thái; vòng đấu khi có.
- Kết quả là điểm nhìn chính; tên đội và tỷ số không bị đẩy lệch khi tên dài.
- Chưa có tỷ số không hiển thị `0–0`. Trận hoãn/hủy dùng trạng thái và dấu trung tính.
- “Đang diễn ra” chỉ xuất hiện khi dữ liệu nội bộ có trạng thái đó; không gợi cảm giác dịch vụ realtime bảo đảm.
- Đổi bộ lọc phải giữ lựa chọn, có trạng thái đang tải và thông báo không có trận phù hợp.

### 5.3. Chi tiết trận — `/match/[slug]`

Phần đầu: giải/mùa/vòng → hai đội và tỷ số → trạng thái → giờ, sân và thời điểm dữ liệu cập nhật.

**Các tab hiện có:** Dữ kiện · Sự kiện · Đội hình · BXH · Thống kê · Đối đầu.

| Tab | Yêu cầu thiết kế |
| --- | --- |
| Dữ kiện | Bài liên quan, thông tin trận, phong độ, trận tiếp theo, highlight và các số liệu tóm tắt khi có |
| Sự kiện | Timeline bàn thắng, thẻ, thay người; phân biệt hai phía, phút bù giờ và phản lưới |
| Đội hình | Đội hình sân và danh sách thay thế dễ đọc trên mobile; trạng thái chưa có đội hình |
| BXH | Nhấn hai đội liên quan; chú giải tên cột và thời điểm cập nhật |
| Thống kê | So sánh hai đội; chỉ số có đơn vị; không biến dữ liệu thiếu thành 0 |
| Đối đầu | Các lần gặp đã lưu; không hứa có lịch sử đầy đủ nếu dữ liệu không đủ |

**Lưu ý dữ liệu:** code hiện đã có diễn biến, đội hình và thống kê bổ sung. Phần cú sút/thống kê cầu thủ đang có thay đổi chưa chốt trong working tree tại lúc soạn. Designer chuẩn bị biến thể có/không có dữ liệu; không coi toàn bộ chỉ số, xG, bản đồ cú sút hay điểm cầu thủ là có cho mọi trận. Bàn giao phải gắn điều kiện hiển thị cho từng khối.

Highlight: CTA “Xem highlight”, nguồn/kênh, loại video và thời gian đăng. Chỉ video được hệ thống chọn hợp lệ; không có thì dùng thông báo nhẹ. Không thiết kế nút tải video.

Ưu tiên nguồn tiếng Việt đã xác minh và được chấp nhận theo giải/mùa/thời hạn, sau đó mới tới nguồn chính thức hoặc broadcaster quốc tế được duyệt. Không gắn cố định một kênh làm nhà đài vĩnh viễn. Nếu video là nguồn quốc tế, hiển thị rõ tên nguồn/ngôn ngữ khi có; không gắn nhãn “highlight tiếng Việt”.

### 5.4. Tin tức — `/news`

**Các tab hiện có:** Dành cho bạn · Mới nhất · Chuyển nhượng · Giải đấu. Trong tab Giải đấu có Tất cả / Premier League / La Liga.

- Dành cho bạn dùng theo dõi khi có; khách hoặc chưa theo dõi thấy lời mời phù hợp và tin chung. Nếu theo dõi nhưng chưa có tin mới, giải thích trước khi hiện tin chung.
- Mới nhất có thể đặt tin đã kiểm chứng lên trước nếu có, sau đó là nhóm tin báo chí.
- Danh sách tin dẫn báo được phân trang, hiện 24 nhóm/trang; không cần thiết kế tải vô hạn như tính năng sẵn có.
- Một nhóm chuyện có một card chính và các báo cùng đưa tin. Không lặp năm card cho cùng diễn biến.
- Card nổi bật có thể lớn hơn, nhưng không tạo hero chiếm toàn bộ màn mobile.

**Hai loại nội dung phải phân biệt:**

| | Tin dẫn từ báo chí — FeedCard | Tin đã qua pipeline kiểm chứng — ArticleCluster |
| --- | --- | --- |
| Văn bản | Tiêu đề và mô tả RSS của báo Việt Nam; ghi công nguồn | Tiêu đề và tóm tắt tiếng Việt đã xử lý/duyệt |
| Nhãn | “Báo chí” hoặc “Cộng đồng”; “Đang đưa tin” hoặc “Chưa xác nhận” | Nhãn độ tin cậy và mức chắc chắn do hệ thống cung cấp |
| Xác nhận | Không được gắn Official/Confirmed | Chỉ có khi bằng chứng và quyền sử dụng đáp ứng |
| Nhiều nguồn | “Cùng đưa tin…” | “N nguồn độc lập” chỉ khi backend xác định độc lập |
| Detail | `/news/bao-<id>` | `/news/tin-<id>` |

Không tạo cùng một huy hiệu xanh “Đã xác nhận” cho cả hai loại. Tiêu đề báo có chữ “CHÍNH THỨC” vẫn là tiêu đề của báo; giữ thông báo FotBan chưa đối chiếu thông báo chính thức nếu dữ liệu yêu cầu.

**Card tin:** ảnh tùy chọn → loại tin/nhãn → tiêu đề → mô tả ngắn → CLB/cầu thủ → nguồn → giờ → “Xem tin”. Có biến thể không ảnh với bố cục chủ động, không dùng khung ảnh trống.

### 5.5. Chi tiết tin — `/news/[slug]`

Thứ tự: nhãn → tiêu đề → nguồn/thời gian → mô tả hoặc tóm tắt → thực thể liên quan → ngữ cảnh đội/trận nếu có → các nguồn cùng đưa tin → nội dung liên quan → bài gốc.

- Dành chỗ cho “Xem bài gốc ↗”, dễ tìm cả trên mobile; tên báo đi kèm.
- Hiển thị danh sách nguồn có tên báo, tiêu đề gốc, thời gian, ngôn ngữ và nhãn nguồn khi được cung cấp.
- Bản dẫn báo không được trình bày như bài toàn văn do FotBan viết. Không thiết kế độ dài giả để tạo cảm giác có toàn bộ bài gốc.
- Thông tin CLB có thể gồm BXH, trận gần nhất, trận tiếp theo và thời điểm dữ liệu.
- Tin bị thu hồi/quyền thay đổi: trạng thái “Tin này hiện chưa khả dụng”, quay về danh sách; không giữ đoạn nội dung bị chặn.
- Link ngoài có dấu nhận biết và hành vi mở tab mới rõ ràng. Không biến cả card thành link ngoài nếu CTA chính là trang nội bộ.

### 5.6. Giải đấu — `/league/[slug]`

Header: tên giải, quốc gia/mùa giải, chuyển giải, theo dõi ở nơi đã hỗ trợ. Không bắt buộc logo giải nếu chưa có tài sản hợp lệ.

**Tab:** Tin tức · Tổng quan · Bảng xếp hạng · Lịch thi đấu · Đội bóng · Chuyển nhượng.

- Tổng quan nối tin nổi bật, trận tới và BXH rút gọn.
- BXH ưu tiên hạng, đội/logo, số trận, hiệu số, điểm trên mobile; cột phụ mở ở màn rộng. Phong độ có chữ/chú giải T–H–B, không chỉ màu.
- Lịch có các cửa sổ 7 ngày, trước/sau và khoảng ngày đang xem.
- Đội bóng liên kết đến trang CLB; chuyển nhượng dẫn báo vẫn dùng nhãn chưa xác nhận theo dữ liệu.
- Cho phép cuộn riêng hàng tab/bảng khi cần, không làm cả trang tràn ngang.

### 5.7. CLB — `/club/[slug]`

Header: logo, tên CLB, giải, hạng/điểm/phong độ khi có, trận tiếp theo và nút Theo dõi.

**Tab:** Tổng quan · Tin tức · Lịch thi đấu · Chuyển nhượng · Cầu thủ · Vui.

Tổng quan cần trả lời “Đội tôi đang thế nào?” bằng vài khối gọn; không lặp nguyên danh sách từ mọi tab. Danh sách cầu thủ theo tuyến, ảnh nếu có, tên liên kết và theo dõi. Ghi rõ đội hình theo lần đồng bộ gần nhất, có thể chậm sau chuyển nhượng.

**Vui:** có thông báo nội dung giải trí từ báo chí. Không thiết kế avatar người đăng, bình luận, số lượt thích hoặc phản ứng fan như dữ liệu đã có.

### 5.8. Cầu thủ — `/player/[slug]`

Header: ảnh/placeholder, tên, CLB, giải, vị trí, quốc tịch, tuổi khi dữ liệu có, theo dõi, thời điểm cập nhật. Có chỗ ghi công ảnh.

**Tab:** Tổng quan · Tin tức · Chuyển nhượng.

Chỉ hiển thị dữ liệu được lưu. Không tự thêm giá trị thị trường, chỉ số game, rating mùa giải hoặc thông tin đời tư. Hồ sơ hiện phụ thuộc cầu thủ trong đội hình EPL/La Liga hiện tại; thiết kế trạng thái trang không còn khả dụng.

### 5.9. Transfer Center — `/transfers` và detail

Card: cầu thủ → CLB hiện tại → CLB đích → trạng thái → tiêu đề/tóm tắt → nguồn → lần cập nhật. Có trường thiếu CLB hoặc cầu thủ; không ghép đại tên vào quan hệ.

| Trạng thái | Tiếng Việt | Vai trò thị giác |
| --- | --- | --- |
| CONFIRMED | Đã xác nhận | Tích cực, rõ nhất; luôn kèm chữ |
| NEGOTIATION | Đang đàm phán | Đang tiến triển |
| INTEREST | Quan tâm | Trung tính, đang theo dõi |
| RUMOR | Tin đồn | Thận trọng, thể hiện chưa chắc chắn |
| Disputed từ dữ liệu độ tin cậy | Có thông tin trái chiều | Cảnh báo riêng, không tự tạo trạng thái thương vụ mới |

- Bộ lọc giải và trạng thái; thứ tự do backend cung cấp, không tự xếp theo số báo đăng.
- Một cầu thủ với hai CLB đích có thể là hai diễn biến riêng; không nối thành một giao dịch.
- Detail có timeline cũ → mới, trạng thái hiện tại, bằng chứng, nguồn và cập nhật.
- “Phí đã xác nhận” và “Phí được đưa tin” là hai nhãn khác nhau; giữ tiền tệ nguồn. Thiếu phí thì bỏ trường, không ghi “Miễn phí”.
- Thời hạn hợp đồng chỉ xuất hiện khi có bằng chứng. Không tạo % hoàn tất hay đồng hồ đếm ngược thương vụ.
- Tin dẫn báo về chuyển nhượng trên `/news` hoặc hub không tự trở thành thương vụ đã xác nhận trong Transfer Center.

## 6. Đăng nhập, theo dõi và bảng tin cá nhân

### 6.1. Đăng nhập

Một hành động chính: **“Tiếp tục với Google”**. Nêu ngắn lợi ích theo dõi và rằng nội dung công khai vẫn đọc được không cần tài khoản. Có lối quay lại nội dung.

Thiết kế các trạng thái: đang chuyển sang Google, người dùng hủy, lỗi đăng nhập, cấu hình chưa sẵn sàng và phiên hết hạn. Sau đăng nhập quay lại màn hình/hành động đang dở theo khả năng hiện có; không hứa tự theo dõi nếu người dùng chưa xác nhận.

### 6.2. Nút theo dõi

Biến thể bắt buộc: Theo dõi · Đang theo dõi · Đang xử lý · Lỗi/Thử lại. Nhãn có ngữ cảnh, ví dụ “Theo dõi Arsenal”; trạng thái đang theo dõi dùng cả chữ và dấu hiệu.

Khách nhấn được đưa tới đăng nhập; không mở bảng tin riêng trống hoặc thông báo lỗi kỹ thuật. Tránh nhảy kích thước nút và mất vị trí cuộn sau thao tác. Thao tác thất bại phải trả về trạng thái thật.

### 6.3. `/following`

Tóm tắt đội/giải theo dõi → trận tới/kết quả gần nhất → tin mới → chuyển nhượng → mục Vui nếu có. Cho biết nội dung đến từ các mục đang theo dõi; có lối quản lý tại `/account`.

Chưa theo dõi: lời mời chọn CLB/giải; đã theo dõi nhưng thiếu tin: giữ các mục có dữ liệu và nói rõ chưa có nội dung mới. Không dựng bảng tin giả.

### 6.4. `/account`

Danh tính, đăng xuất, ba nhóm CLB/cầu thủ/giải đang theo dõi, tìm mục để theo dõi và tùy chọn hiện có. Tiếng Việt là trải nghiệm chính; không thiết kế bộ chuyển đa ngôn ngữ toàn sản phẩm khi chưa có.

Múi giờ tùy chọn được lưu cho phát triển cá nhân hóa; trang công khai vẫn hiển thị giờ Việt Nam. Có giải thích riêng tư ngắn, dễ đọc. Không thêm xin quyền thông báo ở giai đoạn này.

## 7. Quy tắc nhãn thông tin — bắt buộc giữ đúng

### 7.1. Tin đã kiểm chứng

| Nhãn | Cách diễn đạt | Hướng màu đề xuất |
| --- | --- | --- |
| OFFICIAL | Chính thức / Đã xác nhận | Xanh lá đậm trên nền xanh rất nhạt |
| RELIABLE | Báo chí uy tín | Xanh dương |
| SOCIAL | Cộng đồng / Mạng xã hội | Tím hoặc trung tính |
| RUMOR | Tin đồn | Hổ phách |
| DISPUTED | Có thông tin trái chiều | Màu cảnh báo dịu |

**Nhãn nguồn, mức chắc chắn, quyền sử dụng và độ mới là các khái niệm khác nhau.** Một báo uy tín có thể đăng tin chưa chắc chắn; một bài cũ không làm nguồn trở nên kém uy tín. Không vẽ vòng tròn “87% đúng”.

### 7.2. Tin dẫn báo

Chỉ dùng nhãn và thông báo riêng ở mục 5.4. “Cộng đồng” ở đây là phân loại nguồn, không chứng minh có bài đăng mạng xã hội hoặc đồng thuận người hâm mộ.

### 7.3. Quy tắc câu chữ

Giữ “được cho là”, “có thể”, “đang quan tâm”, “đang cân nhắc” khi nguồn/dữ liệu mang tính chưa chắc chắn. Không rút gọn tiêu đề làm mất phủ định hoặc biến câu hỏi thành khẳng định. Không tự đặt lời dẫn trong ngoặc kép nếu không có trích dẫn được phép dùng.

Số báo cùng đưa tin không mặc định là số nguồn độc lập. Designer cần hai biến thể metadata khác nhau cho hai khái niệm này.

## 8. Hình ảnh và nhận diện thực thể

| Loại | Thiết kế cần hỗ trợ | Khi không có/lỗi |
| --- | --- | --- |
| Logo CLB | Hiển thị crest từ URL đã được hệ thống cho phép; không cắt mất hình, không nhuộm lại | TLA/chữ chỉ là fallback lỗi hoặc thiếu logo, không phải hình thức chính |
| Ảnh cầu thủ | Ảnh Wikimedia được xác thực danh tính và giấy phép; chỗ ghi công tác giả/giấy phép | Biểu tượng người trung tính, không tự lấy ảnh khác hoặc dùng chữ làm ảnh |
| Ảnh báo chí | Chỉ ảnh từ RSS có nguồn cho phép, host được kiểm soát; ghi “Ảnh: [báo]” | Chuyển sang card không ảnh, không để khung hỏng |
| Video | Nguồn/kênh, loại và link đã chọn hợp lệ | Thông báo thiếu highlight, không lấy video reupload |

Đây là mô tả quyết định vận hành hiện tại, **không phải khẳng định mọi ảnh/logo đều có giấy phép tái sử dụng tự do**. Chủ sản phẩm đã ghi nhận quyết định sử dụng crest và ảnh báo chí trong phạm vi hiện tại. Designer không tải chúng làm thư viện tái phân phối, không yêu cầu backend rehost và không mở rộng sang ảnh tìm ngẫu nhiên.

Ảnh là lớp tăng nhận diện, không điều kiện để nội dung có thể đọc. Tất cả card cần biến thể có/không ảnh. Tỷ lệ khởi điểm đề xuất: ảnh tin 16:9; chân dung 1:1 hoặc 4:5; logo nằm trong khung cố định với `contain`.

Giữ trang ghi công ảnh và đường dẫn ở footer. Không thay ảnh cầu thủ bằng người nổi tiếng tương tự khi không có ảnh đúng.

## 9. Hệ thống giao diện đề xuất

Các thông số sau là **điểm bắt đầu cho designer**, chưa phải bộ token thương hiệu đã duyệt. Có thể điều chỉnh sau thử nghiệm nhưng cần bàn giao thống nhất.

| Nhóm | Định hướng |
| --- | --- |
| Màu nền | Nền xám lạnh rất nhạt; bề mặt trắng; chữ slate đậm |
| Màu nhấn | Xanh sân cỏ hoặc lime có kiểm soát; hiện code có lime `#c7f36b`, slate `#0f172a` và nền `#f4f6f8` làm tham chiếu |
| Chữ | Một font hỗ trợ đầy đủ dấu tiếng Việt; kiểm tra đ/Đ, ă, â, ê, ô, ơ, ư và dấu chồng. Không chọn font chỉ đẹp ở tiếng Anh |
| Cỡ chữ gợi ý | Nội dung 16px; metadata 12–14px; tiêu đề card 18–22px; H1 mobile 28–32px; tỷ số 28–40px tùy ngữ cảnh |
| Nhịp dòng | Nội dung khoảng 1.5–1.7; tiêu đề 1.25–1.4; tránh cắt dấu tiếng Việt |
| Số | Tabular numerals cho tỷ số, thời gian, điểm và BXH |
| Khoảng cách | Bộ 4/8/12/16/24/32/48; ưu tiên nhịp dọc gọn |
| Bo góc | 8px điều khiển; 12–16px card; tránh mọi thành phần đều thành viên thuốc |
| Viền/bóng | Viền nhẹ là chính; bóng chỉ tạo phân cấp cần thiết |
| Icon | Một bộ thống nhất; icon đi với chữ ở hành động/trạng thái quan trọng |

Không bắt buộc dark mode trong vòng bàn giao này. Không dùng gradient lớn, ticker giật gân, odds/cược hoặc animation điểm số gây hiểu nhầm là realtime.

### 9.1. Danh mục component cần bàn giao

1. App header/navigation/footer; active, guest, signed-in.
2. Tabs, league switcher, date navigation, filter chips, pagination.
3. Match row/card, scoreboard, match status, highlight link, missing-highlight.
4. FeedCard và verified-story card, lead/standard/compact, có/không ảnh.
5. Reliability badge, certainty badge, transfer badge, source line/list.
6. Club crest, player portrait/placeholder, entity chip và credit.
7. Club/player/league header; standings row, form chips, squad row.
8. Transfer relationship và timeline item; fee confirmed/reported.
9. Follow button, sign-in action, account field, feedback message.
10. Empty/error/loading/stale/partial notice; not-found; permission-withdrawn.
11. Admin list/filter/form, audit item, publication confirmation.

Mỗi component có kích thước, vùng nhấn, khoảng cách, quy tắc xuống dòng, biến thể responsive, trạng thái focus/hover/disabled/loading và điều kiện dữ liệu. Không chỉ bàn giao một màn ảnh tĩnh.

## 10. Responsive và accessibility

### 10.1. Khung kiểm tra

| Kích thước | Kiểm tra chính |
| --- | --- |
| 360px | Tên đội dài, score không vỡ, badge xuống dòng, CTA đủ chỗ |
| 390px / 430px | Trải nghiệm mobile chính; màn đầu trang chủ có ích |
| 768px | Tablet: chuyển bố cục, bảng và thanh tab |
| 1280px | Desktop: phân cấp hai cột, độ dài dòng đọc |

Đề xuất gutter mobile 16px, tablet 24px; container desktop khoảng 1152–1200px. Đây là kích thước kiểm tra, không nhất thiết là breakpoint triển khai cứng.

- Không tràn ngang toàn trang. Tab/BXH có thể cuộn trong vùng riêng, có dấu hiệu còn nội dung và dùng được bằng bàn phím.
- Tên dài xuống dòng; không cắt tên làm nhầm hai CLB. Tỷ số và trạng thái ưu tiên giữ rõ.
- Chỉ clamp mô tả ở card; detail đọc đủ phần được phép. Không che nguồn và nhãn chưa xác nhận.
- Nội dung detail có chiều dài dòng vừa phải; không kéo đoạn văn hết màn desktop.

### 10.2. Mục tiêu tiếp cận

- Vùng nhấn chính tối thiểu 44×44px; khoảng cách tránh chạm nhầm.
- Tương phản mục tiêu 4.5:1 cho chữ thường, 3:1 cho chữ lớn và thành phần giao diện quan trọng; kiểm tra trên màu badge thật.
- Focus nhìn rõ; thứ tự Tab hợp lý; có skip link, heading đúng cấp và tên liên kết có nghĩa.
- Không dùng màu làm cách duy nhất phân biệt thắng/thua, tin đồn/đã xác nhận.
- Form có label, lỗi cạnh trường và thông báo tổng hợp khi cần; không chỉ đổi viền đỏ.
- Phản hồi theo dõi/lưu phải đọc được bằng trình đọc màn hình; không biến mọi cập nhật nền thành thông báo dồn dập.
- Hỗ trợ zoom chữ và giảm chuyển động; tránh autoplay video.

Đây là tiêu chí nghiệm thu thiết kế, không phải tuyên bố ứng dụng đã được chứng nhận tuân thủ.

## 11. Trạng thái và microcopy

| Tình huống | Nội dung gợi ý | Hành động |
| --- | --- | --- |
| Chưa có bản tin | Bản tin sáng hôm nay đang được chuẩn bị. | Xem trận đấu / Đọc tin |
| Chưa có tin theo bộ lọc | Chưa có tin phù hợp trong khoảng thời gian này. | Đổi giải / Xem tin mới nhất |
| Không có tin được xuất bản | Chưa có tin được xuất bản. | Về danh sách hoặc quay lại sau |
| Chưa theo dõi | Chọn đội bóng và cầu thủ bạn quan tâm. | Thêm mục theo dõi |
| Chưa có highlight | Chưa có highlight từ nguồn được xác minh. | Giữ thông tin trận, không cần CTA giả |
| Thiếu thống kê | Chưa có dữ liệu thống kê cho trận này. | Về Dữ kiện |
| Trận hoãn/hủy | Hoãn / Hủy | Không hiển thị tỷ số giả |
| Lỗi tải | Nội dung tạm thời chưa khả dụng. | Thử lại |
| Phiên hết hạn | Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại. | Đăng nhập |
| Không có quyền admin | Bạn không có quyền truy cập khu vực này. | Về trang chủ |
| Tin không còn khả dụng | Tin này hiện chưa khả dụng. | Xem tin khác |

Loading phải giữ nhịp bố cục của card thật; skeleton không mô phỏng tỷ số, nhãn Official hoặc tin giật gân. Lỗi một khối không biến cả trang thành trang lỗi nếu các khối khác vẫn hợp lệ.

Hiển thị thời gian tương đối trong danh sách; detail có ngày/giờ đầy đủ. Tách **giờ bài gốc**, **giờ cập nhật câu chuyện** và **giờ làm mới dữ liệu**; không gộp thành một “vừa xong”. Với trận qua nửa đêm, nhóm theo ngày Việt Nam.

## 12. Admin — luồng vận hành riêng

Đây là bộ màn hình phụ, ưu tiên desktop/tablet, không đưa link admin cho người dùng thông thường. UI không thay thế kiểm soát quyền phía server.

| Màn hình | Nội dung và thao tác thiết kế |
| --- | --- |
| `/admin` | Lần chạy thành công/partial/lỗi, trạng thái Brief, hàng chờ duyệt, nguồn tắt/hạn chế |
| `/admin/sources` | Lọc/tìm nguồn; xem/sửa permission, reliability, official, trạng thái bật; giải thích chặn bật nguồn |
| `/admin/videos` | Kênh đã duyệt, xác minh, ưu tiên; mapping giải/mùa/thị trường/thời hạn |
| `/admin/stories` | Xem nguồn, bản gốc, bản Việt, cảnh báo, bằng chứng, lịch sử; duyệt/từ chối/đề nghị sửa |
| `/admin/transfers` | Kiểm tra quan hệ thực thể, trạng thái, bằng chứng, timeline và phí |
| `/admin/briefs` | Chọn ngày/revision, xem trước READY, tái tạo, xuất bản có xác nhận |
| `/admin/jobs` | Danh sách job, thời gian, kết quả, số bản ghi, lỗi an toàn; rerun theo chức năng đã có |

Yêu cầu chung: phân trang, trạng thái đang lưu/lưu lỗi/lưu thành công, lý do thay đổi, xác nhận thao tác nhạy cảm, so sánh trước/sau và lịch sử. Không có nút xóa vĩnh viễn bằng chứng, bản tin cũ hoặc JobRun.

Không đặt nút “Chuyển thành chính thức” độc lập với bằng chứng. Không bật nguồn bị cấm bằng một cảnh báo hình thức. Không hiển thị khóa API hoặc dữ liệu cấu hình bí mật.

**Khoảng trống cần ghi nhận:** duyệt FeedCard bị giữ hiện dùng công cụ vận hành dòng lệnh; chưa có màn admin riêng. Designer có thể nêu đề xuất bổ sung trong trang ý tưởng, nhưng không trình bày như chức năng đã triển khai hoặc mặc định nằm trong phạm vi lập trình đợt này. Unpublish cũng không phải thao tác hiện đã được mở trong console.

## 13. Wireframe định hướng

Các sơ đồ thể hiện thứ tự thông tin, không chốt pixel hoặc bắt buộc giao diện phải giống hệt.

### Trang chủ mobile

```text
Tên sản phẩm                 Tài khoản
Điều hướng chính / mục đang chọn

Bản tin sáng
Ngày tiếng Việt · Cập nhật HH:mm
Premier League · La Liga
[Đội của tôi — khi đăng nhập, gọn]

NẮM NHANH BUỔI SÁNG
01  Điểm chính → nội dung liên quan
02  Điểm chính
03  Điểm chính        [Xem thêm]

KẾT QUẢ ĐÊM QUA
Giải · Kết thúc
Logo / Đội nhà     Tỷ số     Đội khách / Logo
Giờ Việt Nam
Xem highlight ↗ · Tên kênh

TIN ĐÁNG CHÚ Ý / TIN TỪ BÁO CHÍ
Nhãn → tiêu đề → mô tả → nguồn → giờ

Các mục có dữ liệu khác → footer / ghi công
```

### Chi tiết tin mobile

```text
← Tin tức
Loại tin · Nhãn nguồn · Mức chắc chắn
Tiêu đề tiếng Việt
Nguồn chính · Ngày giờ
[Ảnh có phép + ghi công, nếu có]
Mô tả RSS hoặc tóm tắt được duyệt
CLB / Cầu thủ liên quan → hub
[Ngữ cảnh đội / trận, nếu có]
Các nguồn cùng đưa tin / bằng chứng
Xem bài gốc ↗
Tin liên quan
```

## 14. Hạng mục bàn giao và tiêu chí duyệt

### 14.1. File Figma

Đề nghị tổ chức theo các trang:

1. `00 — Read me & scope`: phiên bản, giả định, câu hỏi cần duyệt, link prototype.
2. `01 — Flows & IA`: sitemap và các hành trình J1–J7.
3. `02 — Foundations`: màu, chữ, spacing, grid, icon, ảnh và accessibility.
4. `03 — Components`: Auto Layout, variants, properties; trạng thái tương tác.
5. `04 — Public mobile`: trang chủ, tin/list/detail, trận/list/detail, chuyển nhượng.
6. `05 — Hubs & personal`: giải, CLB, cầu thủ, login, following, account.
7. `06 — Tablet & desktop`: chuyển bố cục của các màn chính.
8. `07 — Admin`: các màn vận hành và xác nhận.
9. `08 — States & handoff`: ma trận trạng thái, điều kiện dữ liệu, ghi chú developer.

### 14.2. Thứ tự ưu tiên

**P0 — duyệt trước:** hệ thống nhãn/nguồn; điều hướng; trang chủ; news list/detail; trận list/detail; responsive mobile; trạng thái rỗng và thiếu dữ liệu.

**P1 — hoàn thiện kế tiếp trong gói thiết kế:** league/club/player hub; chuyển nhượng; login/following/account; admin; tablet/desktop và thư viện component đầy đủ.

### 14.3. Checklist nghiệm thu

- [ ] Có màn hình 360, 390, 430, 768 và 1280px; không tràn ngang toàn trang.
- [ ] Đọc nhanh hiểu kết quả, chuyện chính, mức chắc chắn và nguồn.
- [ ] Tin báo chí không mang huy hiệu xác nhận của tin đã kiểm chứng.
- [ ] Tin đồn, phí được đưa tin và thông tin trái chiều không bị thiết kế thành sự thật đã chốt.
- [ ] Có card ảnh thật, không ảnh, ảnh lỗi; ghi công không bị bỏ.
- [ ] Tên CLB/cầu thủ dài, tiêu đề Việt dài và nhiều badge vẫn dùng được.
- [ ] Có thiếu tỷ số, hoãn/hủy, thiếu đội hình/thống kê, thiếu highlight và dữ liệu cũ.
- [ ] Có khách, đã đăng nhập, chưa theo dõi, lỗi theo dõi và phiên hết hạn.
- [ ] Bộ lọc, tab, phân trang, back và nguồn gốc có hành vi prototype rõ.
- [ ] Có trạng thái chưa xuất bản/bị thu hồi; không lộ nội dung bị chặn.
- [ ] Không thêm lượt thích, bình luận, push/PWA hoặc nội dung fan giả.
- [ ] Asset/font/icon có nguồn và điều kiện sử dụng; logo CLB và ảnh báo không được coi là tài sản do FotBan sở hữu.
- [ ] Developer nhận được token, kích thước, behavior, điều kiện dữ liệu và trạng thái, không chỉ ảnh chụp màn hình.

### 14.4. Nội dung dùng trong thiết kế

Ưu tiên lấy nội dung thật đang hiện trong môi trường local: `/`, `/news`, hai league hub và một CLB/cầu thủ có dữ liệu. Không cố định số lượng bài, nguồn hoặc ảnh theo một lần đồng bộ; chúng có thể thay đổi.

Trường hợp cần stress-test, ghi rõ **“Mẫu kiểm tra bố cục — không dùng làm dữ liệu sản phẩm”** trên frame. Không đưa điểm số, thương vụ hay phát ngôn giả vào bản demo được giới thiệu như dữ liệu thật. Không chia sẻ ảnh chụp tài khoản có email cá nhân, khóa cấu hình hoặc thông tin quản trị nhạy cảm ra ngoài nhóm.

Các điểm cần chủ sản phẩm duyệt sau vòng concept: tên/wordmark FotBan, phương án điều hướng mobile, vị trí khối cá nhân trên homepage và mật độ ảnh trên news feed. Designer có thể bắt đầu wireframe với các hướng dẫn trong tài liệu, không cần chờ quyết định thương hiệu cuối cùng.

## 15. Tài liệu và màn hình tham chiếu

Các link dưới đây là tài liệu trong repository; nên gửi kèm tài liệu liên quan hoặc quyền xem bản sao cho designer nếu họ không truy cập repo.

- [Đặc tả sản phẩm](../PRODUCT_SPEC.md), [kế hoạch milestone](../CODEX_PLAN.md), [prompt triển khai](../CODEX_PROMPTS.md), [quy trình](../CODEX_WORKFLOW.md), [tiến độ và quyết định cập nhật](PROGRESS.md).
- [Trang chủ](MORNING_HOMEPAGE.md), [News UI](NEWS_UI.md), [nguồn tin Việt Nam và publisher cards](VIETNAMESE_NEWS.md).
- [Ảnh, logo và ghi công](IMAGES.md), [chuyển nhượng](TRANSFERS.md), [highlight](VIDEO_HIGHLIGHTS.md).
- [Đăng nhập và theo dõi](AUTHENTICATION_FOLLOWING.md), [quản trị](ADMIN.md).

**Lưu ý đối chiếu:** một số đoạn trong tài liệu cũ còn mô tả fallback chữ cho logo, chưa có ảnh cầu thủ hoặc news feed cũ. Dùng quyết định mới trong `PROGRESS.md`, `IMAGES.md` và giao diện hiện tại để hiểu trạng thái cập nhật; không suy ra rằng tất cả màn hình đã được kiểm tra lại trực tiếp trong lần viết tài liệu này.

Đây là tài liệu thiết kế và bàn giao. Không thay đổi chính sách xuất bản, quyền nguồn tin, lịch chạy production hoặc phạm vi milestone.
