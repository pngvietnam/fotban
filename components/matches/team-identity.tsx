import type { MatchTeam } from "../../types/match-ui";
import { teamMonogram, teamName } from "../../lib/match-presentation";

export function TeamIdentity({ team, side, large = false }: { team: MatchTeam | null; side: "home" | "away"; large?: boolean }) {
  return <div className="flex min-w-0 flex-col items-center text-center">
    <span aria-hidden="true" className={`grid shrink-0 place-items-center border border-slate-200 bg-slate-50 font-black tracking-tight text-slate-700 ${large ? "h-16 w-16 rounded-2xl text-xl sm:h-20 sm:w-20 sm:text-2xl" : "h-11 w-11 rounded-xl text-sm"}`}>{teamMonogram(team)}</span>
    <span className={`mt-3 max-w-full break-words font-semibold leading-snug ${large ? "text-base sm:text-xl" : "text-sm"}`} title={team?.name || undefined}>{teamName(team, side, large)}</span>
    {large && team?.shortName && team.shortName !== team.name && <span className="mt-1 text-xs text-slate-500">{team.shortName}</span>}
  </div>;
}
