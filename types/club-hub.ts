import type { FixtureRow, LeagueSlug, StandingRow, StandingsData } from "./league-hub";

export const clubTabs = ["tong-quan", "bang-xep-hang", "lich-thi-dau", "cau-thu", "tin-tuc", "chuyen-nhuong", "lich-su", "vui"] as const;
export type ClubTab = typeof clubTabs[number];
export type ClubProfile = {
  clubId: string; slug: string; name: string; shortName: string | null; tla: string | null; crestUrl: string | null; venue: string | null; country: string | null;
  league: { slug: LeagueSlug; name: string; seasonName: string | null } | null;
};
export type SquadPlayer = { playerId: string; name: string; position: string | null; nationality: string | null; photoUrl: string | null; birthDate: string | null };
export type ClubFixtures = { recent: FixtureRow[]; upcoming: FixtureRow[] };
export type ClubStanding = { row: StandingRow; fetchedAt: string | null };
/** A competition the club plays in this season, with the table the club sits in. */
export type ClubTable = { slug: LeagueSlug; name: string; data: StandingsData; row: StandingRow | null };
/** One of the club's players among the competition's stored top scorers. */
export type ClubScorer = { name: string; goals: number; assists: number | null; penalties: number | null; playerPath: string | null; photoUrl: string | null; competition: string };
