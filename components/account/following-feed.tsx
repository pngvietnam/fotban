import Link from "next/link";
import type { FollowSummary } from "../../services/following-feed";
import { clubPath } from "../../lib/club-presentation";
import { leagueHref } from "../../lib/league-presentation";

/** What the reader follows, with links to each club or league hub. Players have no page yet and stay plain text. */
export function FollowSummaryView({ summary }: { summary: FollowSummary }) {
  const chip = "inline-flex min-h-9 items-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-100";
  return <section aria-labelledby="following-summary" className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2"><h2 id="following-summary" className="text-sm font-bold">Bạn đang theo dõi</h2><Link href="/account#following" className="text-sm font-semibold underline underline-offset-4">Quản lý theo dõi</Link></div>
    <ul className="flex flex-wrap gap-2">
      {summary.leagues.map((league) => <li key={league.id}><Link href={leagueHref(league.slug)} className={chip}>{league.name}</Link></li>)}
      {summary.clubs.map((club) => <li key={club.id}><Link href={clubPath(club.id)} className={chip}>{club.name}</Link></li>)}
      {summary.players.map((player) => <li key={player.id}><span className="inline-flex min-h-9 items-center rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700">{player.name}</span></li>)}
    </ul>
  </section>;
}
export function FollowingEmpty() {
  return <section aria-labelledby="following-empty" className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
    <h2 id="following-empty" className="text-xl font-bold">Chưa có gì để hiển thị</h2>
    <p className="mx-auto mt-3 max-w-lg text-sm leading-7 text-slate-600">Theo dõi một câu lạc bộ, cầu thủ hoặc giải đấu để thấy tin tức, lịch thi đấu, kết quả và chuyển nhượng của họ gom về một chỗ.</p>
    <div className="mt-5 flex flex-wrap justify-center gap-3"><Link href="/account#following" className="rounded-lg bg-slate-950 px-5 py-3 text-sm font-semibold text-white">Chọn đội để theo dõi</Link><Link href="/league/premier-league?tab=doi-bong" className="rounded-lg border border-slate-300 px-5 py-3 text-sm font-semibold">Xem đội Ngoại hạng Anh</Link><Link href="/league/la-liga?tab=doi-bong" className="rounded-lg border border-slate-300 px-5 py-3 text-sm font-semibold">Xem đội La Liga</Link></div>
  </section>;
}
