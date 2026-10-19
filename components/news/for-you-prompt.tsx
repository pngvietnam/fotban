import Link from "next/link";

/** Shown to someone with no followed teams yet: the tab then lists the day's top stories. */
export function ForYouPrompt({ signedIn }: { signedIn: boolean }) {
  return <aside className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4">
    <p className="min-w-0 flex-1 text-sm leading-6 text-slate-700"><strong className="font-bold text-slate-950">Theo dõi đội bóng để có bảng tin riêng.</strong> Tin, lịch và kết quả của đội bạn sẽ hiện ngay tại đây.</p>
    <Link href={signedIn ? "/league/premier-league?tab=doi-bong" : `/login?returnTo=${encodeURIComponent("/news")}`} className="rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white">{signedIn ? "Chọn đội bóng" : "Đăng nhập để theo dõi"}</Link>
  </aside>;
}
