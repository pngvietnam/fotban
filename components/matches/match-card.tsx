import Link from "next/link";
import type { MatchSummary } from "../../types/match-ui";
import { formatMatchTime, formatRound, formatUpdated, isMatchStale, matchIsoTimestamp, matchStatusLabels, scorePresentation, teamName } from "../../lib/match-presentation";
import { MatchScore } from "./match-score";
import { MatchStatusBadge } from "./match-status";
import { TeamIdentity } from "./team-identity";

export function MatchCard({ match, now }: { match: MatchSummary; now: Date }) {
  const score = scorePresentation(match);
  const updated = formatUpdated(match.lastUpdatedAt);
  return <article>
    <Link href={`/match/${encodeURIComponent(match.slug)}`} className="match-card block rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-slate-400 hover:shadow-sm sm:p-5"
      aria-label={`${teamName(match.homeClub, "home")} gặp ${teamName(match.awayClub, "away")}. ${matchStatusLabels[match.status]}. ${score.label}: ${score.text}. Xem chi tiết trận đấu.`}>
      <div className="flex items-start justify-between gap-3 text-[11px] font-medium text-slate-500">
        <span className="flex items-center gap-2"><span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${match.league.slug === "premier-league" ? "bg-violet-600" : match.league.slug === "champions-league" ? "bg-sky-600" : "bg-orange-500"}`} /><span className="text-slate-700">{match.league.name}</span></span>
        {match.round && <span className="shrink-0">{formatRound(match.round)}</span>}
      </div>
      <div className="mt-5 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 pb-5">
        <TeamIdentity team={match.homeClub} side="home" /><MatchScore match={match} /><TeamIdentity team={match.awayClub} side="away" />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
        <span className="text-xs font-medium tabular-nums text-slate-600"><time dateTime={matchIsoTimestamp(match.kickoffAt)}>{formatMatchTime(match.kickoffAt)}</time><span className="ml-1 text-slate-400">UTC+7</span></span>
        <MatchStatusBadge status={match.status} />
      </div>
      <div className="mt-3 flex flex-wrap justify-between gap-2 text-[10px] leading-4 text-slate-500">
        <span>{updated ? `Cập nhật ${updated}` : "Chưa có thời gian cập nhật"}</span>
        {isMatchStale(match, now) && <span className="text-amber-800">Có thể đã cũ</span>}
      </div>
    </Link>
  </article>;
}
