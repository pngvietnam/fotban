import type { FixtureRow, LeagueSlug, StandingRow } from "./league-hub";

export const clubTabs = ["tong-quan", "tin-tuc", "lich-thi-dau", "chuyen-nhuong", "cau-thu", "vui"] as const;
export type ClubTab = typeof clubTabs[number];
export type ClubProfile = {
  clubId: string; slug: string; name: string; shortName: string | null; tla: string | null; crestUrl: string | null; venue: string | null; country: string | null;
  league: { slug: LeagueSlug; name: string; seasonName: string | null } | null;
};
export type SquadPlayer = { playerId: string; name: string; position: string | null; nationality: string | null; photoUrl: string | null };
export type ClubFixtures = { recent: FixtureRow[]; upcoming: FixtureRow[] };
export type ClubStanding = { row: StandingRow; fetchedAt: string | null };
