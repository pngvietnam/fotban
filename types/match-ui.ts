import type { MatchStatus } from "@prisma/client";

export type MatchDate = Date | string;
export type MatchTeam = { id?: string; name?: string | null; shortName?: string | null; tla?: string | null; externalCrestUrl?: string | null };
export type MatchSummary = {
  id: string; slug: string; status: MatchStatus; kickoffAt: MatchDate;
  round?: string | null; venue?: string | null;
  homeScore?: number | null; awayScore?: number | null;
  homeExtraTimeScore?: number | null; awayExtraTimeScore?: number | null;
  homePenaltyScore?: number | null; awayPenaltyScore?: number | null;
  scoreDuration?: string | null; lastUpdatedAt?: MatchDate | null;
  league: { id?: string; slug: string; name: string }; season: { name: string };
  homeClub: MatchTeam | null; awayClub: MatchTeam | null;
  attribution?: { text: string; url: string } | null;
};
export type MatchDetail = MatchSummary & {
  events: { type: string; minute: number | null; addedMinute: number | null; detail: string | null;
    club: { name: string } | null; player: { name: string } | null; relatedPlayer: { name: string } | null }[];
  stats: { metric: string; value: string; unit: string | null; club: { name: string }; player: { name: string } | null }[];
};
