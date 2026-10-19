import Link from "next/link";
import type { ClubFixtures, ClubProfile, ClubStanding, ClubTab, SquadPlayer } from "../../types/club-hub";
import { clubTabs } from "../../types/club-hub";
import { playerPath } from "../../lib/player-presentation";
import { clubHref, clubTabLabels } from "../../lib/club-presentation";
import { leagueHref } from "../../lib/league-presentation";
import { formatMatchDate, formatMatchTime } from "../../lib/match-presentation";
import { positionGroup, positionOrder } from "../../services/club-hub";
import { FollowLink } from "../account/follow-link";
import { TeamBadge } from "../ui/team-badge";
import { FixtureItem, FormChips } from "../league/league-hub";

const Stat = ({ label, value }: { label: string; value: string }) => <div className="rounded-xl bg-slate-50 px-3 py-2 text-center"><dt className="text-[11px] text-slate-500">{label}</dt><dd className="text-lg font-bold tabular-nums">{value}</dd></div>;

/** Club "profile": identity, table position, form, next match and the tabs. Text badge only, no crest. */
export function ClubHeader({ club, standing, next, active }: { club: ClubProfile; standing: ClubStanding | null; next: ClubFixtures["upcoming"][number] | null; active: ClubTab }) {
  const row = standing?.row; const display = club.shortName?.trim() || club.name;
  return <header className="mb-6 rounded-2xl border border-slate-200 bg-white px-5 pt-5 sm:px-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex min-w-0 items-center gap-4"><TeamBadge name={club.name} tla={club.tla} crestUrl={club.crestUrl} size="lg" />
        <div className="min-w-0"><h1 className="break-words text-2xl font-bold tracking-tight sm:text-3xl">{club.name}</h1>
          <p className="text-sm text-slate-500">{club.league ? <Link href={leagueHref(club.league.slug)} className="underline underline-offset-4">{club.league.name}</Link> : null}{club.league?.seasonName ? ` · ${club.league.seasonName}` : ""}{club.venue ? ` · Sân ${club.venue}` : ""}</p></div></div>
      <FollowLink type="CLUB" entityId={club.clubId} name={display} />
    </div>
    {row && <dl className="mt-5 grid grid-cols-3 gap-2 sm:grid-cols-5"><Stat label="Hạng" value={String(row.position)} /><Stat label="Điểm" value={row.points === null ? "—" : String(row.points)} /><Stat label="Trận" value={row.played === null ? "—" : String(row.played)} /><Stat label="Hiệu số" value={row.goalDifference === null ? "—" : String(row.goalDifference)} /><div className="col-span-3 rounded-xl bg-slate-50 px-3 py-2 sm:col-span-1"><dt className="text-center text-[11px] text-slate-500">Phong độ</dt><dd className="mt-1.5 flex justify-center"><FormChips form={row.form} /></dd></div></dl>}
    {next && <p className="mt-4 text-sm text-slate-700"><span className="font-semibold">Trận tới:</span> <Link href={`/match/${encodeURIComponent(next.slug)}`} className="underline underline-offset-4">{next.home.name} – {next.away.name}</Link> · {formatMatchDate(next.kickoffAt)} · {formatMatchTime(next.kickoffAt)}</p>}
    <nav aria-label="Mục của câu lạc bộ" className="-mx-1 mt-5 flex gap-1 overflow-x-auto pb-px">{clubTabs.map((tab) => <Link key={tab} href={clubHref(club.slug, { tab })} aria-current={tab === active ? "page" : undefined} className={`shrink-0 border-b-2 px-3 py-3 text-sm font-semibold ${tab === active ? "border-teal-600 text-teal-700" : "border-transparent text-slate-500 hover:text-slate-900"}`}>{clubTabLabels[tab]}</Link>)}</nav>
  </header>;
}
export function ClubFixtureLists({ fixtures }: { fixtures: ClubFixtures }) {
  const block = (title: string, id: string, items: ClubFixtures["recent"], empty: string) => <section aria-labelledby={id} className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5"><h2 id={id} className="mb-2 text-sm font-bold">{title}</h2>{items.length ? <ul>{items.map((fixture) => <FixtureItem key={fixture.slug} fixture={fixture} />)}</ul> : <p className="py-4 text-sm text-slate-600">{empty}</p>}</section>;
  return <div className="space-y-6">{block("Lịch thi đấu sắp tới", "club-upcoming", fixtures.upcoming, "Chưa có lịch thi đấu sắp tới.")}{block("Kết quả gần đây", "club-recent", fixtures.recent, "Chưa có kết quả đã lưu.")}
    <p className="text-[11px] text-slate-500">Giờ Việt Nam (UTC+7). Football data provided by the Football-Data.org API.</p></div>;
}
export function Squad({ players }: { players: SquadPlayer[] }) {
  if (!players.length) return <p role="status" className="rounded-xl border border-dashed border-slate-300 bg-white px-5 py-8 text-center text-sm text-slate-600">Chưa có danh sách cầu thủ.</p>;
  const groups = positionOrder.map((name) => [name, players.filter((player) => positionGroup(player.position) === name)] as const).filter(([, items]) => items.length);
  return <div className="space-y-6">{groups.map(([name, items]) => <section key={name} aria-labelledby={`squad-${name}`}><h2 id={`squad-${name}`} className="mb-2 text-sm font-bold">{name} ({items.length})</h2>
    <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{items.map((player) => <li key={player.playerId} className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3"><span className="min-w-0"><Link href={playerPath(player.playerId)} className="block break-words text-sm font-semibold hover:underline">{player.name}</Link><span className="block text-xs text-slate-500">{player.nationality ?? "Chưa rõ quốc tịch"}</span></span><FollowLink type="PLAYER" entityId={player.playerId} name={player.name} /></li>)}</ul></section>)}
    <p className="text-[11px] text-slate-500">Danh sách theo lần đồng bộ gần nhất của nhà cung cấp dữ liệu; có thể chưa phản ánh chuyển nhượng mới.</p></div>;
}
