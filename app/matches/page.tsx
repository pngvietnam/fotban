import type { Metadata } from "next";
import { getDatabase } from "@/lib/db";
import { logger } from "@/lib/logger";
import { defaultUiFilters, parseUiFilters } from "@/lib/match-filters";
import { loadMatchList, queryMatchList } from "@/services/match-ui-data";
import { MatchShell } from "@/components/matches/match-shell";
import { MatchFilters } from "@/components/matches/match-filters";
import { MatchList } from "@/components/matches/match-list";
import { MatchState } from "@/components/matches/match-state";

export const metadata: Metadata = { title: "Lịch đấu & kết quả | Football Morning Brief" };
export const dynamic = "force-dynamic";
export default async function MatchesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const now = new Date();
  const parsed = parseUiFilters(await searchParams, now);
  const filters = parsed.success ? parsed.data : defaultUiFilters(now);
  const result = parsed.success ? await loadMatchList(async () => {
    const db = getDatabase();
    if (!db) throw new Error("Database unavailable");
    return queryMatchList(db, filters);
  }, () => logger.error({ requestId: crypto.randomUUID() }, "matches.ui_list_failed")) : null;
  return <MatchShell>
    <div className="flex flex-wrap items-end justify-between gap-5">
      <div><p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Nhịp bóng mỗi ngày</p><h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">Lịch đấu <span className="text-slate-400">&</span> kết quả<span className="text-[#628526]">.</span></h1><p className="mt-3 text-sm leading-6 text-slate-600">Premier League và La Liga, trong một góc nhìn.</p></div>
      <span className="rounded-full border border-slate-200 bg-white px-3 py-2 text-[11px] font-medium text-slate-600">Giờ Việt Nam · UTC+7</span>
    </div>
    <MatchFilters filters={filters} />
    {result ? <MatchList result={result} filters={filters} now={now} /> : <MatchState kind="invalid-filter" />}
  </MatchShell>;
}
