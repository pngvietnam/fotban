import type { MatchSummary } from "../../types/match-ui";
import { scorePresentation } from "../../lib/match-presentation";

export function MatchScore({ match, large = false }: { match: MatchSummary; large?: boolean }) {
  const score = scorePresentation(match);
  return <div className="flex min-w-0 flex-col items-center px-1 text-center">
    <span className={`whitespace-nowrap font-black tabular-nums tracking-tight ${large ? "text-3xl sm:text-5xl" : "text-2xl"}`} aria-label={`${score.label}: ${score.text}`}>{score.text}</span>
    <span className="mt-1 text-[11px] leading-4 text-slate-500">{score.label}</span>
    {score.penalties && <span className="mt-2 whitespace-nowrap rounded bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-700">Luân lưu {score.penalties}</span>}
    {large && score.regulation && <span className="mt-2 text-xs text-slate-500">90 phút: {score.regulation}</span>}
  </div>;
}
