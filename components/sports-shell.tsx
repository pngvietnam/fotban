import Link from "next/link";
import type { ReactNode } from "react";

export function SportsShell({ children, section }: { children: ReactNode; section: "home" | "matches" | "news" | "transfers" | "account" | "league" }) {
  const contentId = section === "account" ? "account-content" : section === "home" ? "morning-content" : section === "matches" ? "match-content" : section === "news" || section === "league" ? "news-content" : "transfer-content";
  return <div className="match-surface min-h-screen bg-[#f4f6f8] text-slate-950">
    <a href={`#${contentId}`} className="match-skip-link">Đến nội dung chính</a>
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <Link href="/" className="flex items-center gap-3 font-bold tracking-tight" aria-label="Football Morning Brief — Trang chủ">
          <span aria-hidden="true" className="grid h-10 w-10 place-items-center rounded-xl bg-slate-950 text-sm text-[#c7f36b]">FB.</span>
          <span className="text-sm leading-tight">Football<br /><span className="font-normal text-slate-500">Morning Brief</span></span>
        </Link>
        <nav aria-label="Điều hướng chính" className="grid w-full grid-cols-[repeat(5,minmax(0,1fr))] gap-0.5 text-center text-xs font-semibold sm:flex sm:w-auto sm:flex-wrap sm:gap-1 sm:text-sm">
          {([{ key: "home", href: "/", name: "Trang chủ" }, { key: "matches", href: "/matches", name: "Trận đấu" }, { key: "news", href: "/news", name: "Tin tức" }, { key: "league", href: "/league/premier-league", name: "Giải đấu" }, { key: "transfers", href: "/transfers", name: "Chuyển nhượng" }] as const).map((item) => <Link key={item.key} href={item.href} aria-current={section === item.key ? "page" : undefined} className={`min-w-0 rounded-lg px-1 py-2.5 sm:px-3 sm:py-2 ${section === item.key ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-100"}`}>{item.name}</Link>)}
        </nav>
        <Link href="/following" className="rounded-lg px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100" aria-current={section === "account" ? "page" : undefined}>Bảng tin của tôi</Link>
      </div>
    </header>
    <main id={contentId} tabIndex={-1} className={`mx-auto max-w-6xl px-4 pb-16 sm:px-6 ${section === "home" ? "pt-5 sm:pt-8" : "pt-8 sm:pt-12"}`}>{children}</main>
    <footer className="border-t border-slate-200 px-4 py-6 text-center text-xs leading-6 text-slate-500">Football Morning Brief · Một góc nhìn gọn hơn về bóng đá.<br />Giờ hiển thị: Việt Nam (UTC+7).<br /><Link href="/ghi-cong-anh" className="underline underline-offset-4">Ghi công ảnh</Link></footer>
  </div>;
}
