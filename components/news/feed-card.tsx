import Link from "next/link";
import type { FeedCardView, FeedGroupView } from "../../types/feed-card";
import { feedCertaintyText, feedLabelText, feedTransferText, officialWordingNotice } from "../../lib/feed-card-presentation";
import { newsAbsoluteTime, newsRelativeTime, storyLabels } from "../../lib/news-presentation";

const labelStyles = { MEDIA: "border-sky-200 bg-sky-50 text-sky-900", COMMUNITY: "border-violet-200 bg-violet-50 text-violet-900" };
/** Media/community label plus wording-based certainty; never a confirmation badge. */
export function FeedLabels({ card }: { card: FeedCardView }) {
  return <div className="flex flex-wrap items-center gap-2">
    <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-semibold ${labelStyles[card.label]}`}><span aria-hidden="true">●</span>{feedLabelText[card.label]}</span>
    <span className={`rounded-md px-2 py-1 text-xs font-semibold ${card.certainty === "UNCONFIRMED" ? "bg-amber-50 text-amber-950" : "bg-slate-100 text-slate-700"}`}>{feedCertaintyText[card.certainty]}</span>
    <span className="text-xs font-semibold text-slate-500">{storyLabels[card.storyType] ?? "Bóng đá"}</span>
  </div>;
}
export function FeedTransferNote({ card }: { card: FeedCardView }) {
  if (!card.transferStage) return null;
  return <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-6 text-amber-950"><span className="font-semibold">Chuyển nhượng · {feedTransferText[card.transferStage]}</span> · Theo cách báo đưa tin, chưa phải xác nhận hoàn tất.</p>;
}
export function FeedEntities({ card }: { card: FeedCardView }) {
  const shown = card.entities.filter((entity) => entity.kind !== "league").slice(0, 4);
  if (!shown.length) return null;
  return <ul aria-label="Đội bóng và cầu thủ liên quan" className="flex flex-wrap gap-2">
    {shown.map((entity) => <li key={`${entity.kind}-${entity.id ?? entity.name}`} className="inline-flex max-w-full items-center gap-2 rounded-md bg-slate-100 px-2 py-1.5 text-xs font-medium text-slate-700"><span aria-hidden="true" className="grid h-6 min-w-6 place-items-center rounded bg-white px-1 text-[10px] font-bold text-slate-600">{entity.initials}</span><span className="break-words">{entity.name}</span></li>)}
  </ul>;
}
export function FeedGroupCard({ group, now }: { group: FeedGroupView; now: Date }) {
  const { lead } = group;
  const publishers = [...new Set(group.others.map((card) => card.publisher))].filter((name) => name !== lead.publisher);
  return <article className="news-card flex min-w-0 flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
    <div className="mb-4"><FeedLabels card={lead} /></div>
    <h3 className="break-words text-xl font-bold leading-snug tracking-tight"><Link href={`/news/${lead.slug}`} className="decoration-2 underline-offset-4 hover:underline">{lead.title}</Link></h3>
    {lead.description && <p className="mt-3 line-clamp-3 break-words text-sm leading-7 text-slate-600">{lead.description}</p>}
    {lead.officialWording && <p className="mt-3 text-xs leading-6 text-slate-500">{officialWordingNotice}</p>}
    <div className="my-4 flex flex-col gap-3"><FeedEntities card={lead} /><FeedTransferNote card={lead} /></div>
    <div className="mt-auto border-t border-slate-100 pt-4 text-xs leading-6 text-slate-600">
      <p><span className="font-semibold text-slate-800">{lead.attribution}</span>{lead.originHint ? ` · dẫn lại ${lead.originHint}` : ""}</p>
      {publishers.length > 0 && <p className="text-slate-500">Cùng đưa tin: {publishers.slice(0, 3).join(" · ")}{publishers.length > 3 ? ` · +${publishers.length - 3} báo` : ""}</p>}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3"><time dateTime={lead.publishedAt} title={newsAbsoluteTime(lead.publishedAt)} className="text-slate-500">{newsRelativeTime(lead.publishedAt, now)}</time><Link href={`/news/${lead.slug}`} aria-label={`Xem tin: ${lead.title}`} className="rounded-md py-2 font-bold text-slate-950 hover:underline">Xem tin <span aria-hidden="true">→</span></Link></div>
    </div>
  </article>;
}
