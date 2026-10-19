import Link from "next/link";
import { newsTabHref, newsTabs, type NewsTab } from "../../lib/news-tabs";

/** Top menu of the news page: underlined tabs that scroll sideways on a narrow screen. */
export function NewsTabsView({ active }: { active: NewsTab }) {
  return <nav aria-label="Mục tin tức" className="-mx-4 mb-5 overflow-x-auto border-b border-slate-200 px-4 sm:mx-0 sm:px-0">
    <ul className="flex min-w-max gap-1">{newsTabs.map((tab) => <li key={tab.key}><Link href={newsTabHref(tab.key)} aria-current={active === tab.key ? "page" : undefined} className={`-mb-px block whitespace-nowrap border-b-2 px-4 py-3 text-sm font-bold ${active === tab.key ? "border-slate-950 text-slate-950" : "border-transparent text-slate-500 hover:text-slate-800"}`}>{tab.label}</Link></li>)}</ul>
  </nav>;
}
