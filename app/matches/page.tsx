import type { Metadata } from "next";
import { getDatabase } from "@/lib/db";
import { logger } from "@/lib/logger";
import { defaultUiFilters, isSingleDay, parseUiFilters, shiftDay } from "@/lib/match-filters";
import { countMatchesByDay, loadMatchList, nearestMatchDays, queryMatchList } from "@/services/match-ui-data";
import { MatchShell } from "@/components/matches/match-shell";
import { MatchFilters } from "@/components/matches/match-filters";
import { MatchList } from "@/components/matches/match-list";
import { MatchState } from "@/components/matches/match-state";

export const metadata: Metadata = { title: "Lịch đấu & kết quả | Fotban" };
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
  // Match counts for the seven-day strip, and the nearest match days when the chosen day is empty; both optional.
  let counts: Record<string, number> = {}; let nearest: { previous: string | null; next: string | null } | undefined;
  const db = parsed.success ? getDatabase() : null;
  if (db) {
    try {
      counts = await countMatchesByDay(db, filters.league, shiftDay(filters.from, -3), shiftDay(filters.from, 3));
      if (result?.kind === "ready" && !result.data.matches.length && isSingleDay(filters)) nearest = await nearestMatchDays(db, filters.league, filters.from);
    } catch { logger.warn({ event: "matches.ui_calendar_unavailable" }); }
  }
  return <MatchShell>
    <div className="flex flex-wrap items-end justify-between gap-5">
      <div><p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Nhịp bóng mỗi ngày</p><h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">Lịch đấu <span className="text-slate-400">&</span> kết quả<span className="text-[#628526]">.</span></h1><p className="mt-3 text-sm leading-6 text-slate-600">Ngoại hạng Anh, La Liga và Champions League, theo từng ngày.</p></div>
      <span className="rounded-full border border-slate-200 bg-white px-3 py-2 text-[11px] font-medium text-slate-600">Giờ Việt Nam · UTC+7</span>
    </div>
    <MatchFilters filters={filters} counts={counts} now={now} />
    {result ? <MatchList result={result} filters={filters} now={now} nearest={nearest} /> : <MatchState kind="invalid-filter" />}
  </MatchShell>;
}
