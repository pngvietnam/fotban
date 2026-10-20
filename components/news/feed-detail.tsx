import Link from "next/link";
import type { FeedCardView } from "../../types/feed-card";
import type { ClubContext } from "../../services/feed-context";
import type { StoryLikeState } from "../../services/viewer-likes";
import { feedCertaintyText, feedTransferText, officialWordingNotice } from "../../lib/feed-card-presentation";
import { clubPath } from "../../lib/club-presentation";
import { playerPath } from "../../lib/player-presentation";
import { leagueHref } from "../../lib/league-presentation";
import { timelineLeague } from "../../lib/match-timeline";
import { kindOfStoryType } from "../../lib/news-tabs";
import { newsAbsoluteTime, newsRelativeTime, safeNewsUrl, storyLabels } from "../../lib/news-presentation";
import type { LeagueSlug } from "../../types/league-hub";
import { LikeStats, SaveButton, ShareButton } from "./feed-actions";
import { BackToReading } from "./back-to-reading";

const matchLink = (slug: string) => `/match/${encodeURIComponent(slug)}`;
const kindOf = (card: FeedCardView) => kindOfStoryType(card.storyType)?.label ?? storyLabels[card.storyType] ?? "Tin bóng đá";
const leagueOf = (card: FeedCardView) => card.leagueSlugs.map((slug) => timelineLeague(slug)).find(Boolean) ?? null;
const initials = (name: string) => name.replace(/[^\p{L}\p{N} ]/gu, "").split(/\s+/).filter(Boolean).slice(0, 2).map((word) => [...word][0]).join("").toUpperCase() || "F";

function ClubContextCard({ club }: { club: ClubContext }) {
  const rows = [
    club.standing && <li key="standing">Vị trí {club.standing.position}{club.standing.points !== null ? ` · ${club.standing.points} điểm` : ""}{club.standing.played !== null ? ` sau ${club.standing.played} trận` : ""} ({club.standing.league})</li>,
    club.lastMatch && <li key="last">Gần nhất: <Link href={matchLink(club.lastMatch.slug)}>{club.lastMatch.home} {club.lastMatch.homeScore}–{club.lastMatch.awayScore} {club.lastMatch.away}</Link> ({newsAbsoluteTime(club.lastMatch.kickoffAt)})</li>,
    club.nextMatch && <li key="next">Sắp tới: <Link href={matchLink(club.nextMatch.slug)}>{club.nextMatch.home} – {club.nextMatch.away}</Link> ({newsAbsoluteTime(club.nextMatch.kickoffAt)})</li>,
  ].filter(Boolean);
  if (!rows.length) return null;
  return <div className="fb-card context-club"><h3 className="fb-text fb-text-title"><Link href={clubPath(club.clubId)}>{club.name}</Link></h3><ul className="fb-text fb-text-meta">{rows}</ul>{club.dataAsOf && <p className="fb-text fb-text-caption">Dữ liệu trận cập nhật lúc {newsAbsoluteTime(club.dataAsOf)}</p>}</div>;
}

/** A story card in "Câu chuyện tiếp theo" and "Các báo khác cùng đưa tin". */
function StoryCard({ card, now }: { card: FeedCardView; now: Date }) {
  const league = leagueOf(card);
  return <div className="fb-card context-story text-only">
    <div className="context-story-top"><span className={`fb-badge ${card.storyType === "TRANSFER" ? "fb-badge-warning" : "fb-badge-info"}`}>{kindOf(card)}</span>{league && <span className="fb-text fb-text-caption">{league.label}</span>}</div>
    <Link className="context-story-title" href={`/news/${card.slug}`}><h3 className="fb-text fb-text-title">{card.title}</h3></Link>
    {card.description && <p className="fb-text fb-text-meta">{card.description}</p>}
    <div className="context-story-footer"><span className="fb-text fb-text-caption">{card.publisher} · <time dateTime={card.publishedAt} title={newsAbsoluteTime(card.publishedAt)}>{newsRelativeTime(card.publishedAt, now)}</time></span><Link href={`/news/${card.slug}`} aria-label={`Đọc ${card.title}`}>→</Link></div>
  </div>;
}

/**
 * The story page of prototype v2 with the publisher's own headline, description and picture; the full
 * article stays on the publisher's site. Other coverage, Fotban's match data and related stories follow.
 */
export function FeedDetailView({ card, others, related = [], context = [], now, likes = { signedIn: false, counts: {}, liked: {} } }: { card: FeedCardView; others: FeedCardView[]; related?: FeedCardView[]; context?: ClubContext[]; now: Date; likes?: StoryLikeState }) {
  const league = leagueOf(card); const url = safeNewsUrl(card.url);
  const contexts = context.filter((club) => club.standing || club.lastMatch || club.nextMatch);
  const entities = [...new Map([card, ...others].flatMap((item) => item.entities).filter((entity) => entity.id && entity.kind !== "league").map((entity) => [`${entity.kind}:${entity.id}`, entity])).values()].slice(0, 8);
  const stage = card.storyType === "TRANSFER" ? card.transferStage ? feedTransferText[card.transferStage] : feedCertaintyText[card.certainty] : null;
  const destinations = [
    card.match && { label: `Trận ${card.match.home} – ${card.match.away}`, href: matchLink(card.match.slug) },
    league && { label: `${league.label}: bảng xếp hạng`, href: leagueHref(league.slug as LeagueSlug, { tab: "bang-xep-hang" }) },
    card.storyType === "TRANSFER" && { label: "Thị trường chuyển nhượng", href: "/transfers" },
    { label: "Lịch thi đấu", href: "/matches" },
  ].filter((item): item is { label: string; href: string } => Boolean(item));
  return <div className="domain-page news-article">
    <BackToReading className="dp-back">← Quay lại nơi đang đọc</BackToReading>
    <div className="dp-article-layout"><article className="dp-article">
      <span className="dp-kicker">{[league?.label, kindOf(card)].filter(Boolean).join(" · ")}</span>
      <h1>{card.title}</h1>
      <div className="dp-article-meta"><span className="dp-person-avatar" aria-hidden="true">{initials(card.publisher)}</span><span>{card.attribution}<small><time dateTime={card.publishedAt}>{newsAbsoluteTime(card.publishedAt)}</time>{card.originHint ? ` · dẫn lại ${card.originHint}` : ""}</small></span>
        <SaveButton story={{ slug: card.slug, title: card.title, publisher: card.publisher }} className="dp-secondary" label /><ShareButton path={`/news/${card.slug}`} title={card.title} className="dp-secondary" /></div>
      {card.image && <figure className="dp-article-figure">
        {/* eslint-disable-next-line @next/next/no-img-element -- hotlinked publisher image; not optimized, downloaded or stored by us */}
        <img className="dp-article-cover" src={card.image} alt="" referrerPolicy="no-referrer" /><figcaption className="fb-text fb-text-caption">Ảnh: {card.publisher}. Ảnh thuộc về báo, hiển thị trực tiếp từ máy chủ của báo.</figcaption></figure>}
      <div className="context-article-body">
        {card.description && <blockquote className="fb-text fb-text-body context-lead">{card.description}</blockquote>}
        {card.officialWording && <p className="fb-text fb-text-meta">{officialWordingNotice}</p>}
        {stage && <div className="feed-transfer-context compact"><div className="feed-transfer-status"><span className="fb-badge fb-badge-info">{stage}</span><span className="fb-text fb-text-caption">THEO CÁCH BÁO ĐƯA TIN</span></div></div>}
        <div className="fb-card context-source">
          <h2 className="fb-text fb-text-title">Nguồn & điều đã biết</h2>
          <p className="fb-text fb-text-meta">{card.attribution} · {newsAbsoluteTime(card.publishedAt)}{others.length ? ` · ${others.length + 1} báo cùng đưa tin` : ""}</p>
          <p className="fb-text fb-text-body">Tiêu đề, mô tả và ảnh do {card.publisher} đăng. Toàn bài nằm trên trang của báo.</p>
        </div>
        <div className="post-like-bar"><LikeStats articleId={card.articleId} signedIn={likes.signedIn} liked={likes.liked[card.articleId] ?? false} count={likes.counts[card.articleId] ?? 0} others={others.length} sharePath={`/news/${card.slug}`} title={card.title} /></div>
        {others.length > 0 && <section aria-labelledby="other-coverage"><h2 id="other-coverage" className="fb-text fb-text-section">Các báo khác cùng đưa tin ({others.length})</h2><div className="context-story-grid">{others.map((other) => <StoryCard key={other.articleId} card={other} now={now} />)}</div></section>}
        {contexts.length > 0 && <section aria-labelledby="club-context"><h2 id="club-context" className="fb-text fb-text-section">Bối cảnh từ dữ liệu Fotban</h2><div className="context-club-grid">{contexts.map((club) => <ClubContextCard key={club.clubId} club={club} />)}</div><p className="fb-text fb-text-caption">Football data provided by the Football-Data.org API.</p></section>}
        {(entities.length > 0 || league || card.match) && <section aria-labelledby="context-next"><h2 id="context-next" className="fb-text fb-text-section">Đi tiếp đúng ngữ cảnh</h2><div className="context-chips">
          {entities.map((entity) => <Link key={`${entity.kind}:${entity.id}`} className="fb-button fb-button-secondary" href={entity.kind === "club" ? clubPath(entity.id!) : playerPath(entity.id!)}>{entity.name} ↗</Link>)}
          {league && <Link className="fb-button fb-button-secondary" href={leagueHref(league.slug as LeagueSlug)}>{league.label} ↗</Link>}
          {card.match && <Link className="fb-button fb-button-secondary" href={matchLink(card.match.slug)}>{card.match.home} – {card.match.away} ↗</Link>}
        </div></section>}
      </div>
      <footer className="dp-article-footer">{url && <p className="fb-text fb-text-meta">{card.attribution} · <a href={url} target="_blank" rel="noopener noreferrer nofollow" aria-label={`Xem bài gốc trên ${card.publisher} (mở thẻ mới)`}>Xem bài gốc ↗</a></p>}</footer>
    </article><aside>
      <div className="dp-panel"><span className="dp-kicker">NGUỒN TIN & NGỮ CẢNH</span><h2>Biết tin từ đâu.</h2><p className="dp-muted">{card.publisher}{others.length ? ` và ${others.length} báo khác cùng đưa tin này.` : " đưa tin này."}</p><Link className="dp-secondary" href="/ghi-cong-anh">Ghi công hình ảnh ↗</Link></div>
      <div className="dp-panel"><h2>Các điểm đến liên quan</h2>{destinations.map((item) => <Link className="dp-related-link" key={item.href} href={item.href}>{item.label}<span aria-hidden="true">→</span></Link>)}</div>
    </aside></div>
    <h2 className="dp-extra-heading">Câu chuyện tiếp theo</h2>
    {related.length ? <div className="context-story-grid">{related.map((item) => <StoryCard key={item.articleId} card={item} now={now} />)}</div>
      : <div className="fb-card context-empty"><h3 className="fb-text fb-text-title">Chưa có câu chuyện liên quan</h3><p className="fb-text fb-text-meta">Chỉ hiện tin về cùng câu lạc bộ hoặc cầu thủ trong 72 giờ qua.</p><Link className="fb-button fb-button-secondary" href="/news">Khám phá tin chung →</Link></div>}
  </div>;
}
