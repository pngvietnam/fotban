import type { MatchStatus } from "@prisma/client";

export type CompetitionRef = { key: string; externalId: string; name: string; country: string };
export type SeasonRef = { externalId?: string; name: string; startsAt?: string; endsAt?: string };
export type PlayerRef = { externalId: string; name: string; position?: string; nationality?: string; birthDate?: string };
export type TeamRef = {
  externalId: string; name: string; shortName?: string; tla?: string;
  country?: string; venue?: string; externalCrestUrl?: string;
  /** Present only when the provider returned a squad (teams endpoint); absent means "not supplied", never "empty squad". */
  squad?: PlayerRef[];
};
export type NormalizedMatch = {
  externalId: string; competition: CompetitionRef; season: SeasonRef;
  home: TeamRef; away: TeamRef; kickoffAt: string; status: MatchStatus;
  providerStatus: string; providerUpdatedAt?: string; round?: string; venue?: string;
  scoreDuration?: string;
  homeScore?: number; awayScore?: number;
  homeExtraTimeScore?: number; awayExtraTimeScore?: number;
  homePenaltyScore?: number; awayPenaltyScore?: number;
  sourceUrl: string;
};
export type StandingRow = {
  competition: CompetitionRef; season: SeasonRef; team: TeamRef;
  stage: string; group: string; tableType: string; position: number;
  playedGames?: number; won?: number; drawn?: number; lost?: number; points?: number;
  goalsFor?: number; goalsAgainst?: number; goalDifference?: number;
};
export type ProviderBatch<T> = { items: T[]; skipped: number; warnings: string[] };
export type CompetitionData = { competition: CompetitionRef; season?: SeasonRef };
export type TeamsData = { competition: CompetitionRef; season: SeasonRef; teams: ProviderBatch<TeamRef> };
export type MatchQuery = { competition: string; dateFrom: string; dateTo: string; season?: number };
export type UnavailableData = { available: false; reason: string };

export interface MatchProvider {
  readonly id: string;
  readonly attribution: { text: string; url: string };
  readonly capabilities: { events: boolean; advancedStats: boolean; standings: boolean; realtime: boolean };
  getCompetitions(): Promise<ProviderBatch<CompetitionData>>;
  getTeams(competition: string, season?: number): Promise<TeamsData>;
  getMatches(query: MatchQuery): Promise<ProviderBatch<NormalizedMatch>>;
  getMatch(externalId: string): Promise<NormalizedMatch>;
  getMatchEvents(externalId: string): Promise<UnavailableData>;
  getMatchStats(externalId: string): Promise<UnavailableData>;
  getStandings(competition: string, season?: number): Promise<ProviderBatch<StandingRow>>;
}
