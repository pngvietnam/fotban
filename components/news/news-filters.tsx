import Link from "next/link";
import type { NewsFilters } from "../../types/news-ui";
import { newsHref } from "../../lib/news-presentation";
import { matchLeagues } from "../../lib/match-leagues";

export function NewsFiltersView({ filters }: { filters: NewsFilters }) {
  return <nav aria-label="Lọc tin theo giải" className="mb-8 flex flex-wrap gap-2">
    {([{ key: "all", name: "Tất cả" }, ...Object.entries(matchLeagues).map(([key, league]) => ({ key: key as NewsFilters["league"], name: league.name }))] as const).map((item) => <Link key={item.key} href={newsHref({ league: item.key, offset: 0 })} aria-current={filters.league === item.key ? "page" : undefined} className={`rounded-full border px-4 py-2.5 text-sm font-semibold ${filters.league === item.key ? "border-slate-950 bg-slate-950 text-white" : "border-slate-300 bg-white text-slate-700 hover:border-slate-600"}`}>{item.name}</Link>)}
  </nav>;
}
