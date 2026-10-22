import Link from "next/link";
import type { FeedCardView } from "../../types/feed-card";
import type { ClubContext, StoryMatch } from "../../services/feed-context";
import type { StoryLikeState } from "../../services/viewer-likes";
import { feedCertaintyText, feedTransferText, officialWordingNotice } from "../../lib/feed-card-presentation";
import { clubPath } from "../../lib/club-presentation";
import { playerPath } from "../../lib/player-presentation";
import { leagueHref } from "../../lib/league-presentation";
import { safeCrestUrl } from "../../lib/crest";
import { newsAbsoluteTime, newsRelativeTime, safeNewsUrl } from "../../lib/news-presentation";
import type { LeagueSlug } from "../../types/league-hub";
import { PostActions, SaveButton } from "./feed-actions";
import { StoryCard, storyKind, storyLeague } from "./story-card";

const matchLink = (slug: string, tab?: string) => `/match/${encodeURIComponent(slug)}${tab ? `?tab=${tab}` : ""}`;
const initials = (name: string) => name.replace(/[^\p{L}\p{N} ]/gu, "").split(/\s+/).filter(Boolean).slice(0, 2).map((word) => [...word][0]).join("").toUpperCase() || "F";
const formWord = { W: "thắng", D: "hòa", L: "thua" } as const;
const formLetter = { W: "T", D: "H", L: "B" } as const;

/** A club crest or player photo, or the initials on a disc when none is stored. */
function Mark({ url, name, size = "md", round = false }: { url?: string | null; name: string; size?: "sm" | "md" | "lg"; round?: boolean }) {
  const safe = safeCrestUrl(url ?? null);
  const className = `fd-mark ${size}${round ? " round" : ""}`;
  // eslint-disable-next-line @next/next/no-img-element -- hotlinked football-data crest or free-licence photo
  return safe ? <img className={className} src={safe} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span className={`${className} fd-mark-text`} aria-hidden="true">{initials(name)}</span>;
}

/** The match the story is about: crests, score (or kick-off time) and the way into the match page. */
function MatchStrip({ match, leagueLabel }: { match: StoryMatch; leagueLabel: string | null }) {
  const live = match.status === "LIVE" || match.status === "HALFTIME";
  const played = match.status === "FINISHED" || live;
  const status = match.status === "FINISHED" ? "Kết thúc" : live ? "Đang diễn ra" : match.status === "SCHEDULED" ? newsAbsoluteTime(match.kickoffAt) : "Hoãn / hủy";
  const label = `${match.home.name} ${played ? `${match.home.score ?? 0} – ${match.away.score ?? 0}` : "gặp"} ${match.away.name}: mở trang trận đấu`;
  return <section className="fd-match" aria-label="Trận đấu trong tin">
    <div className="fd-match-meta"><span>{leagueLabel ?? "Trận đấu"}</span><span className={live ? "fd-live" : ""}>{status}</span></div>
    <Link className="fd-match-main" href={matchLink(match.slug)} aria-label={label}>
      <span className="fd-team home"><span>{match.home.name}</span><Mark url={match.home.crestUrl} name={match.home.name} size="lg" /></span>
      <b className="fd-score">{played ? <><span>{match.home.score ?? 0}</span><i>–</i><span>{match.away.score ?? 0}</span></> : "vs"}</b>
      <span className="fd-team away"><Mark url={match.away.crestUrl} name={match.away.name} size="lg" /><span>{match.away.name}</span></span>
    </Link>
    <div className="fd-match-links"><Link href={matchLink(match.slug, played ? "su-kien" : undefined)}>{played ? "Diễn biến trận" : "Trang trận đấu"} →</Link><Link href={matchLink(match.slug, "doi-dau")}>Đối đầu →</Link></div>
  </section>;
}

function ClubContextCard({ club, skipMatch }: { club: ClubContext; skipMatch: string | null }) {
  const last = club.lastMatch && club.lastMatch.slug !== skipMatch ? club.lastMatch : null;
  const next = club.nextMatch && club.nextMatch.slug !== skipMatch ? club.nextMatch : null;
  if (!club.standing && !club.form.length && !last && !next) return null;
  return <div className="fb-card context-club fd-club">
    <div className="fd-club-head"><Mark url={club.crestUrl} name={club.name} /><h3 className="fb-text fb-text-title"><Link href={clubPath(club.clubId)}>{club.name}</Link></h3></div>
    {club.standing && <p className="fd-club-rank"><b>Hạng {club.standing.position}</b> · {club.standing.league}{club.standing.points !== null ? ` · ${club.standing.points} điểm` : ""}{club.standing.played !== null ? ` sau ${club.standing.played} trận` : ""}</p>}
    {club.form.length > 0 && <p className="fd-form" aria-label={`Phong độ ${club.form.length} trận gần nhất: ${club.form.map((item) => formWord[item]).join(", ")}`}><span aria-hidden="true">Phong độ</span>{club.form.map((item, index) => <i key={index} className={`form-${item}`} aria-hidden="true">{formLetter[item]}</i>)}</p>}
    {last && <p className="fd-club-line">Gần nhất: <Link href={matchLink(last.slug)}>{last.home} {last.homeScore}–{last.awayScore} {last.away}</Link></p>}
    {next && <p className="fd-club-line">Sắp tới: <Link href={matchLink(next.slug)}>{next.home} – {next.away}</Link> <small>{newsAbsoluteTime(next.kickoffAt)}</small></p>}
  </div>;
}

/**
 * The story page of prototype v2 with the publisher's own headline, description and picture; the full
 * article stays on the publisher's site. The way to it is the one primary action; the match, the other
 * papers and Fotban's own data follow, each once.
 */
export function FeedDetailView({ card, others, related = [], context = [], matchCard = null, now, likes = { signedIn: false, counts: {}, liked: {} } }: { card: FeedCardView; others: FeedCardView[]; related?: FeedCardView[]; context?: ClubContext[]; matchCard?: StoryMatch | null; now: Date; likes?: StoryLikeState }) {
  const league = storyLeague(card); const url = safeNewsUrl(card.url);
  const skipMatch = matchCard?.slug ?? card.match?.slug ?? null;
  const contexts = context.filter((club) => club.standing || club.form.length || (club.lastMatch && club.lastMatch.slug !== skipMatch) || (club.nextMatch && club.nextMatch.slug !== skipMatch));
  // Only what this story names: another paper's tag (a third club, a player from a side story) would mislead.
  const entities = [...new Map(card.entities.filter((entity) => entity.id && entity.kind !== "league").map((entity) => [`${entity.kind}:${entity.id}`, entity])).values()].slice(0, 6);
  const stage = card.storyType === "TRANSFER" ? card.transferStage ? feedTransferText[card.transferStage] : feedCertaintyText[card.certainty] : null;
  const mainClub = entities.find((entity) => entity.kind === "club");
  const destinations = [
    league && { label: `${league.label}: bảng xếp hạng`, href: leagueHref(league.slug as LeagueSlug, { tab: "bang-xep-hang" }) },
    card.storyType === "TRANSFER" && { label: "Thị trường chuyển nhượng", href: "/transfers" },
    { label: "Lịch thi đấu", href: "/matches" },
  ].filter((item): item is { label: string; href: string } => Boolean(item));
  return <div className="domain-page news-article">
    <div className="dp-article-layout"><article className="dp-article">
      <span className="dp-kicker">{[league?.label, storyKind(card)].filter(Boolean).join(" · ")}</span>
      <h1>{card.title}</h1>
      <div className="dp-article-meta"><span className="dp-person-avatar" aria-hidden="true">{initials(card.publisher)}</span><span>{card.attribution}<small><time dateTime={card.publishedAt} title={newsAbsoluteTime(card.publishedAt)}>{newsRelativeTime(card.publishedAt, now)}</time>{card.originHint ? ` · dẫn lại ${card.originHint}` : ""}{others.length > 0 && <> · <a href="#other-coverage">{others.length + 1} báo cùng đưa tin</a></>}</small></span></div>
      {card.image && <figure className="dp-article-figure">
        {/* eslint-disable-next-line @next/next/no-img-element -- hotlinked publisher image; not optimized, downloaded or stored by us */}
        <img className="dp-article-cover" src={card.image} alt="" referrerPolicy="no-referrer" /><figcaption className="fb-text fb-text-caption">Ảnh: {card.publisher}, hiển thị từ máy chủ của báo · <Link href="/ghi-cong-anh">Ghi công ảnh</Link></figcaption></figure>}
      <div className="context-article-body">
        {card.description && <blockquote className="fb-text fb-text-body context-lead">{card.description}</blockquote>}
        {card.officialWording && <p className="fb-text fb-text-meta">{officialWordingNotice}</p>}
        {stage && <div className="feed-transfer-context compact"><div className="feed-transfer-status"><span className="fb-badge fb-badge-info">{stage}</span><span className="fb-text fb-text-caption">THEO CÁCH BÁO ĐƯA TIN</span></div></div>}
        <div className="fd-actions">
          {url && <a className="fd-cta" href={url} target="_blank" rel="noopener noreferrer nofollow" aria-label={`Đọc bài đầy đủ trên ${card.publisher} (mở thẻ mới)`}>Đọc bài đầy đủ trên {card.publisher}<span aria-hidden="true"> ↗</span></a>}
          <div className="fd-tools"><SaveButton story={{ slug: card.slug, title: card.title, publisher: card.publisher }} className="dp-secondary" label /><PostActions articleId={card.articleId} signedIn={likes.signedIn} liked={likes.liked[card.articleId] ?? false} count={likes.counts[card.articleId] ?? 0} sharePath={`/news/${card.slug}`} title={card.title} /></div>
          <p className="fd-note">Fotban chỉ hiển thị tiêu đề, mô tả và ảnh; toàn bài nằm trên trang của báo.</p>
        </div>
        {matchCard && <MatchStrip match={matchCard} leagueLabel={league?.label ?? null} />}
        {others.length > 0 && <section aria-labelledby="other-coverage-title" id="other-coverage"><h2 id="other-coverage-title" className="fb-text fb-text-section">Các báo khác cùng đưa tin ({others.length})</h2>
          <ol className="fd-sources">{others.map((other) => <li key={other.articleId}><Link href={`/news/${other.slug}`}><b>{other.publisher}</b><span>{other.title}</span><time dateTime={other.publishedAt} title={newsAbsoluteTime(other.publishedAt)}>{newsRelativeTime(other.publishedAt, now)}</time></Link></li>)}</ol></section>}
        {contexts.length > 0 && <section aria-labelledby="club-context"><h2 id="club-context" className="fb-text fb-text-section">Bối cảnh từ dữ liệu Fotban</h2><div className="context-club-grid">{contexts.map((club) => <ClubContextCard key={club.clubId} club={club} skipMatch={skipMatch} />)}</div><p className="fb-text fb-text-caption">Football data provided by the Football-Data.org API.</p></section>}
        {(entities.length > 0 || league) && <section aria-labelledby="context-next"><h2 id="context-next" className="fb-text fb-text-section">Đi tiếp đúng ngữ cảnh</h2><div className="context-chips">
          {entities.map((entity) => <Link key={`${entity.kind}:${entity.id}`} className="fd-chip" href={entity.kind === "club" ? clubPath(entity.id!) : playerPath(entity.id!)}><Mark url={entity.kind === "club" ? entity.crestUrl : entity.photoUrl} name={entity.name} size="sm" round={entity.kind === "player"} />{entity.name}</Link>)}
          {league && <Link className="fd-chip" href={leagueHref(league.slug as LeagueSlug)}>{league.label}</Link>}
        </div></section>}
      </div>
    </article><aside>
      <div className="dp-panel"><h2>Các điểm đến liên quan</h2>{destinations.map((item) => <Link className="dp-related-link" key={item.href} href={item.href}>{item.label}<span aria-hidden="true">→</span></Link>)}</div>
    </aside></div>
    <h2 className="dp-extra-heading">{mainClub ? `Thêm về ${mainClub.name}` : "Câu chuyện tiếp theo"}</h2>
    {related.length ? <div className="context-story-grid">{related.map((item) => <StoryCard key={item.articleId} card={item} now={now} />)}</div>
      : <div className="fb-card context-empty"><h3 className="fb-text fb-text-title">Chưa có câu chuyện liên quan</h3><p className="fb-text fb-text-meta">Chỉ hiện tin về cùng câu lạc bộ hoặc cầu thủ trong 72 giờ qua.</p><Link className="fb-button fb-button-secondary" href="/news">Khám phá tin chung →</Link></div>}
  </div>;
}
