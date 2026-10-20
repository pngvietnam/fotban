import Link from "next/link";
import { matchLeagues } from "../../lib/match-leagues";
import { dayStrip, isSingleDay, matchListHref, shiftDay, uiLeagueLabels, uiStatusFilters, type MatchUiFilters } from "../../lib/match-filters";

const chip = (active: boolean) => `shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition ${active ? "border-slate-950 bg-slate-950 text-white" : "border-slate-300 bg-white text-slate-700 hover:border-slate-500"}`;

/**
 * Day-by-day navigation, like a football app: competition chips, a seven-day strip with match
 * counts (arrows move a week), status chips and a "go to date" box for anything further away.
 */
export function MatchFilters({ filters, counts = {}, now = new Date() }: { filters: MatchUiFilters; counts?: Record<string, number>; now?: Date }) {
  const selected = filters.from;
  const day = (value: string) => matchListHref(filters, { from: value, to: value, page: 1 });
  return <section aria-label="Lọc trận đấu" className="mt-8 space-y-4">
    <nav aria-label="Giải đấu" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
      <Link href={matchListHref(filters, { league: "all", page: 1 })} aria-current={filters.league === "all" ? "page" : undefined} className={chip(filters.league === "all")}>Tất cả giải</Link>
      {Object.keys(matchLeagues).map((slug) => <Link key={slug} href={matchListHref(filters, { league: slug, page: 1 })} aria-current={filters.league === slug ? "page" : undefined} className={chip(filters.league === slug)}>{uiLeagueLabels[slug as keyof typeof matchLeagues]}</Link>)}
    </nav>
    <div className="rounded-2xl border border-slate-200 bg-white p-2 sm:p-3">
      <nav aria-label="Chọn ngày" className="flex items-stretch gap-1">
        <Link href={day(shiftDay(selected, -7))} aria-label="Lùi một tuần" className="grid w-9 shrink-0 place-items-center rounded-xl text-lg text-slate-500 hover:bg-slate-100">‹</Link>
        <ol className="grid flex-1 grid-cols-7 gap-1">{dayStrip(selected, now).map((item) => {
          const active = isSingleDay(filters) && item.day === selected; const count = counts[item.day] ?? 0;
          return <li key={item.day} className="min-w-0"><Link href={day(item.day)} aria-current={active ? "date" : undefined} aria-label={`${item.label} ${item.date}: ${count ? `${count} trận` : "không có trận"}`}
            className={`flex h-full flex-col items-center rounded-xl px-0.5 py-2 text-center ${active ? "bg-slate-950 text-white" : count ? "text-slate-800 hover:bg-slate-100" : "text-slate-400 hover:bg-slate-50"}`}>
            <span className={`truncate text-[11px] font-semibold sm:text-xs ${item.today && !active ? "text-emerald-700" : ""}`}>{item.label}</span>
            <span className="text-sm font-bold tabular-nums sm:text-base">{item.date}</span>
            <span aria-hidden="true" className={`mt-1 min-w-5 rounded-full px-1.5 text-[10px] font-bold tabular-nums ${count ? active ? "bg-[#c7f36b] text-slate-950" : "bg-emerald-100 text-emerald-900" : "invisible"}`}>{count || 0}</span>
          </Link></li>;
        })}</ol>
        <Link href={day(shiftDay(selected, 7))} aria-label="Tiến một tuần" className="grid w-9 shrink-0 place-items-center rounded-xl text-lg text-slate-500 hover:bg-slate-100">›</Link>
      </nav>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <nav aria-label="Lọc theo trạng thái" className="flex flex-wrap gap-2">
        {Object.entries(uiStatusFilters).map(([status, label]) => <Link key={status} href={matchListHref(filters, { status: status as MatchUiFilters["status"], page: 1 })} aria-current={filters.status === status ? "page" : undefined}
          className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${filters.status === status ? "border-slate-950 bg-slate-950 text-white" : "border-slate-300 bg-white text-slate-600 hover:border-slate-500"}`}>{label}</Link>)}
      </nav>
      <form action="/matches" method="get" className="flex items-center gap-2 text-xs font-semibold text-slate-600">
        <label htmlFor="match-day">Đi tới ngày</label>
        <input id="match-day" name="ngay" type="date" defaultValue={selected} required className="min-h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-900" />
        {filters.league !== "all" && <input type="hidden" name="league" value={filters.league} />}
        {filters.status !== "all" && <input type="hidden" name="status" value={filters.status} />}
        <button type="submit" className="min-h-9 rounded-lg bg-slate-950 px-3 text-sm font-semibold text-white hover:bg-slate-700">Xem</button>
      </form>
    </div>
  </section>;
}
