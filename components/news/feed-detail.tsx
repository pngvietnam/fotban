import Link from "next/link";
import type { FeedCardView } from "../../types/feed-card";
import { feedNotice, officialWordingNotice } from "../../lib/feed-card-presentation";
import { newsAbsoluteTime, newsRelativeTime } from "../../lib/news-presentation";
import { FeedEntities, FeedLabels, FeedTransferNote } from "./feed-card";

function OtherCoverage({ card, now }: { card: FeedCardView; now: Date }) {
  return <li className="min-w-0 rounded-xl border border-slate-200 bg-white p-5">
    <p className="mb-2 text-xs font-semibold text-slate-500">{card.publisher} · <time dateTime={card.publishedAt} title={newsAbsoluteTime(card.publishedAt)}>{newsRelativeTime(card.publishedAt, now)}</time></p>
    <h3 className="break-words font-bold leading-snug"><Link href={`/news/${card.slug}`} className="underline-offset-4 hover:underline">{card.title}</Link></h3>
    {card.description && <p className="mt-2 break-words text-sm leading-7 text-slate-600">{card.description}</p>}
  </li>;
}
/** Publisher card page: the publisher's own headline and description, other coverage, attribution. */
export function FeedDetailView({ card, others, now }: { card: FeedCardView; others: FeedCardView[]; now: Date }) {
  return <div className="mx-auto max-w-3xl">
    <nav aria-label="Đường dẫn" className="mb-6 text-sm"><Link href="/news" className="inline-block rounded py-2 font-semibold text-slate-600 hover:underline">← Tất cả tin tức</Link></nav>
    <article>
      <header className="mb-6">
        <div className="mb-5"><FeedLabels card={card} /></div>
        <h1 className="break-words text-3xl font-bold leading-tight tracking-tight sm:text-4xl">{card.title}</h1>
        <p className="mt-4 text-sm text-slate-600"><span className="font-semibold text-slate-900">{card.attribution}</span> · <time dateTime={card.publishedAt}>{newsAbsoluteTime(card.publishedAt)}</time>{card.originHint ? ` · dẫn lại ${card.originHint}` : ""}</p>
      </header>
      {card.description && <blockquote className="mb-6 border-l-4 border-sky-600 bg-white px-5 py-4 text-lg leading-8 text-slate-800">{card.description}</blockquote>}
      {card.officialWording && <p className="mb-4 text-sm leading-7 text-slate-600">{officialWordingNotice}</p>}
      <div className="mb-8 flex flex-col gap-3"><FeedTransferNote card={card} /><FeedEntities card={card} />
        {card.match && <p className="text-sm"><Link href={`/match/${encodeURIComponent(card.match.slug)}`} className="font-semibold underline underline-offset-4">Xem trận {card.match.home} – {card.match.away}</Link></p>}
      </div>
      {others.length > 0 && <section aria-labelledby="other-coverage" className="mb-8">
        <h2 id="other-coverage" className="mb-4 text-lg font-bold tracking-tight">Các báo khác cùng đưa tin ({others.length})</h2>
        <ul className="flex flex-col gap-3">{others.map((other) => <OtherCoverage key={other.articleId} card={other} now={now} />)}</ul>
      </section>}
      <footer className="border-t border-slate-200 pt-4 text-xs leading-6 text-slate-500">
        <p>{feedNotice}</p>
        {card.url && <p>{card.attribution} · <a href={card.url} target="_blank" rel="noopener noreferrer nofollow" className="underline underline-offset-4" aria-label={`Xem bài gốc trên ${card.publisher} (mở thẻ mới)`}>Xem bài gốc</a></p>}
      </footer>
    </article>
  </div>;
}
