import type { MatchSummary } from "../../types/match-ui";
import { matchStatusLabels } from "../../lib/match-presentation";

export function MatchStatusBadge({ status }: { status: MatchSummary["status"] }) {
  const live = status === "LIVE" || status === "HALFTIME";
  const tone = live ? "bg-red-50 text-red-800 ring-red-200" : status === "POSTPONED" || status === "SUSPENDED" ? "bg-amber-50 text-amber-900 ring-amber-200" : status === "CANCELLED" ? "bg-slate-100 text-slate-600 ring-slate-200" : status === "FINISHED" ? "bg-emerald-50 text-emerald-900 ring-emerald-200" : "bg-blue-50 text-blue-900 ring-blue-200";
  return <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${tone}`}>
    {live && <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-red-600" />}{matchStatusLabels[status] ?? "Chưa rõ trạng thái"}
  </span>;
}
