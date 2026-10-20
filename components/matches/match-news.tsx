import Link from "next/link";
import type { FeedGroupView } from "../../types/feed-card";
import { newsAbsoluteTime, newsRelativeTime } from "../../lib/news-presentation";
import { NewsImage } from "../ui/news-image";
import { TeamBadge } from "../ui/team-badge";

/** Stories about both clubs first (they are about this match), then the rest by the feed's order. */
export function orderMatchNews(groups: FeedGroupView[], clubIds: string[], limit = 10) {
  const both = (group: FeedGroupView) => clubIds.length === 2 && [group.lead, ...group.others].some((card) => clubIds.every((id) => card.entities.some((entity) => entity.id === id)));
  return [...groups.filter(both), ...groups.filter((group) => !both(group))].slice(0, limit);
}

/** FotMob-style match news: a two-column list of headline, source and time, with a small picture on the right. */
export function MatchNewsList({ groups, now }: { groups: FeedGroupView[]; now: Date }) {
  if (!groups.length) return null;
  return <section aria-labelledby="match-news" className="rounded-2xl border border-slate-200 bg-white px-5 py-4 sm:px-6">
    <h2 id="match-news" className="mb-1 text-center font-bold">Tin tức</h2>
    <ul className="grid gap-x-8 md:grid-cols-2">{groups.map((group) => {
      const { lead } = group;
      const image = [lead, ...group.others].find((card) => card.image)?.image ?? null;
      const club = [lead, ...group.others].flatMap((card) => card.entities).find((entity) => entity.kind === "club" && entity.crestUrl);
      return <li key={group.key} className="border-b border-slate-100 last:border-0 md:[&:nth-last-child(2):nth-child(odd)]:border-0">
        <Link href={`/news/${lead.slug}`} className="group flex items-start gap-4 py-3.5">
          <span className="min-w-0 flex-1">
            <span className="line-clamp-3 break-words text-[15px] font-bold leading-snug text-slate-950 group-hover:underline">{lead.title}</span>
            <span className="mt-1.5 block text-xs text-slate-500">{lead.publisher} · <time dateTime={lead.publishedAt} title={newsAbsoluteTime(lead.publishedAt)}>{newsRelativeTime(lead.publishedAt, now)}</time>{group.others.length > 0 ? ` · +${group.others.length} báo` : ""}</span>
          </span>
          {/* Same-size tile for every story: the club crest underneath, the publisher picture on top when its feed has one and it loads. */}
          <span aria-hidden="true" className="relative grid h-[4.5rem] w-24 shrink-0 place-items-center overflow-hidden rounded-lg bg-slate-100 sm:h-20 sm:w-28">
            {club ? <TeamBadge name={club.name} tla={club.tla} crestUrl={club.crestUrl} size="md" /> : <span className="text-sm font-black text-slate-300">FB.</span>}
            {image && <NewsImage src={image} className="absolute inset-0" />}
          </span>
        </Link>
      </li>;
    })}</ul>
  </section>;
}
