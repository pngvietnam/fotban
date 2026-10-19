import Link from "next/link";
import type { NewsFilters, NewsListResult } from "../../types/news-ui";
import { newsHref } from "../../lib/news-presentation";
import { NewsCard } from "./news-card";
import { NewsState } from "./news-state";
import { newsSections } from "../../services/news-sections";
export function NewsList({ result, filters, now }: { result: NewsListResult; filters: NewsFilters; now: Date }) {
  if (result.kind === "error") return <NewsState kind="error" />;
  return <>
    {!result.data.stories.length && <NewsState kind="empty" />}
    {newsSections(result.data.stories, filters.offset === 0).map((section, index) => <section key={section.title} aria-labelledby={`news-section-${index}`} className="mb-10">
      <div className="mb-4 flex items-center gap-3"><span aria-hidden="true" className="h-5 w-1 rounded bg-[#5a752b]" /><h2 id={`news-section-${index}`} className="text-lg font-bold tracking-tight">{section.title}</h2></div>
      <div className={`grid min-w-0 items-start gap-4 md:grid-cols-2 ${section.stories.length >= 3 ? "lg:grid-cols-3" : ""}`}>{section.stories.map((story) => <NewsCard key={story.slug} story={story} now={now} />)}</div>
    </section>)}
    {(filters.offset > 0 || result.data.nextOffset !== null) && <nav aria-label="Trang tin tức" className="flex flex-wrap justify-center gap-3 border-t border-slate-200 pt-6">
      {filters.offset > 0 && <Link href={newsHref({ ...filters, offset: 0 })} className="rounded-lg border border-slate-300 bg-white px-5 py-3 text-sm font-semibold">Về trang đầu</Link>}
      {result.data.nextOffset !== null && <Link href={newsHref({ ...filters, offset: result.data.nextOffset })} className="rounded-lg bg-slate-950 px-5 py-3 text-sm font-semibold text-white">Xem tin tiếp <span aria-hidden="true">→</span></Link>}
    </nav>}
  </>;
}
