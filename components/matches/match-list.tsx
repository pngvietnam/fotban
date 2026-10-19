import Link from "next/link";
import { formatMatchDate, groupMatchesByDate, matchDayKey } from "../../lib/match-presentation";
import { matchListHref, type MatchUiFilters } from "../../lib/match-filters";
import type { MatchListResult } from "../../services/match-ui-data";
import { MatchAttribution } from "./match-attribution";
import { MatchCard } from "./match-card";
import { MatchState } from "./match-state";

export function MatchList({ result, filters, now }: { result: MatchListResult; filters: MatchUiFilters; now: Date }) {
  if (result.kind === "error") return <MatchState kind="error" />;
  const { matches, total, page, pageSize } = result.data;
  if (!matches.length) return <MatchState kind="empty" />;
  const today = matchDayKey(now);
  return <>
    <div className="mt-8 flex items-center justify-between gap-4 text-xs text-slate-500"><p><strong className="font-semibold text-slate-800">{total}</strong> trận trong khoảng ngày đã chọn</p><p className="hidden sm:block">Giờ Việt Nam · UTC+7</p></div>
    <div className="space-y-8 pt-5">
      {groupMatchesByDate(matches).map(([date, rows]) => <section key={date} aria-labelledby={`date-${date}`}>
        <h2 id={`date-${date}`} className="mb-3 flex items-center gap-3 text-sm font-bold capitalize"><span className="h-4 w-1 rounded-full bg-[#789c2e]" aria-hidden="true" />{date === today ? "Hôm nay · " : ""}{formatMatchDate(rows[0].kickoffAt)}<span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-600">{rows.length} trận</span></h2>
        <div className="grid gap-3 md:grid-cols-2">{rows.map((match) => <MatchCard key={match.id} match={match} now={now} />)}</div>
      </section>)}
    </div>
    {total > pageSize && <nav aria-label="Phân trang trận đấu" className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-5 text-sm">
      {page > 1 ? <Link className="rounded-lg border border-slate-300 bg-white px-4 py-3 font-semibold" href={matchListHref(filters, { page: page - 1 })}>← Trang trước</Link> : <span />}
      <p className="text-xs text-slate-600">Trang {page} / {Math.ceil(total / pageSize)}</p>
      {page * pageSize < total ? <Link className="rounded-lg border border-slate-300 bg-white px-4 py-3 font-semibold" href={matchListHref(filters, { page: page + 1 })}>Trang sau →</Link> : <span />}
    </nav>}
    <MatchAttribution matches={matches} />
  </>;
}
