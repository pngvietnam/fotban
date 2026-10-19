import type { MatchTeam } from "../../types/match-ui";
import { teamName } from "../../lib/match-presentation";
import { TeamBadge } from "../ui/team-badge";

export function TeamIdentity({ team, side, large = false }: { team: MatchTeam | null; side: "home" | "away"; large?: boolean }) {
  return <div className="flex min-w-0 flex-col items-center text-center">
    <TeamBadge name={team?.name || team?.shortName || teamName(team, side)} tla={team?.tla} crestUrl={team?.externalCrestUrl} size={large ? "lg" : "md"} />
    <span className={`mt-3 max-w-full break-words font-semibold leading-snug ${large ? "text-base sm:text-xl" : "text-sm"}`} title={team?.name || undefined}>{teamName(team, side, large)}</span>
    {large && team?.shortName && team.shortName !== team.name && <span className="mt-1 text-xs text-slate-500">{team.shortName}</span>}
  </div>;
}
