import type { Metadata } from "next";
import { env } from "@/lib/env";
import { parseTransferFilters } from "@/lib/transfer-presentation";
import { readTransferList } from "@/services/transfer-page-data";
import { TransferShell } from "@/components/transfers/transfer-shell";
import { TransferFiltersView } from "@/components/transfers/transfer-filters";
import { TransferList } from "@/components/transfers/transfer-list";
import { TransferState } from "@/components/transfers/transfer-state";
export const dynamic = "force-dynamic";
export async function generateMetadata({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }): Promise<Metadata> { const params = await searchParams; return { title: "Chuyển nhượng | Fotban", description: "Theo dõi chuyển nhượng có căn cứ: đã xác nhận, đàm phán, quan tâm và tin đồn.", alternates: { canonical: new URL("/transfers", env.NEXT_PUBLIC_APP_URL).href }, robots: { index: Object.keys(params).length === 0, follow: true } }; }
export default async function TransfersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const filters = parseTransferFilters(await searchParams); const result = filters ? await readTransferList(filters) : null;
  return <TransferShell><header className="mb-7"><p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-[#516c21]">Theo dõi diễn biến có căn cứ</p><h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Chuyển nhượng, rõ căn cứ.</h1><p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600">Đã xác nhận hay mới quan tâm? Xem trạng thái, diễn biến và nguồn của từng thương vụ.</p></header><TransferFiltersView filters={filters ?? { league: "all", status: "all", page: 1 }} />{filters && result ? <TransferList filters={filters} result={result} now={new Date()} /> : <TransferState kind="invalid" />}</TransferShell>;
}

