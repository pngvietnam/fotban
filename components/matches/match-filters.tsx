import Link from "next/link";
import { matchLeagues } from "../../lib/match-leagues";
import { matchListHref, uiStatusFilters, type MatchUiFilters } from "../../lib/match-filters";

export function MatchFilters({ filters }: { filters: MatchUiFilters }) {
  const inputClass = "mt-1.5 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900";
  return <section aria-label="Lọc trận đấu" className="mt-8">
    <form action="/matches" method="get" className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-[1.4fr_1fr_1fr_auto] lg:items-end">
      <div className="text-xs font-semibold text-slate-600"><label htmlFor="match-league">Giải đấu</label><select id="match-league" name="league" defaultValue={filters.league} className={inputClass}><option value="all">Cả hai giải đấu</option>{Object.entries(matchLeagues).map(([slug, league]) => <option key={slug} value={slug}>{league.name}</option>)}</select></div>
      <div className="text-xs font-semibold text-slate-600"><label htmlFor="match-from">Từ ngày</label><input id="match-from" name="from" type="date" defaultValue={filters.from} required className={inputClass} /></div>
      <div className="text-xs font-semibold text-slate-600"><label htmlFor="match-to">Đến ngày</label><input id="match-to" name="to" type="date" defaultValue={filters.to} required className={inputClass} /></div>
      <input type="hidden" name="status" value={filters.status} />
      <button className="min-h-11 rounded-lg bg-slate-950 px-6 text-sm font-semibold text-white hover:bg-slate-700" type="submit">Xem trận đấu <span aria-hidden="true" className="ml-2">→</span></button>
    </form>
    <nav aria-label="Lọc theo trạng thái" className="mt-5 flex flex-wrap gap-2">
      {Object.entries(uiStatusFilters).map(([status, label]) => <Link key={status} href={matchListHref(filters, { status: status as MatchUiFilters["status"], page: 1 })} aria-current={filters.status === status ? "page" : undefined} className={`rounded-full border px-4 py-2 text-xs font-semibold transition ${filters.status === status ? "border-slate-950 bg-slate-950 text-white" : "border-slate-300 bg-white text-slate-600 hover:border-slate-500"}`}>{label}</Link>)}
    </nav>
  </section>;
}
