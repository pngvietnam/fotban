import Link from "next/link";
import type { NewsStory } from "../../types/news-ui";
import { newsAbsoluteTime, newsRelativeTime, storyLabels, transferLabels } from "../../lib/news-presentation";
import { ReliabilityBadge } from "./reliability-badge";
import { NewsState } from "./news-state";

export function NewsEntities({ story }: { story: NewsStory }) {
  return <ul aria-label="Nhân vật và đội bóng liên quan" className="flex flex-wrap gap-2">
    {story.entities.filter((entity) => entity.kind !== "league").map((entity) => <li key={`${entity.kind}-${entity.name}`} className="inline-flex max-w-full items-center gap-2 rounded-md bg-slate-100 px-2 py-1.5 text-xs font-medium text-slate-700"><span aria-hidden="true" className="grid h-6 min-w-6 place-items-center rounded bg-white px-1 text-[10px] font-bold text-slate-600">{entity.initials}</span><span className="break-words">{entity.name}</span></li>)}
  </ul>;
}
export function TransferPreview({ story }: { story: NewsStory }) {
  if (!story.transfer) return null;
  const tone = story.transfer.status === "CONFIRMED" ? "border-emerald-200 bg-emerald-50 text-emerald-950" : story.transfer.status === "NEGOTIATION" ? "border-blue-200 bg-blue-50 text-blue-950" : "border-amber-200 bg-amber-50 text-amber-950";
  return <div className={`rounded-lg border px-3 py-2 text-sm leading-6 ${tone}`}>
    <span className="font-semibold">Chuyển nhượng · {transferLabels[story.transfer.status]}</span>
    {story.transfer.player && <p>{story.transfer.player}</p>}
    {story.transfer.currentClub && <p>CLB hiện tại: {story.transfer.currentClub}</p>}
    {story.transfer.targetClub && <p>CLB quan tâm / đích đến: {story.transfer.targetClub}</p>}
    {story.transfer.status !== "CONFIRMED" && <p className="text-xs">Chưa xác nhận hoàn tất thương vụ.</p>}
  </div>;
}
export function NewsCard({ story, now }: { story: NewsStory; now: Date }) {
  if (!story.titleVi?.trim() || !story.summaryVi?.trim()) return <NewsState kind="pending" />;
  const names = [...new Set(story.sources.map((source) => source.name))];
  return <article className="news-card flex min-w-0 flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
    <div className="mb-4 flex flex-wrap items-center gap-2"><ReliabilityBadge reliability={story.reliability} /><span className="text-xs font-semibold text-slate-500">{storyLabels[story.storyType] ?? "Bóng đá"}</span></div>
    <h3 className="break-words text-xl font-bold leading-snug tracking-tight"><Link href={`/news/${story.slug}`} className="decoration-2 underline-offset-4 hover:underline">{story.titleVi}</Link></h3>
    <p className="mt-3 line-clamp-3 break-words text-sm leading-7 text-slate-600">{story.summaryVi}</p>
    <p className="mt-3 text-xs font-medium text-slate-600">{story.reliability.badge.certaintyVi}{story.reliability.label === "SOCIAL" ? " · Ý kiến cộng đồng, không phải xác nhận sự kiện" : ""}</p>
    <div className="my-4"><NewsEntities story={story} /></div>
    <TransferPreview story={story} />
    <div className="mt-auto border-t border-slate-100 pt-4">
      <p className="mt-3 text-xs leading-6 text-slate-600"><Link href={`/news/${story.slug}#sources`} className="underline decoration-slate-300 underline-offset-4" aria-label={`Xem nguồn cho tin: ${story.titleVi}`}>Nguồn: {names.slice(0, 3).join(" · ")}{names.length > 3 ? ` · +${names.length - 3} nguồn` : ""}</Link></p>
      {story.sourceCount > 1 && <p className="text-xs leading-6 text-slate-500">{story.sourceCount} nguồn{story.independentSourceCount > 1 ? ` · ${story.independentSourceCount} nguồn độc lập` : " · Có thể cùng nguồn gốc"}</p>}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs"><time dateTime={story.updatedAt} title={newsAbsoluteTime(story.updatedAt)} className="text-slate-500">{newsRelativeTime(story.updatedAt, now)}</time><Link href={`/news/${story.slug}`} aria-label={`Đọc tin: ${story.titleVi}`} className="rounded-md py-2 font-bold text-slate-950 hover:underline">Đọc tin <span aria-hidden="true">↗</span></Link></div>
    </div>
  </article>;
}
