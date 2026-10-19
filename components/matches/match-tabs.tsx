import Link from "next/link";
import { matchTabHref, matchTabs, type MatchTab } from "../../lib/match-tabs";

/** FotMob-style tab row under the scoreboard; scrolls sideways on a narrow screen. */
export function MatchTabsView({ slug, active }: { slug: string; active: MatchTab }) {
  return <nav aria-label="Mục của trận đấu" className="-mx-4 mt-6 overflow-x-auto border-b border-slate-200 px-4 sm:mx-0 sm:px-0">
    <ul className="flex min-w-max gap-1">{matchTabs.map((tab) => <li key={tab.key}><Link href={matchTabHref(slug, tab.key)} aria-current={active === tab.key ? "page" : undefined} className={`-mb-px block whitespace-nowrap border-b-2 px-4 py-3 text-sm font-bold ${active === tab.key ? "border-slate-950 text-slate-950" : "border-transparent text-slate-500 hover:text-slate-800"}`}>{tab.label}</Link></li>)}</ul>
  </nav>;
}
