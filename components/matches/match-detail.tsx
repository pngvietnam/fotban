import type { MatchDetail } from "../../types/match-ui";
import { formatMatchDate, formatMatchTime, formatPersonName, formatRound, formatUpdated, isMatchStale, teamName } from "../../lib/match-presentation";
import { MatchAttribution } from "./match-attribution";
import { BackToSchedule } from "./timeline-client";
import { MatchHero } from "./match-hero";
import { FollowLink } from "../account/follow-link";
import { MatchHighlight } from "./match-highlight";
import type { VerifiedHighlight } from "../../types/video-provider";
import type { ReactNode } from "react";
import type { MatchHub } from "../../services/match-hub";
import { matchTabHref, type MatchTab } from "../../lib/match-tabs";
import { MatchTabsView } from "./match-tabs";
import { LineupsView } from "./match-lineups";
import { StatsTab, type PlayerStatView, type PlayerTeamFilter } from "./match-stats-extra";
import { EventsList, FormPanel, HeadToHeadPanel, MatchReviewCard, NextMatches, StandingsPanel, TopStats, Unavailable } from "./match-tab-views";
import type { MatchReview } from "../../lib/match-review";

const weatherText: Record<string, string> = { "clear day": "Trời quang", "clear night": "Trời quang", "partly cloudy day": "Ít mây", "partly cloudy night": "Ít mây", cloudy: "Nhiều mây", rain: "Mưa", snow: "Tuyết", sleet: "Mưa tuyết", wind: "Gió mạnh", fog: "Sương mù" };
/** "Trời quang · 11°C"; unknown conditions keep the provider's words. */
function formatWeather(info: MatchDetail["venueInfo"]) {
  if (!info || (!info.weather && info.temperatureC === null)) return null;
  return [info.weather ? weatherText[info.weather.toLowerCase()] ?? info.weather : null, info.temperatureC !== null ? `${Math.round(info.temperatureC)}°C` : null].filter(Boolean).join(" · ");
}
export function MatchDetailView({ match, now, highlight, relatedVideos = [], tab = "du-kien", hub, news, review, statsView = "hang-dau", statsTeam = "all" }: { match: MatchDetail; now: Date; highlight?: VerifiedHighlight | null; /** The match's other clips from its reviewed channels. */ relatedVideos?: VerifiedHighlight[]; tab?: MatchTab; hub?: MatchHub | null; /** Related stories, rendered on the Dữ kiện tab. */ news?: ReactNode; /** The lead publisher story about this match. */ review?: MatchReview | null; /** Player statistics table view and team filter on the Thống kê tab. */ statsView?: PlayerStatView; statsTeam?: PlayerTeamFilter }) {
  const updated = formatUpdated(match.lastUpdatedAt);
  const venueName = match.venue || match.venueInfo?.name || null;
  const weather = formatWeather(match.venueInfo);
  return <>
    <BackToSchedule className="dp-back">← Quay lại lịch đấu</BackToSchedule>
    <h1 className="sr-only">Chi tiết trận đấu: {teamName(match.homeClub, "home", true)} – {teamName(match.awayClub, "away", true)}</h1>
    <MatchHero match={match} now={now} venueName={venueName} />
    <MatchTabsView slug={match.slug} active={tab} />
    {tab === "du-kien" && <div className="mt-6 space-y-6">
      {review && <MatchReviewCard review={review} now={now} />}
      {match.status === "FINISHED" && <MatchHighlight highlight={highlight} related={relatedVideos} />}
      <TopStats match={match} href={matchTabHref(match.slug, "thong-ke")} />
      {match.events.length > 0 && <EventsList match={match} />}
      {hub && <FormPanel match={match} hub={hub} />}
      {hub && <NextMatches match={match} hub={hub} />}
      {news}
      <section aria-labelledby="match-info" className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <h2 id="match-info" className="text-base font-bold">Thông tin trận đấu</h2>
        <dl className="mt-5 grid gap-x-8 gap-y-5 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {[["Giải đấu", match.league.name], ["Mùa giải", match.season.name], ["Vòng đấu", formatRound(match.round) || "Chưa có dữ liệu"], ["Giờ thi đấu", `${formatMatchTime(match.kickoffAt)} · ${formatMatchDate(match.kickoffAt, true)}`], ["Sân vận động", venueName ? [venueName, match.venueInfo?.city].filter(Boolean).join(", ") : "Chưa có dữ liệu"], ...(match.venueInfo?.capacity ? [["Sức chứa", match.venueInfo.capacity.toLocaleString("vi-VN")]] : []), ...(weather ? [["Thời tiết", weather]] : []), ["Trọng tài", formatPersonName(match.referee) || "Chưa có dữ liệu"], ["Cập nhật dữ liệu", updated || "Chưa có thời gian cập nhật"]].map(([label, value]) => <div key={label}><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1.5 font-medium leading-6 text-slate-900">{value}</dd></div>)}
        </dl>
        <p className="mt-5 border-t border-slate-100 pt-4 text-xs leading-6 text-slate-500">Giờ Việt Nam · Asia/Ho_Chi_Minh (UTC+7).{isMatchStale(match, now) ? " Dữ liệu có thể đã cũ; trạng thái hiện tại có thể chưa được cập nhật." : ""}</p>
      </section>
    </div>}
    {tab === "su-kien" && <div className="mt-6"><EventsList match={match} /></div>}
    {tab === "doi-hinh" && <div className="mt-6"><LineupsView match={match} /></div>}
    {tab === "bxh" && <div className="mt-6">{hub ? <StandingsPanel match={match} hub={hub} /> : <Unavailable>Chưa có dữ liệu bảng xếp hạng.</Unavailable>}</div>}
    {tab === "thong-ke" && <div className="mt-6"><StatsTab match={match} view={statsView} team={statsTeam} top={<TopStats match={match} title="Thống kê hàng đầu" />} /></div>}
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
