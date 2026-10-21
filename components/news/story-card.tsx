import Link from "next/link";
import type { FeedCardView } from "../../types/feed-card";
import { timelineLeague } from "../../lib/match-timeline";
import { kindOfStoryType } from "../../lib/news-tabs";
import { newsAbsoluteTime, newsRelativeTime, storyLabels } from "../../lib/news-presentation";

/** The reader-facing kind of a story ("Trận đấu", "Chuyển nhượng"…). */
export const storyKind = (card: FeedCardView) => kindOfStoryType(card.storyType)?.label ?? storyLabels[card.storyType] ?? "Tin bóng đá";
/** The first supported competition a card is tagged with. */
export const storyLeague = (card: FeedCardView) => card.leagueSlugs.map((slug) => timelineLeague(slug)).find(Boolean) ?? null;

/** A story as a card (prototype v2 "context-story"): kind and league, the publisher's headline and description, source and time. */
export function StoryCard({ card, now, others = 0 }: { card: FeedCardView; now: Date; others?: number }) {
  const league = storyLeague(card);
  return <div className="fb-card context-story text-only">
    <div className="context-story-top"><span className={`fb-badge ${card.storyType === "TRANSFER" ? "fb-badge-warning" : "fb-badge-info"}`}>{storyKind(card)}</span>{league && <span className="fb-text fb-text-caption">{league.label}</span>}</div>
    <Link className="context-story-title" href={`/news/${card.slug}`}><h3 className="fb-text fb-text-title">{card.title}</h3></Link>
    {card.description && <p className="fb-text fb-text-meta">{card.description}</p>}
    <div className="context-story-footer"><span className="fb-text fb-text-caption">{card.publisher} · <time dateTime={card.publishedAt} title={newsAbsoluteTime(card.publishedAt)}>{newsRelativeTime(card.publishedAt, now)}</time>{others > 0 ? ` · +${others} báo` : ""}</span><Link href={`/news/${card.slug}`} aria-label={`Đọc ${card.title}`}>→</Link></div>
  </div>;
}
