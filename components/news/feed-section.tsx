import Link from "next/link";
import type { FeedFilters, FeedListResult } from "../../types/feed-card";
import { feedNotice } from "../../lib/feed-card-presentation";
import { newsAbsoluteTime, newsRelativeTime } from "../../lib/news-presentation";
import { FeedGroupCard } from "./feed-card";

function feedHref(filters: FeedFilters, offset: number) {
  const query = new URLSearchParams();
  if (filters.league !== "all") query.set("league", filters.league);
  if (offset) query.set("bao", String(offset));
  return `/news${query.size ? `?${query}` : ""}#tin-bao-chi`;
}
/** Attributed Vietnamese publisher cards, shown apart from verified stories. */
export function FeedSection({ result, filters, now }: { result: FeedListResult; filters: FeedFilters; now: Date }) {
  if (result.kind === "error") return <p role="alert" className="mb-10 rounded-xl border border-dashed border-slate-300 bg-white px-5 py-6 text-sm text-slate-600">Chưa thể tải tin từ báo chí. Vui lòng thử lại sau.</p>;
  if (!result.data.groups.length) return null;
  return <section id="tin-bao-chi" aria-labelledby="feed-section-title" className="mb-10 scroll-mt-6">
    <div className="mb-2 flex items-center gap-3"><span aria-hidden="true" className="h-5 w-1 rounded bg-sky-600" /><h2 id="feed-section-title" className="text-lg font-bold tracking-tight">Tin từ báo chí Việt Nam</h2></div>
    <p className="mb-4 text-xs leading-6 text-slate-500">{feedNotice} Tin trùng giữa các báo được gộp lại.</p>
    <div className="grid min-w-0 items-start gap-4 md:grid-cols-2 lg:grid-cols-3">{result.data.groups.map((group, index) => <FeedGroupCard key={group.key} group={group} now={now} featured={filters.offset === 0 && index === 0 && group.others.length > 0} />)}</div>
    {(filters.offset > 0 || result.data.nextOffset !== null) && <nav aria-label="Trang tin báo chí" className="mt-6 flex flex-wrap justify-center gap-3">
      {filters.offset > 0 && <Link href={feedHref(filters, 0)} className="rounded-lg border border-slate-300 bg-white px-5 py-3 text-sm font-semibold">Tin mới nhất</Link>}
      {result.data.nextOffset !== null && <Link href={feedHref(filters, result.data.nextOffset)} className="rounded-lg bg-slate-950 px-5 py-3 text-sm font-semibold text-white">Xem thêm tin <span aria-hidden="true">→</span></Link>}
    </nav>}
  </section>;
}

/** Compact top stories for the homepage. Independent of the Morning Brief: the Brief is an immutable,
 * evidence-gated document, while these are live attributed publisher cards. Silent on error/empty. */
export function FeedHomeSection({ result, now, limit = 6 }: { result: FeedListResult; now: Date; limit?: number }) {
  if (result.kind !== "ready" || !result.data.groups.length) return null;
  return <section aria-labelledby="home-feed" className="mt-8">
    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2"><h2 id="home-feed" className="text-xl font-bold tracking-tight">Tin từ báo chí Việt Nam</h2><Link href="/news" className="text-sm font-semibold underline underline-offset-4">Xem tất cả tin →</Link></div>
    <p className="mb-3 text-xs leading-5 text-slate-500">{feedNotice}</p>
    <ul className="grid min-w-0 gap-3 md:grid-cols-2">{result.data.groups.slice(0, limit).map((group) => <li key={group.key} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4">
      <p className="mb-2 text-[11px] font-semibold text-slate-500">{group.lead.attribution} · <time dateTime={group.lead.publishedAt} title={newsAbsoluteTime(group.lead.publishedAt)}>{newsRelativeTime(group.lead.publishedAt, now)}</time>{group.others.length > 0 ? ` · +${group.others.length} báo` : ""}</p>
      <h3 className="break-words font-bold leading-snug"><Link href={`/news/${group.lead.slug}`} className="underline-offset-4 hover:underline">{group.lead.title}</Link></h3>
    </li>)}</ul>
  </section>;
}
