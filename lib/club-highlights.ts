import type { FixtureRow, StandingRow } from "../types/league-hub";

/** A short, factual line about the club's season, derived only from the stored table and results. */
export type ClubHighlight = { key: string; text: string };

/** Consecutive wins (or unbeaten run) counted from the newest finished match backwards. */
function run(results: ("W" | "D" | "L")[], accept: (result: "W" | "D" | "L") => boolean) {
  let count = 0; for (const result of results) { if (!accept(result)) break; count++; }
  return count;
}
/** Results of the club's finished matches, newest first, from its own point of view. */
export function resultsOf(fixtures: FixtureRow[], clubName: string): ("W" | "D" | "L")[] {
  return fixtures.filter((fixture) => fixture.status === "FINISHED" && fixture.homeScore !== null && fixture.awayScore !== null).map((fixture) => {
    const home = fixture.home.name === clubName; const mine = home ? fixture.homeScore! : fixture.awayScore!; const theirs = home ? fixture.awayScore! : fixture.homeScore!;
    return mine > theirs ? "W" as const : mine < theirs ? "L" as const : "D" as const;
  });
}

/** Up to three highlights: leader, a perfect or unbeaten record, best attack or defence of the table, a winning run. */
export function clubHighlights(rows: StandingRow[], clubId: string, recent: FixtureRow[], clubName: string, competition: string): ClubHighlight[] {
  const row = rows.find((item) => item.clubId === clubId);
  const found: ClubHighlight[] = [];
  if (row && row.played !== null && row.played >= 3) {
    if (row.position === 1) found.push({ key: "leader", text: `Đang đứng đầu ${competition}` });
    if (row.won === row.played) found.push({ key: "perfect", text: `Thắng cả ${row.played} trận` });
    else if (row.lost === 0) found.push({ key: "unbeaten", text: `Bất bại sau ${row.played} trận` });
    const played = rows.filter((item) => item.played !== null && item.played >= 3 && item.goalsFor !== null && item.goalsAgainst !== null);
    const best = (pick: (item: StandingRow) => number, higher: boolean) => { const values = played.map(pick); const target = higher ? Math.max(...values) : Math.min(...values); return pick(row) === target && played.filter((item) => pick(item) === target).length === 1; };
    if (played.length > 3 && row.goalsFor !== null && best((item) => item.goalsFor!, true)) found.push({ key: "attack", text: `Hàng công mạnh nhất giải: ${row.goalsFor} bàn` });
    if (played.length > 3 && row.goalsAgainst !== null && best((item) => item.goalsAgainst!, false)) found.push({ key: "defence", text: `Hàng thủ chắc nhất giải: ${row.goalsAgainst} bàn thua` });
  }
  const results = resultsOf(recent, clubName);
  const wins = run(results, (result) => result === "W");
  if (wins >= 3 && !found.some((item) => item.key === "perfect")) found.push({ key: "streak", text: `Thắng liên tiếp ${wins} trận` });
  return found.slice(0, 3);
}
