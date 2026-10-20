import Link from "next/link";
import type { MatchDetail } from "../../types/match-ui";
import { formatMatchDate, formatMatchTime, formatPersonName, formatRound, formatUpdated, isMatchStale, teamName } from "../../lib/match-presentation";
import { MatchAttribution } from "./match-attribution";
import { MatchScore } from "./match-score";
import { MatchStatusBadge } from "./match-status";
import { TeamIdentity } from "./team-identity";
import { FollowLink } from "../account/follow-link";
import { MatchHighlight } from "./match-highlight";
import type { VerifiedHighlight } from "../../types/video-provider";
import type { ReactNode } from "react";
import type { MatchHub } from "../../services/match-hub";
import { matchTabHref, type MatchTab } from "../../lib/match-tabs";
import { MatchTabsView } from "./match-tabs";
import { LineupsView } from "./match-lineups";
import { EventsList, FormPanel, HeadToHeadPanel, MatchReviewCard, NextMatches, Scorers, StandingsPanel, StatsList, TopStats, Unavailable } from "./match-tab-views";
import type { MatchReview } from "../../lib/match-review";

export function MatchDetailView({ match, now, highlight, tab = "du-kien", hub, news, review }: { match: MatchDetail; now: Date; highlight?: VerifiedHighlight | null; tab?: MatchTab; hub?: MatchHub | null; /** Related stories, rendered on the Dữ kiện tab. */ news?: ReactNode; /** The lead publisher story about this match. */ review?: MatchReview | null }) {
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
      <Scorers match={match} />
      <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 border-t border-slate-100 bg-slate-50 px-5 py-4 text-center text-xs leading-6 text-slate-600">
        <span><strong className="font-semibold text-slate-900">{formatMatchTime(match.kickoffAt)}</strong> · {formatMatchDate(match.kickoffAt, true)}</span>
        <span>{match.venue || "Chưa có dữ liệu sân đấu"}</span>
      </div>
    </section>
    <MatchTabsView slug={match.slug} active={tab} />
    {tab === "du-kien" && <div className="mt-6 space-y-6">
      {review && <MatchReviewCard review={review} now={now} />}
      <TopStats match={match} href={matchTabHref(match.slug, "thong-ke")} />
      {match.events.length > 0 && <EventsList match={match} />}
      {hub && <FormPanel match={match} hub={hub} />}
      {hub && <NextMatches match={match} hub={hub} />}
      {news}
      {match.status === "FINISHED" && <MatchHighlight highlight={highlight} />}
      <section aria-labelledby="match-info" className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <h2 id="match-info" className="text-base font-bold">Thông tin trận đấu</h2>
        <dl className="mt-5 grid gap-x-8 gap-y-5 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {[["Giải đấu", match.league.name], ["Mùa giải", match.season.name], ["Vòng đấu", formatRound(match.round) || "Chưa có dữ liệu"], ["Giờ thi đấu", `${formatMatchTime(match.kickoffAt)} · ${formatMatchDate(match.kickoffAt, true)}`], ["Sân vận động", match.venue || "Chưa có dữ liệu"], ["Trọng tài", formatPersonName(match.referee) || "Chưa có dữ liệu"], ["Cập nhật dữ liệu", updated || "Chưa có thời gian cập nhật"]].map(([label, value]) => <div key={label}><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1.5 font-medium leading-6 text-slate-900">{value}</dd></div>)}
        </dl>
        <p className="mt-5 border-t border-slate-100 pt-4 text-xs leading-6 text-slate-500">Giờ Việt Nam · Asia/Ho_Chi_Minh (UTC+7).{isMatchStale(match, now) ? " Dữ liệu có thể đã cũ; trạng thái hiện tại có thể chưa được cập nhật." : ""}</p>
      </section>
    </div>}
    {tab === "su-kien" && <div className="mt-6"><EventsList match={match} /></div>}
    {tab === "doi-hinh" && <div className="mt-6"><LineupsView match={match} /></div>}
    {tab === "bxh" && <div className="mt-6">{hub ? <StandingsPanel match={match} hub={hub} /> : <Unavailable>Chưa có dữ liệu bảng xếp hạng.</Unavailable>}</div>}
    {tab === "thong-ke" && <div className="mt-6"><StatsList match={match} /></div>}
    {tab === "doi-dau" && <div className="mt-6">{hub ? <HeadToHeadPanel match={match} hub={hub} /> : <Unavailable>Chưa có dữ liệu các lần gặp nhau của hai đội.</Unavailable>}</div>}
    <div aria-label="Theo dõi đội bóng và giải đấu" className="mt-6 flex flex-wrap gap-2">
      {match.homeClub?.id && <FollowLink type="CLUB" entityId={match.homeClub.id} name={teamName(match.homeClub, "home", true)} />}
      {match.awayClub?.id && <FollowLink type="CLUB" entityId={match.awayClub.id} name={teamName(match.awayClub, "away", true)} />}
      {match.league.id && <FollowLink type="COMPETITION" entityId={match.league.id} name={match.league.name} />}
    </div>
    <MatchAttribution matches={[match]} />
    {(match.detailAttributions ?? []).map((source) => <p key={source.url} className="mt-1 text-xs text-slate-500"><a href={source.url} target="_blank" rel="noreferrer" className="underline underline-offset-4 hover:text-slate-900">{source.text}<span className="sr-only"> (mở trong thẻ mới)</span></a></p>)}
  </>;
}
