import Link from "next/link";
import type { ReactNode } from "react";
import { SidebarMyTeams, TopbarAccount } from "./shell/viewer";

type Section = "home" | "matches" | "news" | "transfers" | "account" | "league" | "following" | "saved";
const icons: Record<string, string> = {
  home: "m3 10 9-7 9 7v10H3z M9 20v-7h6v7", news: "M4 3h16v18H4z M8 7h8 M8 11h8 M8 15h3 M8 18h8",
  ball: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M8 9l4-3 4 3-2 5h-4z M8 9l-5 1 M16 9l5 1 M10 14l-3 6 M14 14l3 6",
  transfer: "M4 7h16l-4-4 M20 17H4l4 4 M20 7l-4 4 M4 17l4-4", cup: "M7 3h10v6a5 5 0 0 1-10 0z M7 5H3v3a4 4 0 0 0 4 4 M17 5h4v3a4 4 0 0 1-4 4 M12 14v7 M8 21h8",
  bookmark: "M6 3h12v18l-6-4-6 4z", arrow: "M5 12h14 M14 7l5 5-5 5",
};
function Icon({ name, size = 20 }: { name: string; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={icons[name] ?? icons.ball} /></svg>;
}
const mainNav = [
  { key: "home", href: "/", label: "Bảng tin", icon: "home" }, { key: "matches", href: "/matches", label: "Trận đấu", icon: "ball" },
  { key: "news", href: "/news", label: "Tin tức", icon: "news" }, { key: "transfers", href: "/transfers", label: "Chuyển nhượng", icon: "transfer" },
  { key: "league", href: "/leagues", label: "Giải đấu", icon: "cup" },
] as const;

/**
 * The fotban app shell from the approved prototype: sidebar (bottom tab bar on phones), top bar and
 * page content. Reader-specific parts (account button, followed clubs) load on the client so pages
 * stay statically renderable. The notification bell is left out until notifications exist.
 */
export function SportsShell({ children, section }: { children: ReactNode; section: Section }) {
  const contentId = section === "account" || section === "following" || section === "saved" ? "account-content" : section === "home" ? "morning-content" : section === "matches" ? "match-content" : section === "news" || section === "league" ? "news-content" : "transfer-content";
  return <div className="fb-app match-surface">
    <a href={`#${contentId}`} className="fb-skip-link">Đến nội dung chính</a>
    <aside className="fb-sidebar">
      <Link className="fb-brand" href="/" aria-label="fotban — Bảng tin"><span className="fb-brandmark" aria-hidden="true">f.</span>fotban<span className="fb-brand-dot" aria-hidden="true">.</span></Link>
      <div className="fb-nav-label">KHÔNG GIAN BÓNG ĐÁ CỦA BẠN</div>
      <nav aria-label="Điều hướng chính">{mainNav.map((item) => <Link key={item.key} href={item.href} aria-current={section === item.key ? "page" : undefined} className={`fb-nav-item ${section === item.key ? "active" : ""}`}><Icon name={item.icon} />{item.label}</Link>)}</nav>
      <div className="fb-side-divider" />
      <Link href="/following" aria-current={section === "following" ? "page" : undefined} className={`fb-nav-item ${section === "following" ? "active" : ""}`}><Icon name="home" />Bảng tin của tôi</Link>
      <Link href="/saved" aria-current={section === "saved" ? "page" : undefined} className={`fb-nav-item ${section === "saved" ? "active" : ""}`}><Icon name="bookmark" />Tin đã lưu</Link>
      <SidebarMyTeams />
      <div className="fb-sidebar-bottom">
        <div className="fb-mini-pitch"><Icon name="ball" size={26} /></div>
        <h4>Bóng đá. Theo cách của bạn.</h4>
        <p>Theo dõi đội bóng yêu thích.<br />Không bỏ lỡ điều quan trọng.</p>
        <Link href="/following">Tạo bảng tin của bạn <Icon name="arrow" size={16} /></Link>
      </div>
      <div className="fb-side-footer"><Link href="/about">Về Fotban</Link> · <Link href="/terms">Điều khoản</Link> · <Link href="/ghi-cong-anh">Ghi công ảnh</Link><br />© 2026 Fotban</div>
    </aside>
    <div className="fb-workspace">
      <header className="fb-topbar">
        <div className="fb-header-location">Không chỉ tỷ số. <span>Cả câu chuyện.</span></div>
        <div className="fb-header-actions"><span className="fb-timezone">Giờ Việt Nam · UTC+7</span><TopbarAccount /></div>
      </header>
      <main id={contentId} tabIndex={-1} className="fb-main">{children}</main>
    </div>
  </div>;
}
