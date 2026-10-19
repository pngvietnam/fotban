export const leagueTabs = ["tin-tuc", "tong-quan", "bang-xep-hang", "lich-thi-dau", "doi-bong", "chuyen-nhuong"] as const;
export type LeagueTab = typeof leagueTabs[number];
export type LeagueSlug = "premier-league" | "la-liga" | "champions-league";
export type LeagueInfo = { slug: LeagueSlug; name: string; country: string; seasonName: string | null };
export type StandingRow = {
  position: number; clubId: string; name: string; shortName: string | null; tla: string | null; crestUrl: string | null;
  played: number | null; won: number | null; drawn: number | null; lost: number | null;
  goalsFor: number | null; goalsAgainst: number | null; goalDifference: number | null; points: number | null;
  /** Last five finished results, oldest first: W win, D draw, L loss. */
  form: ("W" | "D" | "L")[];
};
export type StandingsData = { rows: StandingRow[]; fetchedAt: string | null };
export type FixtureRow = {
  slug: string; kickoffAt: string; status: string; round: string | null;
  home: { name: string; tla: string | null; crestUrl: string | null }; away: { name: string; tla: string | null; crestUrl: string | null };
  homeScore: number | null; awayScore: number | null;
};
export type ClubRow = { clubId: string; name: string; shortName: string | null; tla: string | null; crestUrl: string | null; position: number | null; points: number | null };
