import Link from "next/link";
import type { TransferFilters, TransferListResult } from "../../types/transfers";
import { transferHref } from "../../lib/transfer-presentation";
import { TransferCard } from "./transfer-card";
import { TransferState } from "./transfer-state";
export function TransferList({ result, filters, now }: { result: TransferListResult; filters: TransferFilters; now: Date }) {
  if (result.kind === "error") return <TransferState kind="error" />;
  return <>{!result.transfers.length && <TransferState kind="empty" filters={filters} />}<div className="grid min-w-0 items-start gap-4 md:grid-cols-2 lg:grid-cols-3">{result.transfers.map((view) => <TransferCard key={view.slug ?? view.story.slug} view={view} now={now} />)}</div>{(filters.page > 1 || result.nextPage) && <nav aria-label="Trang chuyển nhượng" className="mt-8 flex justify-center gap-3">{filters.page > 1 && <Link href={transferHref({ ...filters, page: filters.page - 1 })} className="rounded-lg border border-slate-300 px-4 py-3 text-sm font-semibold">Trang trước</Link>}{result.nextPage && <Link href={transferHref({ ...filters, page: result.nextPage })} className="rounded-lg bg-slate-950 px-4 py-3 text-sm font-semibold text-white">Xem tiếp →</Link>}</nav>}</>;
}
