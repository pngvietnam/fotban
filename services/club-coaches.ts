import coachesJson from "../data/club-coaches.json";
import { sameClub } from "../lib/league-memories";

type StoredCoach = { name: string; nationality: string | null; from: string | null; to: string | null; played: number | null; won: number | null; drawn: number | null; lost: number | null; goalsFor: number | null; goalsAgainst: number | null; honours: string | null };
type CoachesFile = { generatedAt: string; clubs: Record<string, { source: string; coaches: StoredCoach[] }> };
export type CoachStint = StoredCoach & { winRate: number | null; pointsPerMatch: number | null; current: boolean };
export type ClubCoaches = { source: string; coaches: CoachStint[] };

const file = coachesJson as CoachesFile;
/** Every head coach the club has had, newest first, with win rate and points per match worked out from the stored record. */
export function clubCoaches(clubName: string): ClubCoaches | null {
  const entry = Object.entries(file.clubs).find(([name]) => name === clubName) ?? Object.entries(file.clubs).find(([name]) => sameClub(name, clubName));
  if (!entry) return null;
  return { source: entry[1].source, coaches: entry[1].coaches.map((coach) => {
    const known = coach.played !== null && coach.played > 0 && coach.won !== null && coach.drawn !== null && coach.lost !== null;
    return { ...coach, winRate: known ? coach.won! / coach.played! : null, pointsPerMatch: known ? (3 * coach.won! + coach.drawn!) / coach.played! : null, current: coach.to === null };
  }) };
}
