/** Season honours as stored in data/league-honours.json (newest first). */
export type SeasonHonour = { season: string; champion: string; runnerUp: string | null; score?: string | null; points?: number | null; runnerUpPoints?: number | null; played?: number | null; topScorers?: { name: string; club: string | null; goals: number }[] };
export type Moment = { text: string; tone: "gold" | "green" | "blue" };
export type SeasonStory = SeasonHonour & { moments: Moment[]; titleNumber: number; streak: number };
/** A competition's list is complete when it reaches back to the first seasons; the Premier League's starts in 1992/93. */
export const startsAtBeginning = (list: SeasonHonour[]) => Math.min(...list.map((item) => startYear(item.season))) <= 1956;

const startYear = (season: string) => Number(season.slice(0, 4));
/** Club names compared loosely: no accents, no "FC"/"CF" and similar, no punctuation. */
const fold = (name: string) => name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\b(fc|cf|afc|sc|ac|club|de|futbol|football)\b/g, "").replace(/[^a-z0-9]+/g, "");
export const sameClubName = (a: string, b: string) => { const x = fold(a); const y = fold(b); return x.length > 2 && y.length > 2 && (x === y || x.includes(y) || y.includes(x)); };
export const clubKey = (name: string) => fold(name);

/**
 * Facts derived only from the stored honours: which title a club's season was, its streak, the margin in points,
 * and how it compares with every other season on record. Nothing here is written by hand or estimated.
 */
export function seasonStories(list: SeasonHonour[], finals: boolean): SeasonStory[] {
  const oldestFirst = [...list].sort((a, b) => startYear(a.season) - startYear(b.season));
  const complete = startsAtBeginning(list);
  const count = new Map<string, number>(); const streaks = new Map<string, number>();
  const withPoints = oldestFirst.filter((item) => item.points != null);
  const mostPoints = Math.max(0, ...withPoints.map((item) => item.points!));
  const fewest = withPoints.length ? Math.min(...withPoints.map((item) => item.points!)) : 0;
  const widest = Math.max(0, ...withPoints.map((item) => (item.points ?? 0) - (item.runnerUpPoints ?? item.points ?? 0)));
  const stories: SeasonStory[] = oldestFirst.map((item, index) => {
    const previous = oldestFirst[index - 1];
    const titleNumber = (count.get(clubKey(item.champion)) ?? 0) + 1; count.set(clubKey(item.champion), titleNumber);
    const streak = previous && sameClubName(previous.champion, item.champion) ? (streaks.get(clubKey(item.champion)) ?? 1) + 1 : 1; streaks.set(clubKey(item.champion), streak);
    const moments: Moment[] = [];
    const since = complete ? "" : ` kể từ ${oldestFirst[0].season}`;
    if (titleNumber === 1 && complete) moments.push({ text: "Lần đầu lên ngôi", tone: "gold" });
    else moments.push({ text: titleNumber === 1 ? `Danh hiệu đầu tiên${since}` : `Danh hiệu thứ ${titleNumber}${since}`, tone: "gold" });
    if (streak >= 2) moments.push({ text: `${streak} năm liên tiếp vô địch`, tone: "gold" });
    if (previous?.runnerUp && sameClubName(previous.runnerUp, item.champion)) moments.push({ text: "Từ á quân lên ngôi vô địch", tone: "green" });
    if (item.points != null && item.runnerUpPoints != null) {
      const margin = item.points - item.runnerUpPoints;
      if (margin <= 1) moments.push({ text: margin === 0 ? "Bằng điểm á quân, hơn nhờ chỉ số phụ" : "Hơn á quân đúng 1 điểm", tone: "blue" });
      else if (margin >= 15) moments.push({ text: `Bỏ xa á quân ${margin} điểm`, tone: "blue" });
      if (item.points === mostPoints) moments.push({ text: `Nhiều điểm nhất kể từ ${oldestFirst[0] && withPoints[0] ? withPoints[0].season : "dữ liệu"}: ${item.points} điểm`, tone: "green" });
      if (item.points === fewest) moments.push({ text: `Ít điểm nhất của một nhà vô địch (${item.points})`, tone: "blue" });
      if (margin === widest && margin >= 15 && margin !== 0) moments.push({ text: "Cách biệt lớn nhất với á quân", tone: "blue" });
    }
    if (finals && item.score) {
      if (/luân lưu/.test(item.score)) moments.push({ text: `Chung kết hòa ${item.score.replace(" (luân lưu)", "")}, thắng loạt luân lưu`, tone: "blue" });
      else { const m = /^(\d+)–(\d+)/.exec(item.score); if (m && Math.abs(Number(m[1]) - Number(m[2])) >= 4) moments.push({ text: `Chung kết đậm ${item.score}`, tone: "blue" }); }
    }
    return { ...item, moments, titleNumber, streak };
  });
  return stories.sort((a, b) => startYear(b.season) - startYear(a.season));
}

export type ClubHistory = {
  club: string; since: string | null; titles: SeasonStory[]; runnerUps: SeasonHonour[]; firstTitle: string | null; lastTitle: string | null; longestStreak: { years: number; from: string; to: string } | null;
  bestSeason: SeasonStory | null; finalWins: SeasonStory[]; finalLosses: SeasonHonour[];
};
/** One club's story: every title, every runner-up finish, its best points total and longest run. */
export function clubHistory(club: string, stories: SeasonStory[], finals: boolean): ClubHistory {
  const complete = startsAtBeginning(stories);
  const titles = stories.filter((item) => sameClubName(item.champion, club));
  const runnerUps = stories.filter((item) => item.runnerUp && sameClubName(item.runnerUp, club));
  const oldest = [...titles].reverse();
  let longest: ClubHistory["longestStreak"] = null;
  for (const item of titles) if (item.streak >= 2 && (!longest || item.streak > longest.years)) longest = { years: item.streak, to: item.season, from: stories.find((other) => startYear(other.season) === startYear(item.season) - item.streak + 1)?.season ?? item.season };
  const withPoints = titles.filter((item) => item.points != null);
  return {
    club, since: complete || !stories.length ? null : stories[stories.length - 1].season, titles, runnerUps, firstTitle: oldest[0]?.season ?? null, lastTitle: titles[0]?.season ?? null, longestStreak: longest,
    bestSeason: withPoints.length ? withPoints.reduce((best, item) => item.points! > best.points! ? item : best) : null,
    finalWins: finals ? titles : [], finalLosses: finals ? runnerUps : [],
  };
}

/** Vietnamese phrase for a number of titles in the season list. */
export const titleWord = (count: number) => count === 1 ? "1 lần vô địch" : `${count} lần vô địch`;

/**
 * A club page's name against a honours list's name. Stricter than sameClubName, which tolerates a name inside another
 * ("Milan" inside "Inter Milan"): equal after folding, or one is the start of the other with at least six letters
 * ("Bayern" / "Bayern Munich"), or a known alternative spelling.
 */
const aliasGroups = [["bayernmunchen", "bayernmunich"], ["internazionale", "intermilan", "inter"], ["acmilan", "milan"], ["atleticomadrid", "atleticodemadrid"], ["borussiadortmund", "dortmund"], ["olympiquedemarseille", "marseille", "olympiquemarseille"], ["parissaintgermain", "psg"], ["sportingcp", "sportingclubedeportugal"], ["fcportoporto", "porto"], ["slbenfica", "benfica"], ["ajax", "afcajax"], ["psveindhoven", "psv"], ["celticglasgow", "celtic"], ["rangersglasgow", "rangers"], ["lilleosc", "lille"], ["internazionalemilano", "intermilan"], ["olympiquelyonnais", "lyon"], ["asmonaco", "monaco"], ["racinglens", "lens"], ["rcstrasbourgalsace", "strasbourg"], ["ogcnice", "nice"], ["ajauxerre", "auxerre"], ["rcdeportivolacoruna", "deportivolacoruna"]];
const strictFold = (name: string) => fold(name).replace(/(football|futbol|calcio)$/, "");
export function sameClub(a: string, b: string) {
  const x = strictFold(a); const y = strictFold(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const short = x.length <= y.length ? x : y; const long = x.length <= y.length ? y : x;
  if (short.length >= 6 && long.startsWith(short)) return true;
  return aliasGroups.some((group) => group.includes(x) && group.includes(y));
}
