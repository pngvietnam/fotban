import Link from "next/link";
import { SportsShell } from "../sports-shell";
import { PageHead } from "../domain/domain-ui";
import { LogoutButton, PreferenceForm } from "./account-controls";
import type { ActiveUser, FollowedEntity } from "../../services/following";

const sections = { COMPETITION: "Giải đấu", CLUB: "Câu lạc bộ", PLAYER: "Cầu thủ" } as const;

export function AccountView({ user, follows, preferences }: { user: ActiveUser; follows: FollowedEntity[]; preferences: { locale: string; timezone: string } }) {
  return <SportsShell section="account"><div className="domain-page">
    <PageHead kicker="KHÔNG GIAN CỦA BẠN" title="Tài khoản & sở thích." text="Quản lý điều bạn quan tâm để bắt nhịp bóng đá theo cách riêng." />
    <div className="dp-two-columns">
      <div>
        <section className="dp-panel" aria-label="Tài khoản"><div className="dp-section-heading"><h2>{user.name || "Người đọc Fotban"}</h2></div>{user.email && <p className="dp-muted">{user.email}</p>}<LogoutButton /></section>
        <section className="dp-panel" aria-label="Đang theo dõi"><div className="dp-section-heading"><h2>Đang theo dõi</h2><span>{follows.length} mục</span></div>
          {follows.length ? (Object.keys(sections) as (keyof typeof sections)[]).filter((type) => follows.some((item) => item.type === type)).map((type) => <p key={type} className="dp-muted"><b>{sections[type]}:</b> {follows.filter((item) => item.type === type).map((item) => item.name).join(", ")}</p>) : <p className="dp-muted">Bạn chưa theo dõi mục nào.</p>}
          <Link className="dp-secondary" href="/following/manage">Quản lý theo dõi →</Link></section>
      </div>
      <div>
        <section className="dp-panel" aria-label="Tùy chọn cá nhân"><h2>Tùy chọn cá nhân</h2><PreferenceForm timezone={preferences.timezone} /><p className="dp-muted">Tùy chọn được lưu cho tính năng cá nhân hóa trong tương lai. Giờ hiển thị trên trang công khai vẫn là giờ Việt Nam.</p></section>
        <section className="dp-panel" aria-label="Dữ liệu của bạn"><h2>Dữ liệu của bạn</h2><p className="dp-muted">Fotban lưu tên hiển thị, email, liên kết tài khoản Google, phiên đăng nhập, tùy chọn, các mục bạn theo dõi và lượt thích. Không dùng dữ liệu này để lập hồ sơ quảng cáo. Xem <Link href="/terms">Điều khoản & quyền riêng tư</Link>.</p></section>
      </div>
    </div>
  </div></SportsShell>;
}
