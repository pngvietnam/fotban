import type { MatchDetail } from "../../types/match-ui";
import { teamName } from "../../lib/match-presentation";
import { MatchAttribution } from "./match-attribution";
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
import { EventsList, HeadToHeadPanel, MatchReviewCard, StandingsPanel, TopStats, Unavailable } from "./match-tab-views";
import { FormAside, H2HSummary, MatchInfoList, MatchMomentum, NextMatchCards, PlayerOfMatch, StandingsSnippet } from "./match-facts";
import type { MatchReview } from "../../lib/match-review";

const weatherText: Record<string, string> = { "clear day": "Trời quang", "clear night": "Trời quang", "partly cloudy day": "Ít mây", "partly cloudy night": "Ít mây", cloudy: "Nhiều mây", rain: "Mưa", snow: "Tuyết", sleet: "Mưa tuyết", wind: "Gió mạnh", fog: "Sương mù" };
/** "Trời quang · 11°C"; unknown conditions keep the provider's words. */
function formatWeather(info: MatchDetail["venueInfo"]) {
  if (!info || (!info.weather && info.temperatureC === null)) return null;
  return [info.weather ? weatherText[info.weather.toLowerCase()] ?? info.weather : null, info.temperatureC !== null ? `${Math.round(info.temperatureC)}°C` : null].filter(Boolean).join(" · ");
}

/**
 * Match page. "Dữ kiện" is the summary: how the match went (Thế trận, top statistics, best player, video, the
 * press review) beside the facts (match info, form, table, earlier meetings); the full event list, lineups and
 * statistics live on their own tabs.
 */
export function MatchDetailView({ match, now, highlight, relatedVideos = [], tab = "du-kien", hub, news, review, statsView = "hang-dau", statsTeam = "all" }: { match: MatchDetail; now: Date; highlight?: VerifiedHighlight | null; /** The match's other clips from its reviewed channels. */ relatedVideos?: VerifiedHighlight[]; tab?: MatchTab; hub?: MatchHub | null; /** Related stories, rendered on the Dữ kiện tab. */ news?: ReactNode; /** The lead publisher story about this match. */ review?: MatchReview | null; /** Player statistics table view and team filter on the Thống kê tab. */ statsView?: PlayerStatView; statsTeam?: PlayerTeamFilter }) {
  const venueName = match.venue || match.venueInfo?.name || null;
  const weather = formatWeather(match.venueInfo);
  const finished = match.status === "FINISHED";
  return <div className="match-page">
    <h1 className="sr-only">Chi tiết trận đấu: {teamName(match.homeClub, "home", true)} – {teamName(match.awayClub, "away", true)}</h1>
    <MatchHero match={match} now={now} venueName={venueName} />
    <MatchTabsView slug={match.slug} active={tab} />
    {tab === "du-kien" && <div className="mf-layout">
      <div className="mf-main">
        {!finished && review && <MatchReviewCard review={review} now={now} />}
        <MatchMomentum match={match} />
        <div className="mf-pair"><TopStats match={match} href={matchTabHref(match.slug, "thong-ke")} title="Thống kê hàng đầu" /><PlayerOfMatch match={match} /></div>
        {finished && <MatchHighlight highlight={highlight} related={relatedVideos} />}
        {finished && review && <MatchReviewCard review={review} now={now} />}
        {hub && <NextMatchCards hub={hub} />}
      </div>
      <aside className="mf-aside" aria-label="Thông tin trận đấu và hai đội">
        <MatchInfoList match={match} venueName={venueName} weather={weather} />
        {hub && <FormAside match={match} hub={hub} />}
        {hub && <StandingsSnippet match={match} hub={hub} />}
        {hub && <H2HSummary match={match} hub={hub} />}
      </aside>
      {news && <div className="mf-news">{news}</div>}
    </div>}
    {tab === "su-kien" && <div className="mt-6"><EventsList match={match} /></div>}
    {tab === "doi-hinh" && <div className="mt-6"><LineupsView match={match} /></div>}
    {tab === "bxh" && <div className="mt-6">{hub ? <StandingsPanel match={match} hub={hub} /> : <Unavailable>Chưa có dữ liệu bảng xếp hạng.</Unavailable>}</div>}
    {tab === "thong-ke" && <div className="mt-6"><StatsTab match={match} view={statsView} team={statsTeam} top={<TopStats match={match} title="Thống kê hàng đầu" />} /></div>}
    {tab === "doi-dau" && <div className="mt-6">{hub ? <HeadToHeadPanel match={match} hub={hub} /> : <Unavailable>Chưa có dữ liệu các lần gặp nhau của hai đội.</Unavailable>}</div>}
    <div aria-label="Theo dõi đội bóng và giải đấu" className="mt-6 flex flex-wrap gap-2">
      {match.homeClub?.id && <FollowLink type="CLUB" entityId={match.homeClub.id} name={teamName(match.homeClub, "home", true)} crestUrl={match.homeClub.externalCrestUrl} />}
      {match.awayClub?.id && <FollowLink type="CLUB" entityId={match.awayClub.id} name={teamName(match.awayClub, "away", true)} crestUrl={match.awayClub.externalCrestUrl} />}
      {match.league.id && <FollowLink type="COMPETITION" entityId={match.league.id} name={match.league.name} />}
    </div>
    <MatchAttribution matches={[match]} />
    {(match.detailAttributions ?? []).map((source) => <p key={source.url} className="mt-1 text-xs text-slate-600"><a href={source.url} target="_blank" rel="noreferrer" className="underline underline-offset-4 hover:text-slate-900">{source.text}<span className="sr-only"> (mở trong thẻ mới)</span></a></p>)}
  </div>;
}
