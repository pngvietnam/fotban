import Link from "next/link";
import type { MatchDetail } from "../../types/match-ui";
import { formatMatchDate, formatMatchTime, formatRound, formatUpdated, isMatchStale, teamName } from "../../lib/match-presentation";
import { MatchAttribution } from "./match-attribution";
import { MatchScore } from "./match-score";
import { MatchStatusBadge } from "./match-status";
import { TeamIdentity } from "./team-identity";
import { FollowLink } from "../account/follow-link";
import { MatchHighlight } from "./match-highlight";
import type { VerifiedHighlight } from "../../types/video-provider";

const eventLabels: Record<string, string> = { GOAL: "Bàn thắng", OWN_GOAL: "Phản lưới", PENALTY: "Phạt đền", YELLOW_CARD: "Thẻ vàng", RED_CARD: "Thẻ đỏ", SUBSTITUTION: "Thay người", OTHER: "Sự kiện" };
const statLabels: Record<string, string> = { shots: "Số cú sút", shots_on_goal: "Sút trúng đích", ball_possession: "Kiểm soát bóng", corner_kicks: "Phạt góc", fouls: "Phạm lỗi", saves: "Cứu thua" };

export function MatchDetailView({ match, now, highlight }: { match: MatchDetail; now: Date; highlight?: VerifiedHighlight | null }) {
  const updated = formatUpdated(match.lastUpdatedAt);
  return <>
    <Link href="/matches" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-950"><span aria-hidden="true">←</span> Các trận đấu</Link>
    <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
      <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{match.league.name}{match.round ? ` · ${formatRound(match.round)}` : ""}</p><h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Chi tiết trận đấu</h1></div>
      <MatchStatusBadge status={match.status} />
    </div>
    <section aria-label={`${teamName(match.homeClub, "home", true)} gặp ${teamName(match.awayClub, "away", true)}`} className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="h-1.5 bg-[#c7f36b]" />
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 px-3 py-9 sm:gap-6 sm:px-12 sm:py-14">
        <TeamIdentity team={match.homeClub} side="home" large /><MatchScore match={match} large /><TeamIdentity team={match.awayClub} side="away" large />
      </div>
      <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 border-t border-slate-100 bg-slate-50 px-5 py-4 text-center text-xs leading-6 text-slate-600">
        <span><strong className="font-semibold text-slate-900">{formatMatchTime(match.kickoffAt)}</strong> · {formatMatchDate(match.kickoffAt, true)}</span>
        <span>{match.venue || "Chưa có dữ liệu sân đấu"}</span>
      </div>
    </section>
    <section aria-labelledby="match-info" className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      <h2 id="match-info" className="text-base font-bold">Thông tin trận đấu</h2>
      <dl className="mt-5 grid gap-x-8 gap-y-5 text-sm sm:grid-cols-2 lg:grid-cols-3">
        {[["Giải đấu", match.league.name], ["Mùa giải", match.season.name], ["Vòng đấu", formatRound(match.round) || "Chưa có dữ liệu"], ["Giờ thi đấu", `${formatMatchTime(match.kickoffAt)} · ${formatMatchDate(match.kickoffAt, true)}`], ["Sân vận động", match.venue || "Chưa có dữ liệu"], ["Cập nhật dữ liệu", updated || "Chưa có thời gian cập nhật"]].map(([label, value]) => <div key={label}><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1.5 font-medium leading-6 text-slate-900">{value}</dd></div>)}
      </dl>
      <p className="mt-5 border-t border-slate-100 pt-4 text-xs leading-6 text-slate-500">Giờ Việt Nam · Asia/Ho_Chi_Minh (UTC+7).{isMatchStale(match, now) ? " Dữ liệu có thể đã cũ; trạng thái hiện tại có thể chưa được cập nhật." : ""}</p>
    </section>
    {match.events.length > 0 && <section aria-labelledby="match-events" className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      <h2 id="match-events" className="font-bold">Diễn biến đã ghi nhận</h2>
      <ol className="mt-4 divide-y divide-slate-100">{match.events.map((event, index) => <li key={index} className="flex gap-4 py-4 text-sm">
        <span className="w-12 shrink-0 font-bold tabular-nums text-slate-700">{event.minute == null ? "—" : `${event.minute}${event.addedMinute ? `+${event.addedMinute}` : ""}′`}</span>
        <div><p className="font-semibold">{eventLabels[event.type] ?? "Sự kiện"}{event.player?.name ? ` · ${event.player.name}` : ""}</p>{event.club && <p className="mt-1 text-xs text-slate-500">{event.club.name}</p>}{event.relatedPlayer && <p className="mt-1 text-xs text-slate-600">Liên quan: {event.relatedPlayer.name}</p>}{event.detail && <p className="mt-1 text-xs leading-5 text-slate-600">{event.detail}</p>}</div>
      </li>)}</ol>
    </section>}
    {match.stats.length > 0 && <section aria-labelledby="match-stats" className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      <h2 id="match-stats" className="font-bold">Thống kê đã ghi nhận</h2>
      <dl className="mt-4 divide-y divide-slate-100">{match.stats.map((stat, index) => <div key={index} className="flex justify-between gap-4 py-3 text-sm"><dt><span className="font-medium">{statLabels[stat.metric] ?? stat.metric.replaceAll("_", " ")}</span><span className="mt-1 block text-xs text-slate-500">{stat.club.name}{stat.player ? ` · ${stat.player.name}` : ""}</span></dt><dd className="shrink-0 font-bold tabular-nums">{stat.value}{stat.unit ? ` ${stat.unit}` : ""}</dd></div>)}</dl>
    </section>}
    <div aria-label="Theo dõi đội bóng và giải đấu" className="mt-6 flex flex-wrap gap-2">
      {match.homeClub?.id && <FollowLink type="CLUB" entityId={match.homeClub.id} name={teamName(match.homeClub, "home", true)} />}
      {match.awayClub?.id && <FollowLink type="CLUB" entityId={match.awayClub.id} name={teamName(match.awayClub, "away", true)} />}
      {match.league.id && <FollowLink type="COMPETITION" entityId={match.league.id} name={match.league.name} />}
    </div>
    {match.status === "FINISHED" && <MatchHighlight highlight={highlight} />}
    <MatchAttribution matches={[match]} />
  </>;
}
