import Link from "next/link";
import type { PlayerProfile } from "../../services/player-hub";
import type { ClubFixtures } from "../../types/club-hub";
import { ageOn, playerHref, playerTabLabels, playerTabs, type PlayerTab } from "../../lib/player-presentation";
import { clubPath } from "../../lib/club-presentation";
import { formatMatchDate, formatMatchTime, formatUpdated } from "../../lib/match-presentation";
import { positionGroup } from "../../services/club-hub";
import { FollowLink } from "../account/follow-link";
import { PlayerPhoto } from "../ui/player-photo";
import { TeamBadge } from "../ui/team-badge";
import { safePhotoUrl } from "../../lib/player-photo";

const Fact = ({ label, value }: { label: string; value: string }) => <div className="rounded-xl bg-slate-50 px-3 py-2"><dt className="text-[11px] text-slate-500">{label}</dt><dd className="text-sm font-semibold">{value}</dd></div>;

/** Player profile from provider data only (no stats, rating or photo: none is licensed or supplied). */
export function PlayerHeader({ player, fixtures, active, now }: { player: PlayerProfile; fixtures: ClubFixtures; active: PlayerTab; now: Date }) {
  const age = ageOn(player.birthDate, now); const next = fixtures.upcoming[0];
  return <header className="mb-6 rounded-2xl border border-slate-200 bg-white px-5 pt-5 sm:px-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex min-w-0 items-center gap-4"><PlayerPhoto photoUrl={player.photo?.url} size="lg" />
        <div className="min-w-0"><h1 className="break-words text-2xl font-bold tracking-tight sm:text-3xl">{player.name}</h1>
          <p className="flex flex-wrap items-center gap-2 text-sm text-slate-500"><TeamBadge name={player.club.name} tla={player.club.tla} crestUrl={player.club.crestUrl} /><span><Link href={clubPath(player.club.clubId)} className="underline underline-offset-4">{player.club.name}</Link> · {player.club.leagueName}</span></p>{player.photo && safePhotoUrl(player.photo.url) && <p className="mt-2 text-[11px] leading-5 text-slate-500">Ảnh: {player.photo.author} · <a href={player.photo.descriptionUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">Wikimedia Commons</a> · {player.photo.licenseUrl ? <a href={player.photo.licenseUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">{player.photo.licenseName}</a> : player.photo.licenseName}</p>}</div></div>
      <FollowLink type="PLAYER" entityId={player.playerId} name={player.name} />
    </div>
    <dl className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4"><Fact label="Vị trí" value={positionGroup(player.position)} /><Fact label="Quốc tịch" value={player.nationality ?? "Chưa rõ"} /><Fact label="Tuổi" value={age === null ? "Chưa rõ" : String(age)} /><Fact label="CLB hiện tại" value={player.club.tla ?? player.club.name} /></dl>
    <p className="mt-3 text-[11px] text-slate-600">Thông tin cầu thủ theo dữ liệu football-data.org, cập nhật {formatUpdated(player.dataAsOf) ?? "chưa rõ"}. Football data provided by the Football-Data.org API.</p>
    {next && <p className="mt-3 text-sm text-slate-700"><span className="font-semibold">Trận tới của {player.club.tla ?? player.club.name}:</span> <Link href={`/match/${encodeURIComponent(next.slug)}`} className="underline underline-offset-4">{next.home.name} – {next.away.name}</Link> · {formatMatchDate(next.kickoffAt)} · {formatMatchTime(next.kickoffAt)}</p>}
    <nav aria-label="Mục của cầu thủ" className="-mx-1 mt-5 flex gap-1 overflow-x-auto pb-px">{playerTabs.map((tab) => <Link key={tab} href={playerHref(player.slug, { tab })} aria-current={tab === active ? "page" : undefined} className={`shrink-0 border-b-2 px-3 py-3 text-sm font-semibold ${tab === active ? "border-teal-600 text-teal-700" : "border-transparent text-slate-500 hover:text-slate-900"}`}>{playerTabLabels[tab]}</Link>)}</nav>
  </header>;
}
