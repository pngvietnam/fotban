import type { Metadata } from "next";
import Link from "next/link";
import { SportsShell } from "../../components/sports-shell";
import { PageHead } from "../../components/domain/domain-ui";

export const metadata: Metadata = { title: "Về Fotban", description: "Fotban tổng hợp tin, trận đấu và chuyển nhượng bóng đá bằng tiếng Việt, kèm nguồn gốc rõ ràng." };

export default function AboutPage() {
  return <SportsShell section="home"><div className="domain-page">
    <PageHead kicker="FOTBAN · THÔNG TIN SẢN PHẨM" title="Không chỉ tỷ số. Cả câu chuyện." text="Một không gian dành cho những người yêu bóng đá." />
    <div className="dp-panel dp-prose">
      <h2>Nắm nhanh. Hiểu sâu. Theo đội mình.</h2>
      <p>Fotban tổng hợp lịch, kết quả, bảng xếp hạng, tin tức và chuyển nhượng của Ngoại hạng Anh, La Liga, Ligue 1 và Champions League bằng tiếng Việt.</p>
      <h2>Dữ liệu đến từ đâu</h2>
      <p>Lịch, kết quả và bảng xếp hạng lấy từ football-data.org; diễn biến chi tiết trận và hồ sơ chuyển nhượng cầu thủ từ Highlightly. Tin tức là tiêu đề và mô tả ngắn từ các báo bóng đá Việt Nam, luôn dẫn về bài gốc. Video điểm nhấn được nhúng từ kênh chính thức trên YouTube.</p>
      <p>Chỗ nào chưa có dữ liệu thật, Fotban để trống thay vì điền số liệu. Tin chuyển nhượng được ghi theo cách báo chí đưa tin; Fotban không tự xác nhận thương vụ.</p>
      <h2>Của riêng bạn</h2>
      <p>Bạn không cần tài khoản để đọc. <Link href="/following/manage">Theo dõi</Link> CLB, giải đấu hoặc cầu thủ để có <Link href="/following">Bảng tin của tôi</Link>; lựa chọn của khách lưu trên trình duyệt và được chuyển vào tài khoản khi bạn đăng nhập.</p>
    </div>
  </div></SportsShell>;
}
