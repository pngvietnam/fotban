import { statusLabels } from "../../lib/transfer-presentation";
import type { TransferStatus } from "../../types/transfers";
const styles = { CONFIRMED: "border-emerald-200 bg-emerald-50 text-emerald-950", NEGOTIATION: "border-blue-200 bg-blue-50 text-blue-950", INTEREST: "border-slate-300 bg-slate-100 text-slate-800", RUMOR: "border-amber-200 bg-amber-50 text-amber-950" };
export function TransferStatusBadge({ status, disputed = false }: { status: TransferStatus; disputed?: boolean }) {
  return <span className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-bold ${disputed ? "border-rose-200 bg-rose-50 text-rose-900" : styles[status]}`}><span aria-hidden="true">{disputed ? "!" : status === "CONFIRMED" ? "✓" : status === "NEGOTIATION" ? "↔" : status === "INTEREST" ? "○" : "?"}</span>{disputed ? "Thông tin mâu thuẫn" : statusLabels[status]}</span>;
}
