import Link from "next/link";
import type { ClubRow, FixtureRow, LeagueInfo, LeagueTab, StandingsData } from "../../types/league-hub";
import { leagueTabs } from "../../types/league-hub";
import { clubPath } from "../../lib/club-presentation";
import { fixtureWindow, leagueHref, leagueLinks, leagueTabLabels, resultLabel, resultText } from "../../lib/league-presentation";
import { formatMatchDate, formatMatchTime, formatUpdated, matchDayKey, matchStatusLabels } from "../../lib/match-presentation";
import { FollowLink } from "../account/follow-link";

const monogram = (name: string, tla: string | null) => (tla?.trim() || name.split(/\s+/).slice(0, 2).map((word) => Array.from(word)[0]).join("")).slice(0, 4).toLocaleUpperCase("vi-VN");
const Badge = ({ name, tla }: { name: string; tla: string | null }) => <span aria-hidden="true" className="grid h-8 min-w-8 shrink-0 place-items-center rounded-lg border border-slate-200 bg-slate-50 px-1 text-[10px] font-bold text-slate-600">{monogram(name, tla)}</span>;
const attribution = <p className="mt-3 text-[11px] text-slate-500">Football data provided by the Football-Data.org API.</p>;

/** Header with the league switcher and the six tabs. No crests or logos: only licensed text/initials. */
export function LeagueHeader({ league, active, from }: { league: LeagueInfo; active: LeagueTab; from?: string }) {
  return <header className="mb-6 rounded-2xl border border-slate-200 bg-white px-5 pt-5 sm:px-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex items-center gap-4"><span aria-hidden="true" className="grid h-14 w-14 place-items-center rounded-2xl bg-slate-950 text-sm font-bold text-[#c7f36b]">{league.slug === "la-liga" ? "LL" : "NHA"}</span>
        <div><h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{league.name}</h1><p className="text-sm text-slate-500">{league.country}{league.seasonName ? ` · Mùa giải ${league.seasonName}` : ""}</p></div></div>
      <nav aria-label="Chọn giải đấu" className="flex gap-2">{leagueLinks.map((item) => <Link key={item.slug} href={leagueHref(item.slug, { tab: active })} aria-current={item.slug === league.slug ? "page" : undefined} className={`rounded-lg border px-3 py-2 text-xs font-semibold ${item.slug === league.slug ? "border-slate-950 bg-slate-950 text-white" : "border-slate-300 bg-white text-slate-700"}`}>{item.label}</Link>)}</nav>
    </div>
    <nav aria-label="Mục của giải đấu" className="-mx-1 mt-5 flex gap-1 overflow-x-auto pb-px">{leagueTabs.map((tab) => <Link key={tab} href={leagueHref(league.slug, { tab, ...(tab === "lich-thi-dau" && from ? { from } : {}) })} aria-current={tab === active ? "page" : undefined} className={`shrink-0 border-b-2 px-3 py-3 text-sm font-semibold ${tab === active ? "border-teal-600 text-teal-700" : "border-transparent text-slate-500 hover:text-slate-900"}`}>{leagueTabLabels[tab]}</Link>)}</nav>
  </header>;
}

export function FormChips({ form }: { form: ("W" | "D" | "L")[] }) {
  if (!form.length) return <span className="text-xs text-slate-400">—</span>;
  const tone = { W: "bg-emerald-600", D: "bg-slate-400", L: "bg-rose-600" } as const;
  return <ul aria-label={`Phong độ: ${form.map((result) => resultText[result]).join(", ")}`} className="flex gap-1">{form.map((result, index) => <li key={index} aria-hidden="true" className={`grid h-5 w-5 place-items-center rounded text-[10px] font-bold text-white ${tone[result]}`}>{resultLabel[result]}</li>)}</ul>;
}
export function StandingsTable({ data, league, limit }: { data: StandingsData; league: LeagueInfo; limit?: number }) {
  if (!data.rows.length) return <p role="status" className="rounded-xl border border-dashed border-slate-300 bg-white px-5 py-8 text-center text-sm text-slate-600">Chưa có dữ liệu bảng xếp hạng.</p>;
  const rows = limit ? data.rows.slice(0, limit) : data.rows;
  return <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
    <h2 className="mb-4 text-sm font-bold">BXH {league.name}{league.seasonName ? ` ${league.seasonName}` : ""}</h2>
    <div className="overflow-x-auto"><table className="w-full min-w-[320px] text-sm">
      <caption className="sr-only">Bảng xếp hạng {league.name}</caption>
      <thead className="text-[11px] text-slate-500"><tr><th scope="col" className="w-8 py-2 text-left">#</th><th scope="col" className="py-2 text-left">Đội bóng</th><th scope="col" className="px-1 text-right">Trận</th><th scope="col" className="hidden px-1 text-right sm:table-cell">Thắng</th><th scope="col" className="hidden px-1 text-right sm:table-cell">Hòa</th><th scope="col" className="hidden px-1 text-right sm:table-cell">Thua</th><th scope="col" className="hidden px-1 text-right sm:table-cell">+/-</th><th scope="col" className="px-1 text-right">HS</th><th scope="col" className="px-2 text-right">Điểm</th><th scope="col" className="hidden py-2 pl-3 text-left md:table-cell">Trận gần nhất</th></tr></thead>
      <tbody>{rows.map((row) => <tr key={row.clubId} className="border-t border-slate-100">
        <td className="py-2.5 text-slate-500">{row.position}</td>
        <td className="py-2.5"><span className="flex min-w-0 items-center gap-2"><Badge name={row.name} tla={row.tla} /><Link href={clubPath(row.clubId)} className="min-w-0 break-words font-semibold hover:underline">{row.shortName?.trim() || row.name}</Link></span></td>
        <td className="px-1 text-right tabular-nums">{row.played ?? "—"}</td>
        <td className="hidden px-1 text-right tabular-nums sm:table-cell">{row.won ?? "—"}</td><td className="hidden px-1 text-right tabular-nums sm:table-cell">{row.drawn ?? "—"}</td><td className="hidden px-1 text-right tabular-nums sm:table-cell">{row.lost ?? "—"}</td>
        <td className="hidden px-1 text-right tabular-nums sm:table-cell">{row.goalsFor ?? "—"} - {row.goalsAgainst ?? "—"}</td>
        <td className="px-1 text-right tabular-nums">{row.goalDifference ?? "—"}</td><td className="px-2 text-right font-bold tabular-nums">{row.points ?? "—"}</td>
        <td className="hidden py-2.5 pl-3 md:table-cell"><FormChips form={row.form} /></td>
      </tr>)}</tbody></table></div>
    <p className="mt-3 text-[11px] text-slate-500">{data.fetchedAt ? `Cập nhật lúc ${formatUpdated(data.fetchedAt)} · ` : ""}T: thắng · H: hòa · B: thua (5 trận gần nhất, từ kết quả đã lưu)</p>
    {attribution}
  </div>;
}

export function FixtureItem({ fixture }: { fixture: FixtureRow }) {
  const finished = fixture.status === "FINISHED" && fixture.homeScore !== null && fixture.awayScore !== null;
  const label = finished ? matchStatusLabels.FINISHED : fixture.status in matchStatusLabels ? matchStatusLabels[fixture.status as keyof typeof matchStatusLabels] : "Chưa rõ";
  return <li><Link href={`/match/${encodeURIComponent(fixture.slug)}`} className="grid min-w-0 grid-cols-[4.5rem_minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 border-t border-slate-100 px-1 py-3 text-sm hover:bg-slate-50 sm:grid-cols-[6rem_minmax(0,1fr)_5rem_minmax(0,1fr)]" aria-label={`${fixture.home.name} gặp ${fixture.away.name}${finished ? `, kết quả ${fixture.homeScore} - ${fixture.awayScore}` : `, ${label}`}`}>
    <span className="text-[11px] text-slate-500">{label}</span>
    <span className="flex min-w-0 items-center justify-end gap-2 text-right font-semibold"><span className="min-w-0 break-words">{fixture.home.name}</span><Badge name={fixture.home.name} tla={fixture.home.tla} /></span>
    <span className="text-center font-bold tabular-nums">{finished ? `${fixture.homeScore} - ${fixture.awayScore}` : ["POSTPONED", "CANCELLED", "SUSPENDED"].includes(fixture.status) ? "—" : formatMatchTime(fixture.kickoffAt)}</span>
    <span className="flex min-w-0 items-center gap-2 font-semibold"><Badge name={fixture.away.name} tla={fixture.away.tla} /><span className="min-w-0 break-words">{fixture.away.name}</span></span>
  </Link></li>;
}
export function FixtureList({ fixtures, league, from, now }: { fixtures: FixtureRow[]; league: LeagueInfo; from: string; now: Date }) {
  const window = fixtureWindow(from, now);
  const days = [...new Map(fixtures.map((fixture) => [matchDayKey(fixture.kickoffAt), fixtures.filter((item) => matchDayKey(item.kickoffAt) === matchDayKey(fixture.kickoffAt))])).entries()];
  const fmt = (day: string) => new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(`${day}T00:00:00+07:00`));
  return <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
    <div className="mb-3 flex items-center justify-between gap-2">
      {window.prev ? <Link href={leagueHref(league.slug, { tab: "lich-thi-dau", from: window.prev })} aria-label="Tuần trước" className="grid h-9 w-9 place-items-center rounded-lg border border-slate-300">←</Link> : <span className="h-9 w-9" />}
      <h2 className="text-center text-sm font-bold">{fmt(from)} – {fmt(window.last)}</h2>
      {window.next ? <Link href={leagueHref(league.slug, { tab: "lich-thi-dau", from: window.next })} aria-label="Tuần sau" className="grid h-9 w-9 place-items-center rounded-lg border border-slate-300">→</Link> : <span className="h-9 w-9" />}
    </div>
    {!days.length && <p role="status" className="rounded-xl border border-dashed border-slate-300 px-5 py-8 text-center text-sm text-slate-600">Không có trận nào trong khoảng thời gian này.</p>}
    {days.map(([day, items]) => <section key={day} aria-labelledby={`day-${day}`} className="mb-3"><h3 id={`day-${day}`} className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold capitalize text-slate-700">{formatMatchDate(items[0].kickoffAt, true)}</h3><ul>{items.map((fixture) => <FixtureItem key={fixture.slug} fixture={fixture} />)}</ul></section>)}
    <p className="mt-2 text-[11px] text-slate-500">Giờ Việt Nam (UTC+7). Dữ liệu lấy từ kết quả đã lưu, không phải trực tiếp từng giây.</p>
    {attribution}
  </div>;
}
export function UpcomingStrip({ fixtures, league }: { fixtures: FixtureRow[]; league: LeagueInfo }) {
  if (!fixtures.length) return null;
  return <section aria-labelledby="upcoming" className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
    <div className="mb-3 flex items-baseline justify-between gap-2"><h2 id="upcoming" className="text-sm font-bold">Lịch thi đấu {league.name}</h2><Link href={leagueHref(league.slug, { tab: "lich-thi-dau" })} className="text-sm font-semibold underline underline-offset-4">Xem tất cả →</Link></div>
    <ul className="grid gap-2 sm:grid-cols-2">{fixtures.map((fixture) => <li key={fixture.slug}><Link href={`/match/${encodeURIComponent(fixture.slug)}`} className="block rounded-xl border border-slate-200 px-4 py-3 text-center text-sm hover:bg-slate-50"><span className="block text-[11px] text-slate-500">{formatMatchDate(fixture.kickoffAt)} · {formatMatchTime(fixture.kickoffAt)}</span><span className="mt-1 block font-semibold">{fixture.home.name} – {fixture.away.name}</span></Link></li>)}</ul>
  </section>;
}
export function ClubGrid({ clubs }: { clubs: ClubRow[] }) {
  if (!clubs.length) return <p role="status" className="rounded-xl border border-dashed border-slate-300 bg-white px-5 py-8 text-center text-sm text-slate-600">Chưa có danh sách đội bóng.</p>;
  return <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{clubs.map((club) => <li key={club.clubId} className="flex min-w-0 items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4">
    <span className="flex min-w-0 items-center gap-3"><Badge name={club.name} tla={club.tla} /><span className="min-w-0"><Link href={clubPath(club.clubId)} className="block break-words font-semibold hover:underline">{club.shortName?.trim() || club.name}</Link><span className="block text-xs text-slate-500">{club.position ? `Hạng ${club.position}${club.points !== null ? ` · ${club.points} điểm` : ""}` : "Chưa có thứ hạng"}</span></span></span>
    <FollowLink type="CLUB" entityId={club.clubId} name={club.shortName?.trim() || club.name} />
  </li>)}</ul>;
}
