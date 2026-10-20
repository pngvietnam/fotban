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
export type LineupPlayerView = {
  name: string; fullName?: string | null; number: number | null; position: string | null; starter: boolean; row: number | null; slot: number | null; playerId: string | null; photoUrl?: string | null;
  /** Provider match rating (0-10), minutes played and per-player figures, from the box score. */
  rating?: number | null; minutes?: number | null; stats?: Record<string, number>;
};
export type MatchDetail = MatchSummary & {
  events: { type: string; minute: number | null; addedMinute: number | null; detail: string | null;
    playerName?: string | null; relatedPlayerName?: string | null;
    club: { id?: string; name: string } | null; player: { id?: string; name: string } | null; relatedPlayer: { id?: string; name: string } | null }[];
  stats: { metric: string; value: string; unit: string | null; club: { id?: string; name: string }; player: { name: string } | null }[];
  lineups?: { clubId: string; formation: string | null; players: LineupPlayerView[] }[];
  referee?: string | null;
  /** Venue and weather as reported by the detail provider. */
  venueInfo?: { name: string | null; city: string | null; capacity: number | null; weather: string | null; temperatureC: number | null } | null;
  /** Shots with outcome and where they went in the goal frame (no pitch coordinates). */
  shots?: { clubId: string; minute: number | null; addedMinute: number | null; playerName: string | null; outcome: string; goalTarget: string | null; player: { id: string; name: string } | null }[];
  /** Credits for event/lineup/statistics providers other than the match's own source. */
  detailAttributions?: { text: string; url: string }[];
};
