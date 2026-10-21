import type { Metadata } from "next";
import Link from "next/link";
import { SportsShell } from "../../components/sports-shell";
import { PageHead } from "../../components/domain/domain-ui";

export const metadata: Metadata = { title: "Điều khoản & quyền riêng tư | Fotban", description: "Cách Fotban dùng nội dung và dữ liệu của bạn." };

export default function TermsPage() {
  return <SportsShell section="home"><div className="domain-page">
    <PageHead kicker="FOTBAN · THÔNG TIN SẢN PHẨM" title="Minh bạch & quyền riêng tư." text="Những điều cần biết khi dùng Fotban." />
    <div className="dp-panel dp-prose">
      <h2>Nội dung</h2>
      <p>Fotban hiển thị tiêu đề và mô tả ngắn của bài báo kèm liên kết về trang gốc; bản quyền bài viết thuộc về các báo. Logo câu lạc bộ thuộc quyền sở hữu của các câu lạc bộ và giải đấu. Ảnh cầu thủ theo giấy phép tự do, xem <Link href="/ghi-cong-anh">ghi công ảnh</Link>.</p>
      <p>Thông tin chỉ mang tính tham khảo. Tin chuyển nhượng và tin đồn chưa phải xác nhận chính thức của câu lạc bộ.</p>
      <h2>Dữ liệu của bạn</h2>
      <p>Khi đăng nhập bằng Google, Fotban lưu tên hiển thị, email, liên kết tài khoản, phiên đăng nhập, tùy chọn, các mục bạn theo dõi và lượt thích. Không lưu ảnh đại diện hay token truy cập Google, và không dùng dữ liệu này để lập hồ sơ quảng cáo.</p>
      <p>Với khách, danh sách theo dõi, tin đã lưu và lượt thích nằm trên trình duyệt của bạn. Danh sách theo dõi còn được gửi kèm yêu cầu trang qua một cookie chứa mã định danh để Fotban dựng Bảng tin của tôi; cookie này bị xóa khi bạn đăng nhập hoặc bỏ hết theo dõi.</p>
    </div>
  </div></SportsShell>;
}
