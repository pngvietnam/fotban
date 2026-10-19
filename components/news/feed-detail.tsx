import Link from "next/link";
import type { FeedCardView } from "../../types/feed-card";
import type { ClubContext } from "../../services/feed-context";
import { feedNotice, officialWordingNotice } from "../../lib/feed-card-presentation";
import { clubPath } from "../../lib/club-presentation";
import { newsAbsoluteTime, newsRelativeTime } from "../../lib/news-presentation";
import { FeedEntities, FeedLabels, FeedTransferNote } from "./feed-card";
import { FollowLink } from "../account/follow-link";
import { NewsImage } from "../ui/news-image";

function OtherCoverage({ card, now }: { card: FeedCardView; now: Date }) {
  return <li className="min-w-0 rounded-xl border border-slate-200 bg-white p-5">
    <p className="mb-2 text-xs font-semibold text-slate-500">{card.publisher} · <time dateTime={card.publishedAt} title={newsAbsoluteTime(card.publishedAt)}>{newsRelativeTime(card.publishedAt, now)}</time></p>
    <h3 className="break-words font-bold leading-snug"><Link href={`/news/${card.slug}`} className="underline-offset-4 hover:underline">{card.title}</Link></h3>
    {card.description && <p className="mt-2 break-words text-sm leading-7 text-slate-600">{card.description}</p>}
  </li>;
}
const matchLink = (slug: string) => `/match/${encodeURIComponent(slug)}`;
function ClubContextCard({ club }: { club: ClubContext }) {
  const rows = [
    club.standing && <li key="standing">Vị trí {club.standing.position}{club.standing.points !== null ? ` · ${club.standing.points} điểm` : ""}{club.standing.played !== null ? ` sau ${club.standing.played} trận` : ""} ({club.standing.league})</li>,
    club.lastMatch && <li key="last">Gần nhất: <Link href={matchLink(club.lastMatch.slug)} className="underline underline-offset-4">{club.lastMatch.home} {club.lastMatch.homeScore}–{club.lastMatch.awayScore} {club.lastMatch.away}</Link> ({newsAbsoluteTime(club.lastMatch.kickoffAt)})</li>,
    club.nextMatch && <li key="next">Sắp tới: <Link href={matchLink(club.nextMatch.slug)} className="underline underline-offset-4">{club.nextMatch.home} – {club.nextMatch.away}</Link> ({newsAbsoluteTime(club.nextMatch.kickoffAt)})</li>,
  ].filter(Boolean);
  if (!rows.length) return null;
  return <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-5"><h3 className="mb-2 font-bold"><Link href={clubPath(club.clubId)} className="hover:underline">{club.name}</Link></h3><ul className="space-y-1 text-sm leading-7 text-slate-700">{rows}</ul>{club.dataAsOf && <p className="mt-2 text-[11px] text-slate-500">Dữ liệu trận cập nhật lúc {newsAbsoluteTime(club.dataAsOf)}</p>}</div>;
}
const followType = { club: "CLUB", player: "PLAYER", league: "COMPETITION" } as const;

/** Publisher card page: the publisher's own headline and description, other coverage, FotBan context, attribution. */
export function FeedDetailView({ card, others, related = [], context = [], now }: { card: FeedCardView; others: FeedCardView[]; related?: FeedCardView[]; context?: ClubContext[]; now: Date }) {
  const followable = card.entities.filter((entity) => entity.id).slice(0, 6);
  const contexts = context.filter((club) => club.standing || club.lastMatch || club.nextMatch);
  return <div className="mx-auto max-w-3xl">
    <nav aria-label="Đường dẫn" className="mb-6 text-sm"><Link href="/news" className="inline-block rounded py-2 font-semibold text-slate-600 hover:underline">← Tất cả tin tức</Link></nav>
    <article>
      <header className="mb-6">
        <div className="mb-5"><FeedLabels card={card} /></div>
        <h1 className="break-words text-3xl font-bold leading-tight tracking-tight sm:text-4xl">{card.title}</h1>
        <p className="mt-4 text-sm text-slate-600"><span className="font-semibold text-slate-900">{card.attribution}</span> · <time dateTime={card.publishedAt}>{newsAbsoluteTime(card.publishedAt)}</time>{card.originHint ? ` · dẫn lại ${card.originHint}` : ""}</p>
      </header>
      {card.image && <figure className="mb-6"><NewsImage src={card.image} className="aspect-video rounded-2xl" /><figcaption className="mt-1 text-xs text-slate-500">Ảnh: {card.publisher}. Ảnh thuộc về báo, hiển thị trực tiếp từ máy chủ của báo.</figcaption></figure>}
      {card.description && <blockquote className="mb-6 border-l-4 border-sky-600 bg-white px-5 py-4 text-lg leading-8 text-slate-800">{card.description}</blockquote>}
      {card.officialWording && <p className="mb-4 text-sm leading-7 text-slate-600">{officialWordingNotice}</p>}
      <div className="mb-8 flex flex-col gap-3"><FeedTransferNote card={card} /><FeedEntities card={card} />
        {card.match && <p className="text-sm"><Link href={matchLink(card.match.slug)} className="font-semibold underline underline-offset-4">Xem trận {card.match.home} – {card.match.away}</Link></p>}
      </div>
      {others.length > 0 && <section aria-labelledby="other-coverage" className="mb-8">
        <h2 id="other-coverage" className="mb-4 text-lg font-bold tracking-tight">Các báo khác cùng đưa tin ({others.length})</h2>
        <ul className="flex flex-col gap-3">{others.map((other) => <OtherCoverage key={other.articleId} card={other} now={now} />)}</ul>
      </section>}
      {contexts.length > 0 && <section aria-labelledby="club-context" className="mb-8">
        <h2 id="club-context" className="mb-4 text-lg font-bold tracking-tight">Bối cảnh từ dữ liệu FotBan</h2>
        <div className="grid gap-3 sm:grid-cols-2">{contexts.map((club) => <ClubContextCard key={club.clubId} club={club} />)}</div>
        <p className="mt-2 text-xs text-slate-500">Football data provided by the Football-Data.org API.</p>
      </section>}
      {related.length > 0 && <section aria-labelledby="related-stories" className="mb-8">
        <h2 id="related-stories" className="mb-4 text-lg font-bold tracking-tight">Tin liên quan</h2>
        <ul className="flex flex-col gap-3">{related.map((item) => <OtherCoverage key={item.articleId} card={item} now={now} />)}</ul>
      </section>}
      {followable.length > 0 && <section aria-labelledby="follow-actions" className="mb-8">
        <h2 id="follow-actions" className="mb-3 text-lg font-bold tracking-tight">Theo dõi</h2>
        <div className="flex flex-wrap gap-2">{followable.map((entity) => <FollowLink key={`${entity.kind}-${entity.id}`} type={followType[entity.kind]} entityId={entity.id!} name={entity.name} />)}</div>
      </section>}
      <footer className="border-t border-slate-200 pt-4 text-xs leading-6 text-slate-500">
        <p>{feedNotice}</p>
        {card.url && <p>{card.attribution} · <a href={card.url} target="_blank" rel="noopener noreferrer nofollow" className="underline underline-offset-4" aria-label={`Xem bài gốc trên ${card.publisher} (mở thẻ mới)`}>Xem bài gốc</a></p>}
      </footer>
    </article>
  </div>;
}
