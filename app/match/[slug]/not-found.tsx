import { MatchShell } from "@/components/matches/match-shell";
import { MatchState } from "@/components/matches/match-state";
export default function NotFound() { return <MatchShell><h1 className="sr-only">Không tìm thấy trận đấu</h1><MatchState kind="not-found" /></MatchShell>; }
