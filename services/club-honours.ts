import { sameClub, seasonStories, type SeasonStory } from "../lib/league-memories";
import type { LeagueSlug } from "../types/league-hub";
import extraJson from "../data/club-honours-extra.json";
import { seasonHonours } from "./league-honours";

export type ClubHonour = {
  slug: LeagueSlug; label: string; titles: number; runnerUps: number; firstTitle: string | null; lastTitle: string | null;
  longestStreak: { years: number; from: string; to: string } | null; bestSeason: { season: string; points: number } | null;
  /** Title seasons newest first, with the runner-up and, where the list has it, the points or final score. */
  seasons: { season: string; runnerUp: string | null; points: number | null; score: string | null }[];
  /** The newest runner-up finishes, for "so close" context. */
  lastRunnerUp: string | null;
};
const competitions: { slug: LeagueSlug; label: string }[] = [{ slug: "premier-league", label: "Ngoại hạng Anh" }, { slug: "la-liga", label: "La Liga" }, { slug: "ligue-1", label: "Ligue 1" }, { slug: "champions-league", label: "Champions League" }];
const startYear = (season: string) => Number(season.slice(0, 4));

/** A club's titles and runner-up finishes in the competitions Fotban holds honours for; clubs with none get an empty list. */
export function clubHonours(clubName: string): ClubHonour[] {
  const result: ClubHonour[] = [];
  for (const { slug, label } of competitions) {
    const stories = seasonStories(seasonHonours(slug), slug === "champions-league");
    const won = stories.filter((story) => sameClub(story.champion, clubName));
    const second = stories.filter((story) => story.runnerUp && sameClub(story.runnerUp, clubName));
    if (!won.length && !second.length) continue;
    const oldest = [...won].sort((a, b) => startYear(a.season) - startYear(b.season));
    let longest: ClubHonour["longestStreak"] = null;
    for (const story of won) if (story.streak >= 2 && (!longest || story.streak > longest.years)) longest = { years: story.streak, to: story.season, from: stories.find((other) => startYear(other.season) === startYear(story.season) - story.streak + 1)?.season ?? story.season };
    const withPoints = won.filter((story): story is SeasonStory & { points: number } => story.points != null);
    const best = withPoints.length ? withPoints.reduce((top, story) => story.points > top.points ? story : top) : null;
    result.push({ slug, label, titles: won.length, runnerUps: second.length, firstTitle: oldest[0]?.season ?? null, lastTitle: won[0]?.season ?? null, longestStreak: longest,
      bestSeason: best ? { season: best.season, points: best.points } : null, lastRunnerUp: second[0]?.season ?? null,
      seasons: won.map((story) => ({ season: story.season, runnerUp: story.runnerUp, points: story.points ?? null, score: story.score ?? null })) });
  }
  return result.sort((a, b) => b.titles - a.titles || a.label.localeCompare(b.label));
}

type ExtraFile = { competitions: { key: string; label: string; country: string | null; seasons: { season: string; winner: string }[] }[] };
export type ClubExtraHonour = { key: string; label: string; country: string | null; titles: number; firstTitle: string | null; lastTitle: string | null; seasons: string[] };
/** Titles in the other competitions Fotban holds winners for (other leagues, domestic cups, UEFA Cup / Europa League, Cup Winners' Cup, Club World Cup). */
export function clubExtraHonours(clubName: string): ClubExtraHonour[] {
  const file = extraJson as ExtraFile;
  const result: ClubExtraHonour[] = [];
  for (const competition of file.competitions) {
    const won = competition.seasons.filter((item) => sameClub(item.winner, clubName)).map((item) => item.season);
    if (!won.length) continue;
    result.push({ key: competition.key, label: competition.label, country: competition.country, titles: won.length, lastTitle: won[0], firstTitle: won[won.length - 1], seasons: won });
  }
  return result.sort((a, b) => b.titles - a.titles || a.label.localeCompare(b.label));
}
