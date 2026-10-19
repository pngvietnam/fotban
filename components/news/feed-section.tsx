import Link from "next/link";
import type { FeedFilters, FeedListResult } from "../../types/feed-card";
import { feedNotice } from "../../lib/feed-card-presentation";
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
    <div className="grid min-w-0 items-start gap-4 md:grid-cols-2 lg:grid-cols-3">{result.data.groups.map((group) => <FeedGroupCard key={group.key} group={group} now={now} />)}</div>
    {(filters.offset > 0 || result.data.nextOffset !== null) && <nav aria-label="Trang tin báo chí" className="mt-6 flex flex-wrap justify-center gap-3">
      {filters.offset > 0 && <Link href={feedHref(filters, 0)} className="rounded-lg border border-slate-300 bg-white px-5 py-3 text-sm font-semibold">Tin mới nhất</Link>}
      {result.data.nextOffset !== null && <Link href={feedHref(filters, result.data.nextOffset)} className="rounded-lg bg-slate-950 px-5 py-3 text-sm font-semibold text-white">Xem thêm tin <span aria-hidden="true">→</span></Link>}
    </nav>}
  </section>;
}
