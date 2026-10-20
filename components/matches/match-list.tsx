import Link from "next/link";
import { formatMatchDate, groupMatchesByDate, matchDayKey } from "../../lib/match-presentation";
import { isSingleDay, longDay, matchListHref, uiLeagueLabels, type MatchUiFilters } from "../../lib/match-filters";
import { matchLeagues } from "../../lib/match-leagues";
import type { MatchSummary } from "../../types/match-ui";
import type { MatchListResult } from "../../services/match-ui-data";
import { MatchAttribution } from "./match-attribution";
import { MatchCard } from "./match-card";
import { MatchState } from "./match-state";

/** A day without matches points to the nearest days that have some. */
function EmptyDay({ filters, nearest }: { filters: MatchUiFilters; nearest: { previous: string | null; next: string | null } }) {
  const link = (day: string) => matchListHref(filters, { from: day, to: day, page: 1 });
  return <section role="status" className="my-8 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
    <h2 className="text-lg font-bold">Không có trận đấu ngày {longDay(filters.from)}</h2>
    <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">{nearest.previous || nearest.next ? "Ngày gần nhất có trận:" : "Chưa có lịch thi đấu nào được lưu cho lựa chọn này."}</p>
    <div className="mt-5 flex flex-wrap justify-center gap-3">
      {nearest.previous && <Link href={link(nearest.previous)} className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold hover:border-slate-500">← {longDay(nearest.previous)}</Link>}
      {nearest.next && <Link href={link(nearest.next)} className="rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700">{longDay(nearest.next)} →</Link>}
    </div>
  </section>;
}
/** One day's matches grouped by competition, in the order the competitions are listed. */
function groupByLeague(matches: MatchSummary[]) {
  const order = Object.keys(matchLeagues);
  const groups = new Map<string, MatchSummary[]>();
  for (const match of matches) groups.set(match.league.slug, [...(groups.get(match.league.slug) ?? []), match]);
  return [...groups.entries()].sort(([a], [b]) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99));
}
export function MatchList({ result, filters, now, nearest }: { result: MatchListResult; filters: MatchUiFilters; now: Date; nearest?: { previous: string | null; next: string | null } }) {
  if (result.kind === "error") return <MatchState kind="error" />;
  const { matches, total, page, pageSize } = result.data;
  if (!matches.length) return isSingleDay(filters) && nearest ? <EmptyDay filters={filters} nearest={nearest} /> : <MatchState kind="empty" />;
  const today = matchDayKey(now);
  const single = isSingleDay(filters);
  return <>
    <div className="mt-6 flex items-center justify-between gap-4 text-xs text-slate-500"><p className="first-letter:uppercase"><strong className="font-semibold text-slate-800">{total} trận</strong> · {single ? `${filters.from === today ? "Hôm nay, " : ""}${longDay(filters.from)}` : "trong khoảng ngày đã chọn"}</p><p className="hidden sm:block">Giờ Việt Nam · UTC+7</p></div>
    <div className="space-y-8 pt-5">
      {single ? groupByLeague(matches).map(([slug, rows]) => <section key={slug} aria-labelledby={`league-${slug}`}>
        <h2 id={`league-${slug}`} className="mb-3 flex items-center gap-3 text-sm font-bold"><span className="h-4 w-1 rounded-full bg-[#789c2e]" aria-hidden="true" />{uiLeagueLabels[slug as keyof typeof uiLeagueLabels] ?? rows[0].league.name}<span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-600">{rows.length} trận</span></h2>
        <div className="grid gap-3 md:grid-cols-2">{rows.map((match) => <MatchCard key={match.id} match={match} now={now} />)}</div>
      </section>) : groupMatchesByDate(matches).map(([date, rows]) => <section key={date} aria-labelledby={`date-${date}`}>
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
