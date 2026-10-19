import Link from "next/link";
import type { TransferFacts, TransferView } from "../../types/transfers";
import { newsAbsoluteTime, newsRelativeTime } from "../../lib/news-presentation";
import { dealLabels } from "../../lib/transfer-presentation";
import { matchLeagues } from "../../lib/match-leagues";
import { ReliabilityBadge } from "../news/reliability-badge";
import { TransferStatusBadge } from "./transfer-status";

export function TransferLeagues({ view }: { view: TransferView }) {
  const names = view.story.leagueSlugs.flatMap((slug) => slug in matchLeagues ? [matchLeagues[slug as keyof typeof matchLeagues].name] : []);
  return names.length ? <p className="mt-3 text-xs font-semibold text-slate-500">{names.join(" · ")}</p> : null;
}

export function TransferTerms({ facts, detailed = false, sourceKeys = [], sourcePrefix = "" }: { facts: TransferFacts; detailed?: boolean; sourceKeys?: string[]; sourcePrefix?: string }) {
  const citation = (articleId: string) => { const index = sourceKeys.indexOf(articleId); return index < 0 ? null : <Link href={`${sourcePrefix}#source-${index + 1}`} className="ml-2 inline-block rounded underline underline-offset-4" aria-label="Xem nguồn của điều khoản chuyển nhượng">Nguồn ↗</Link>; };
  return <div className="text-xs leading-7 text-slate-600">
    {facts.confirmedFee && <p><span className="font-semibold text-emerald-900">Phí được xác nhận:</span> {facts.confirmedFee.value} · {facts.confirmedFee.currency}{citation(facts.confirmedFee.articleId)}</p>}
    {facts.reportedFee && <p><span className="font-semibold text-amber-900">Phí được đưa tin:</span> {facts.reportedFee.value} · {facts.reportedFee.currency} · Chưa xác nhận chính thức{citation(facts.reportedFee.articleId)}</p>}
    {!facts.confirmedFee && !facts.reportedFee && <p>Chưa có phí được dẫn nguồn</p>}
    {detailed && <>{facts.transferType && <p>Hình thức: {dealLabels[facts.transferType.value]}{citation(facts.transferType.articleId)}</p>}{facts.contractDuration && <p>Thời hạn theo nguồn: {facts.contractDuration.value}{citation(facts.contractDuration.articleId)}</p>}{facts.contractExpiry && <p>Hết hạn theo nguồn: {facts.contractExpiry.value}{citation(facts.contractExpiry.articleId)}</p>}{facts.extensionDuration && <p>Gia hạn theo nguồn: {facts.extensionDuration.value}{citation(facts.extensionDuration.articleId)}</p>}</>}
  </div>;
}
export function TransferRelationship({ view }: { view: TransferView }) {
  const transfer = view.story.transfer;
  const player = transfer?.player ?? "Chưa ánh xạ cầu thủ";
  const initials = view.story.entities.find((entity) => entity.kind === "player" && entity.name === transfer?.player)?.initials ?? "CT";
  return <div className="my-4"><div className="mb-3 flex items-center gap-3"><span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-xs font-bold text-slate-600">{initials}</span><p className="break-words text-lg font-bold">{player}</p></div><dl className="grid min-w-0 grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3"><div className="min-w-0"><dt className="text-[11px] text-slate-500">CLB hiện tại theo nguồn</dt><dd className="mt-1 break-words text-sm font-semibold">{transfer?.currentClub ?? "Chưa rõ CLB hiện tại"}</dd></div><div className="min-w-0"><dt className="text-[11px] text-slate-500">CLB đích đến theo nguồn</dt><dd className="mt-1 break-words text-sm font-semibold">{transfer?.targetClub ?? "Chưa rõ đích đến"}</dd></div></dl></div>;
}
export function TransferCard({ view, now }: { view: TransferView; now: Date }) {
  const href = view.slug ? `/transfers/${view.slug}` : `/news/${view.story.slug}`;
  const names = [...new Set(view.story.sources.map((source) => source.name))];
  return <article className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><TransferStatusBadge status={view.status} disputed={view.disputed} /><TransferLeagues view={view} /><TransferRelationship view={view} /><h2 className="break-words text-lg font-bold leading-snug"><Link href={href} className="underline-offset-4 hover:underline">{view.story.titleVi}</Link></h2><p className="mb-3 mt-2 line-clamp-3 break-words text-sm leading-7 text-slate-600">{view.story.summaryVi}</p><TransferTerms facts={view.facts} sourceKeys={view.story.sources.map((source) => source.key)} sourcePrefix={href} />
    <div className="mt-3 border-t border-slate-100 pt-3"><ReliabilityBadge reliability={view.story.reliability} /><p className="mt-2 text-xs leading-6 text-slate-600">{view.story.reliability.badge.certaintyVi}{view.status !== "CONFIRMED" ? " · Chưa xác nhận hoàn tất" : ""}</p><Link href={`${href}#sources`} className="inline-block py-2 text-xs leading-6 text-slate-600 underline underline-offset-4" aria-label={`Xem nguồn: ${view.story.titleVi}`}>Nguồn: {names.slice(0, 3).join(" · ")}{names.length > 3 ? ` · +${names.length - 3} nguồn` : ""}</Link><p className="text-xs text-slate-500">{view.story.sourceCount} nguồn{view.story.independentSourceCount > 1 ? ` · ${view.story.independentSourceCount} nguồn độc lập` : ""}</p><div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs"><time dateTime={view.lastUpdatedAt} title={newsAbsoluteTime(view.lastUpdatedAt, view.lastUpdatedDateOnly)} className="text-slate-500">{newsRelativeTime(view.lastUpdatedAt, now, view.lastUpdatedDateOnly)}</time><Link href={href} className="rounded py-2 font-bold" aria-label={`Theo dõi thương vụ: ${view.story.titleVi}`}>{view.slug ? "Xem diễn biến ↗" : "Xem tin & nguồn ↗"}</Link></div></div>
  </article>;
}


