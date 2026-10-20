import Link from "next/link";
import type { FeedGroupView } from "../../types/feed-card";
import type { RibbonMatch } from "../../services/home-overview";
import type { StoryLikeState } from "../../services/viewer-likes";
import { feedCertaintyText, feedTransferText, officialWordingNotice } from "../../lib/feed-card-presentation";
import { clubPath } from "../../lib/club-presentation";
import { playerPath } from "../../lib/player-presentation";
import { leagueHref } from "../../lib/league-presentation";
import { safeCrestUrl } from "../../lib/crest";
import { formatMatchTime } from "../../lib/match-presentation";
import { timelineLeague, timelineLeagues } from "../../lib/match-timeline";
import { kindOfStoryType, newsKinds, newsTabs, newsViewHref, type NewsView } from "../../lib/news-tabs";
import { newsAbsoluteTime, newsRelativeTime, safeNewsUrl, storyLabels } from "../../lib/news-presentation";
import type { LeagueSlug } from "../../types/league-hub";
import { FeedFilterMenus, PostActions, SaveButton } from "./feed-actions";
import { OvPhoto } from "../home/overview-client";

const cardsOf = (group: FeedGroupView) => [group.lead, ...group.others];
const leagueSlugOf = (group: FeedGroupView) => cardsOf(group).flatMap((card) => card.leagueSlugs).find((slug) => timelineLeague(slug)) ?? null;
const publisherTone = (name: string) => ["", "publisher-2", "publisher-3", "publisher-5"][[...name].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 4];
const kindTone: Record<string, string> = { "chuyen-nhuong": "type-2", "phan-tich": "type-3", "fan-noi-gi": "type-4", "ngoai-le": "type-4" };
const initials = (name: string) => name.replace(/[^\p{L}\p{N} ]/gu, "").split(/\s+/).filter(Boolean).slice(0, 2).map((word) => [...word][0]).join("").toUpperCase() || "F";
// eslint-disable-next-line @next/next/no-img-element -- hotlinked football-data crest
const Crest = ({ url }: { url: string | null }) => { const safe = safeCrestUrl(url); return safe ? <img src={safe} alt="" loading="lazy" referrerPolicy="no-referrer" /> : null; };
/** "22:40 18/10": time and day in Vietnam, without the year. */
const shortStamp = (value: string) => `${formatMatchTime(value)} ${new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit" }).format(new Date(value))}`;
const Arrow = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M5 12h14 M14 7l5 5-5 5" /></svg>;

/** One story as a post: publisher, headline and description as published, picture with credit, source and context, like/share/save. */
export function FeedPost({ group, likes, now }: { group: FeedGroupView; likes: StoryLikeState; now: Date }) {
  const { lead } = group;
  const kind = kindOfStoryType(lead.storyType); const kindLabel = kind?.label ?? storyLabels[lead.storyType] ?? "Tin bóng đá";
  const league = leagueSlugOf(group); const photo = cardsOf(group).find((card) => card.image) ?? null;
  const opinion = kind?.key === "fan-noi-gi"; const url = safeNewsUrl(lead.url);
  const entities = [...new Map(cardsOf(group).flatMap((card) => card.entities).filter((entity) => entity.id && entity.kind !== "league").map((entity) => [`${entity.kind}:${entity.id}`, entity])).values()].slice(0, 4);
  const stage = lead.storyType === "TRANSFER" ? lead.transferStage ? feedTransferText[lead.transferStage] : feedCertaintyText[lead.certainty] : null;
  return <article className="social-post" id={`post-${group.key}`} data-kind={kind?.key ?? "khac"}>
    <div className="post-byline">
      <div className={`publisher-avatar ${publisherTone(lead.publisher)}`} aria-hidden="true">{initials(lead.publisher)}</div>
      <div><b>{lead.publisher}</b><small><time dateTime={lead.publishedAt} title={newsAbsoluteTime(lead.publishedAt)}>{newsRelativeTime(lead.publishedAt, now)}</time>{league && <><span>·</span>{timelineLeague(league)!.label}</>}</small></div>
      <span className={`post-type ${kind ? kindTone[kind.key] ?? "" : ""}`}>{kindLabel}</span>
      <SaveButton story={{ slug: lead.slug, title: lead.title, publisher: lead.publisher }} />
    </div>
    <div className="post-copy"><h2><Link className="dp-feed-title" href={`/news/${lead.slug}`}>{lead.title}</Link></h2>{lead.description && <p>{lead.description}</p>}</div>
    {photo && <figure className="social-photo plain"><OvPhoto src={photo.image} /><figcaption>Ảnh: {photo.publisher}</figcaption></figure>}
    {stage && <div className="feed-transfer-context compact"><div className="feed-transfer-status"><span className="fb-badge fb-badge-info">{stage}</span><span className="fb-text fb-text-caption">THEO CÁCH BÁO ĐƯA TIN</span></div></div>}
    <div className={`post-source-line ${opinion ? "is-opinion" : ""}`}>
      <span><b>{opinion ? "Góc nhìn cộng đồng" : "Nguồn"}</b> · {lead.publisher} · <time dateTime={lead.publishedAt} title={newsAbsoluteTime(lead.publishedAt)}>{shortStamp(lead.publishedAt)}</time>{group.others.length ? ` · ${group.others.length + 1} báo cùng đưa` : ""}</span>
      {url && <a href={url} target="_blank" rel="noopener noreferrer nofollow" aria-label={`Đọc bài gốc trên ${lead.publisher} (mở thẻ mới)`}>Bài gốc ↗</a>}
    </div>
    {(opinion || lead.officialWording) && <p className="post-source-note">{opinion ? "Ý kiến cá nhân, không phải thông tin được xác nhận." : officialWordingNotice}</p>}
    <div className="post-footer">
      {(entities.length > 0 || league) && <div className="post-chips" aria-label="Liên quan">
        {entities.map((entity) => <Link key={`${entity.kind}:${entity.id}`} href={entity.kind === "club" ? clubPath(entity.id!) : playerPath(entity.id!)}>{entity.name}</Link>)}
        {league && <Link href={leagueHref(league as LeagueSlug)}>{timelineLeague(league)!.label}</Link>}
      </div>}
      <PostActions articleId={lead.articleId} signedIn={likes.signedIn} liked={likes.liked[group.key] ?? false} count={likes.counts[group.key] ?? 0} sharePath={`/news/${lead.slug}`} title={lead.title} />
    </div>
  </article>;
}

export type SocialFeedData = {
  view: NewsView; groups: FeedGroupView[]; nextOffset: number | null; failed: boolean; likes: StoryLikeState;
  /** What the "Dành cho bạn" tab is showing. */
  personal: { names: string[]; fallback: boolean; signedIn: boolean } | null;
  buzz: FeedGroupView[]; fixtures: RibbonMatch[];
};

function contextNote(data: SocialFeedData) {
  if (data.view.tab === "moi-nhat") return <>Sắp theo giờ đăng, mới nhất trước.</>;
  if (data.view.tab === "soi-noi") return <>Tin 48 giờ qua, xếp theo số báo cùng đưa tin và lượt thích của bạn đọc.</>;
  const personal = data.personal;
  if (personal?.names.length && !personal.fallback) return <>Vì bạn theo dõi {personal.names.join(", ")}.</>;
  if (personal?.names.length) return <>Chưa có tin mới về đội bạn theo dõi. Đang hiển thị tin chung.</>;
  return <>Chưa theo dõi đội bóng? Đây là những câu chuyện chung để bắt đầu. <Link href={personal?.signedIn ? "/following" : "/login"}>Chọn đội bóng</Link></>;
}

/** Tin tức (prototype v2): three ways to read, two filters, posts, and the right column. */
export function SocialFeed({ data, now }: { data: SocialFeedData; now: Date }) {
  const { view } = data;
  const kindLabel = newsKinds.find((kind) => kind.key === view.kind)!.label;
  const leagueLabel = view.league === "all" ? null : timelineLeague(view.league)?.label ?? null;
  const menus = [
    { key: "kind", label: "Chọn loại tin", current: view.kind === "tat-ca" ? "Loại tin" : kindLabel, options: newsKinds.map((kind) => ({ label: kind.key === "tat-ca" ? "Tất cả loại tin" : kind.label, href: newsViewHref(view, { kind: kind.key }), active: view.kind === kind.key })) },
    { key: "league", label: "Chọn giải đấu", current: leagueLabel ?? "Giải đấu", options: [{ label: "Tất cả giải đấu", href: newsViewHref(view, { league: "all" }), active: view.league === "all" }, ...timelineLeagues.map((league) => ({ label: league.label, href: newsViewHref(view, { league: league.slug }), active: view.league === league.slug }))] },
  ];
  const filtered = view.kind !== "tat-ca" || view.league !== "all";
  return <div className="social-home">
    <div className="social-heading"><div><div className="eyebrow"><span /> TIN TỨC · FEED BÓNG ĐÁ CỦA BẠN</div><h1>Tin vừa tới. Fan vừa nói<span>.</span></h1><p>Lướt tin mới, bắt nhịp bóng đá mỗi ngày.</p></div></div>
    <div className="social-layout"><div className="social-timeline">
      <nav className="social-tabs feed-primary-tabs" aria-label="Cách xếp tin">{newsTabs.map((tab) => <Link key={tab.key} href={newsViewHref(view, { tab: tab.key })} aria-current={view.tab === tab.key ? "page" : undefined} className={view.tab === tab.key ? "active" : ""}>{tab.label}</Link>)}</nav>
      <FeedFilterMenus menus={menus} clearHref={filtered ? newsViewHref(view, { kind: "tat-ca", league: "all" }) : null} countText={`${view.offset + data.groups.length}${data.nextOffset ? "+" : ""} câu chuyện`} />
      <div className="feed-context-note"><span className="fb-text fb-text-caption">{contextNote(data)}</span></div>
      {data.failed && <div className="feed-empty" role="alert"><h3>Chưa thể tải tin tức</h3><p>Vui lòng thử lại sau ít phút.</p></div>}
      {!data.failed && !data.groups.length && <div className="feed-empty" role="status"><h3>Chưa có tin phù hợp</h3><p>{filtered ? "Thử bỏ bớt bộ lọc để xem thêm câu chuyện." : "Chưa có tin mới trong mấy ngày gần đây."}</p>{filtered && <Link className="fb-button fb-button-primary" href={newsViewHref(view, { kind: "tat-ca", league: "all" })}>Xem tất cả tin</Link>}</div>}
      {data.groups.map((group) => <FeedPost key={group.key} group={group} likes={data.likes} now={now} />)}
      {data.nextOffset !== null ? <Link className="load-feed" href={newsViewHref(view, { offset: data.nextOffset })}>Xem thêm tin <Arrow /></Link> : data.groups.length > 0 && <p className="feed-end">Bạn đã xem hết tin mới trong mục này.</p>}
    </div><aside className="social-right" aria-label="Tin được nhắc nhiều và lịch thi đấu">
      {data.buzz.length > 0 && <section className="social-widget hot-topics"><div className="widget-heading"><h2>Đang được nhắc nhiều</h2><span className="hot-marker">HOT</span></div><p className="widget-sub">Câu chuyện nhiều báo cùng đưa trong 48 giờ qua.</p>
        {data.buzz.map((group, index) => { const league = leagueSlugOf(group); return <Link className="topic-row" key={group.key} href={`/news/${group.lead.slug}`}><span>{String(index + 1).padStart(2, "0")}</span><div><b>{group.lead.title}</b><small>{new Set(cardsOf(group).map((card) => card.publisher)).size} báo{league ? ` · ${timelineLeague(league)!.label}` : ""}</small></div><Arrow /></Link>; })}
        <div className="widget-foot"><Link href={newsViewHref(view, { tab: "soi-noi" })}>Xem mục Sôi nổi →</Link></div></section>}
      {data.fixtures.length > 0 && <section className="social-widget compact-fixtures"><div className="widget-heading"><h2>Hẹn nhau trên sân cỏ</h2></div>
        <span className="fixture-day">{timelineLeague(data.fixtures[0].leagueSlug)?.label.toUpperCase()} · GIỜ VIỆT NAM</span>
        {data.fixtures.map((match) => <Link className="social-fixture" key={match.slug} href={`/match/${match.slug}`}>
          <div><Crest url={match.home.crestUrl} /><b>{match.home.name}</b></div>
          <span><b>{formatMatchTime(match.kickoffAt)}</b><small>{new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit" }).format(new Date(match.kickoffAt))} · UTC+7</small></span>
          <div><Crest url={match.away.crestUrl} /><b>{match.away.name}</b></div>
        </Link>)}
        <p className="fixture-footer"><Link href="/matches">Xem lịch thi đấu →</Link></p></section>}
      <div className="social-side-footer"><Link href="/ghi-cong-anh">Ghi công ảnh</Link><br />© 2026 Fotban · Bóng đá kết nối chúng ta.</div>
    </aside></div>
  </div>;
}
