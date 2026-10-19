import Link from "next/link";
import { matchLeagues } from "../../lib/match-leagues";
import { statusLabels, transferHref } from "../../lib/transfer-presentation";
import type { TransferFilters, TransferStatus } from "../../types/transfers";
export function TransferFiltersView({ filters }: { filters: TransferFilters }) {
  const active = "border-slate-950 bg-slate-950 text-white"; const idle = "border-slate-300 bg-white text-slate-700 hover:border-slate-600";
  return <div className="mb-7 grid gap-3"><nav aria-label="Lọc chuyển nhượng theo giải" className="flex flex-wrap gap-2">{([{ key: "all", name: "Tất cả giải" }, ...Object.entries(matchLeagues).map(([key, league]) => ({ key: key as TransferFilters["league"], name: league.name }))]).map((league) => <Link key={league.key} href={transferHref({ ...filters, league: league.key as TransferFilters["league"], page: 1 })} aria-current={filters.league === league.key ? "page" : undefined} className={`rounded-full border px-4 py-2.5 text-sm font-semibold ${filters.league === league.key ? active : idle}`}>{league.name}</Link>)}</nav>
    <nav aria-label="Lọc trạng thái chuyển nhượng" className="flex flex-wrap gap-2">{([{ key: "all", name: "Tất cả trạng thái" }, ...Object.entries(statusLabels).map(([key, name]) => ({ key: key as TransferStatus, name }))]).map((status) => <Link key={status.key} href={transferHref({ ...filters, status: status.key as TransferFilters["status"], page: 1 })} aria-current={filters.status === status.key ? "page" : undefined} className={`rounded-lg border px-3 py-2.5 text-xs font-semibold ${filters.status === status.key ? active : idle}`}>{status.name}</Link>)}</nav></div>;
}
