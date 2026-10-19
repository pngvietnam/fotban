import Link from "next/link";
import type { MyTeams } from "../../services/my-teams";
import { clubPath } from "../../lib/club-presentation";
import { leagueHref } from "../../lib/league-presentation";
import { newsAbsoluteTime, newsRelativeTime } from "../../lib/news-presentation";
import { FixtureItem } from "../league/league-hub";

/** Personal block shown only to signed-in readers; the public Brief below it is unchanged. */
export function MyTeamsSection({ data, now }: { data: MyTeams; now: Date }) {
  if (data.kind === "empty") return <section aria-labelledby="my-teams" className="mb-6 rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-4 sm:px-5">
    <h2 id="my-teams" className="text-sm font-bold">Đội của tôi</h2>
    <p className="mt-1 text-sm text-slate-600">Theo dõi một câu lạc bộ, cầu thủ hoặc giải đấu để thấy tin và lịch của họ ngay ở đây. <Link href="/account#following" className="font-semibold underline underline-offset-4">Chọn đội để theo dõi</Link></p>
  </section>;
  const chip = "inline-flex min-h-8 items-center rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-800 hover:bg-slate-100";
  return <section aria-labelledby="my-teams" className="mb-6 rounded-2xl border border-sky-200 bg-sky-50/50 px-4 py-4 sm:px-5">
    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2"><h2 id="my-teams" className="text-lg font-bold tracking-tight">Đội của tôi</h2><Link href="/following" className="text-sm font-semibold underline underline-offset-4">Xem bảng tin đầy đủ →</Link></div>
    <ul className="mb-3 flex flex-wrap gap-2">{data.summary.leagues.map((league) => <li key={league.id}><Link href={leagueHref(league.slug)} className={chip}>{league.name}</Link></li>)}{data.summary.clubs.map((club) => <li key={club.id}><Link href={clubPath(club.id)} className={chip}>{club.name}</Link></li>)}</ul>
    <div className="grid min-w-0 gap-4 lg:grid-cols-2">
      {data.upcoming.length > 0 && <div className="min-w-0 rounded-xl bg-white px-3 py-2"><h3 className="py-1 text-xs font-bold text-slate-600">Trận sắp tới</h3><ul>{data.upcoming.map((fixture) => <FixtureItem key={fixture.slug} fixture={fixture} />)}</ul></div>}
      {data.groups.length > 0 && <div className="min-w-0 rounded-xl bg-white px-3 py-2"><h3 className="py-1 text-xs font-bold text-slate-600">Tin mới cho bạn</h3><ul className="divide-y divide-slate-100">{data.groups.map((group) => <li key={group.key} className="py-2.5">
        <p className="text-[11px] text-slate-500">{group.lead.attribution} · <time dateTime={group.lead.publishedAt} title={newsAbsoluteTime(group.lead.publishedAt)}>{newsRelativeTime(group.lead.publishedAt, now)}</time></p>
        <Link href={`/news/${group.lead.slug}`} className="break-words text-sm font-semibold leading-snug underline-offset-4 hover:underline">{group.lead.title}</Link></li>)}</ul></div>}
      {data.upcoming.length === 0 && data.groups.length === 0 && <p className="text-sm text-slate-600">Chưa có trận hay tin mới về những gì bạn theo dõi.</p>}
    </div>
  </section>;
}
