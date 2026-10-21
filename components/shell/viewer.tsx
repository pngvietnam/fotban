"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useFollows } from "../account/follow-store";
import { useSavedStories } from "../news/feed-actions";
import { clubPath } from "../../lib/club-presentation";
import { playerPath } from "../../lib/player-presentation";

const Arrow = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14 M14 7l5 5-5 5" /></svg>;
const AccountIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M4 21a8 8 0 0 1 16 0" /></svg>;

/**
 * Top bar actions from prototype v2: the "Của tôi" disclosure (closes on Escape or an outside click) plus
 * "Đăng nhập" for guests, which phones hide in favour of the menu.
 */
export function TopbarAccount() {
  const viewer = useFollows();
  const saved = useSavedStories().saved.length;
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!(event.target as Element).closest("#fb-account-disclosure")) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); document.getElementById("fb-account-toggle")?.focus(); } };
    document.addEventListener("pointerdown", outside); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [open]);
  const signedIn = viewer.ready && viewer.signedIn;
  const items = [
    { href: "/following", label: "Bảng tin của tôi", detail: "Tin & lịch của bạn" },
    { href: "/saved", label: "Tin đã lưu", detail: saved ? `${saved} tin` : "Chưa có tin nào" },
    { href: "/following/manage", label: "Quản lý theo dõi", detail: "CLB, giải đấu & cầu thủ" },
    signedIn ? { href: "/account", label: "Tài khoản", detail: "Sở thích của bạn" } : { href: "/login", label: "Đăng nhập", detail: "Tiếp tục với tài khoản" },
  ];
  return <>
    <div id="fb-account-disclosure" className="fb-account-disclosure">
      <button type="button" id="fb-account-toggle" className="fb-button fb-button-secondary" aria-label="Mở không gian của tôi" aria-expanded={open} aria-controls="fb-account-actions" onClick={() => setOpen(!open)}><AccountIcon /><span>Của tôi</span></button>
      {open && <nav id="fb-account-actions" className="fb-account-actions" aria-label="Không gian cá nhân">
        <span className="fb-text fb-text-caption fb-account-heading">KHÔNG GIAN CỦA BẠN</span>
        {items.map((item) => <Link key={item.href} href={item.href} className="fb-button fb-button-ghost" onClick={() => setOpen(false)}><span className="fb-text fb-text-meta">{item.label}</span><small className="fb-text fb-text-caption">{item.detail}</small></Link>)}
      </nav>}
    </div>
    {!signedIn && <Link href="/login" className="fb-login">Đăng nhập <Arrow /></Link>}
  </>;
}
/** "Đội bóng của tôi": the reader's followed clubs (and players) with crests; nothing is shown for guests. */
export function SidebarMyTeams() {
  const viewer = useFollows();
  const items = viewer.follows.filter((follow) => follow.type !== "COMPETITION").slice(0, 6);
  return <div className="fb-my-teams">
    <div className="fb-nav-label fb-following-label">ĐỘI BÓNG CỦA TÔI<Link href="/following/manage" aria-label="Quản lý theo dõi">＋</Link></div>
    {items.map((item) => <Link key={item.entityId} className="fb-team-nav" href={item.type === "CLUB" ? clubPath(item.entityId) : playerPath(item.entityId)}>
      {item.crestUrl
        // eslint-disable-next-line @next/next/no-img-element -- hotlinked football-data crest
        ? <img src={item.crestUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />
        : <span aria-hidden="true" className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full bg-slate-100 text-[9px] font-bold text-slate-500">{item.name.slice(0, 2).toUpperCase()}</span>}
      <span>{item.name}</span>
    </Link>)}
    <Link className="fb-discover" href="/following/manage">{viewer.follows.length ? "Khám phá thêm đội bóng" : "Chọn đội bóng để theo dõi"} <span aria-hidden="true">↗</span></Link>
  </div>;
}
