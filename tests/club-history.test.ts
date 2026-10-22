import { describe, expect, it } from "vitest";
import { parseCoachList } from "../lib/coach-list";
import { clubExtraHonours } from "../services/club-honours";

const html = `<table class="wikitable"><tbody>
<tr><th>Manager</th><th>Nationality</th><th>From</th><th>To</th><th>M</th><th>W</th><th>D</th><th>L</th><th>GF</th><th>GA</th><th>Win %</th><th>Honours</th></tr>
<tr><td><span>Hopkinson Frederick</span><a>Frederick Hopkinson</a></td><td>England</td><td>1880</td><td>1882</td><td>–</td><td>–</td><td>–</td><td>–</td><td>–</td><td>–</td><td>–</td><td>–</td></tr>
<tr><td><a>Pep Guardiola</a>[29]</td><td>Spain</td><td>1 July 2016[30]</td><td>24 May 2026</td><td>593</td><td>416</td><td>87</td><td>90</td><td>1,423</td><td>522</td><td>070.15</td><td>6 Premier League titles</td></tr>
<tr><td><a>Enzo Maresca</a></td><td>Italy</td><td>29 June 2026</td><td>present</td><td>12</td><td>10</td><td>0</td><td>2</td><td>33</td><td>15</td><td>083.33</td><td>–</td></tr>
</tbody></table>
<table class="wikitable"><tr><th>Name</th><th>Titles</th></tr><tr><td>x</td><td>1</td></tr></table>`;

describe("coach list parsing", () => {
  it("reads names, tenure and record from the table with From, To and win/draw/loss columns", () => {
    const coaches = parseCoachList(html);
    expect(coaches.map((coach) => coach.name)).toEqual(["Frederick Hopkinson", "Pep Guardiola", "Enzo Maresca"]);
    expect(coaches[1]).toMatchObject({ nationality: "Spain", from: "2016-07-01", to: "2026-05-24", played: 593, won: 416, drawn: 87, lost: 90, goalsFor: 1423, goalsAgainst: 522, honours: "6 Premier League titles" });
    expect(coaches[0]).toMatchObject({ from: "1880", to: "1882", played: null, honours: null });
    expect(coaches[2]).toMatchObject({ to: null, played: 12 });
  });
  it("returns nothing when no table has the coach columns", () => {
    expect(parseCoachList("<table class='wikitable'><tr><th>Name</th><th>Year</th></tr></table>")).toEqual([]);
  });
});

describe("other competitions", () => {
  const titles = (club: string) => Object.fromEntries(clubExtraHonours(club).map((item) => [item.key, item.titles]));
  it("counts titles from the stored winners across spelling variants", () => {
    expect(titles("Arsenal FC")).toMatchObject({ "fa-cup": 14, "cup-winners-cup": 1 });
    expect(titles("Manchester United FC")["fa-cup"]).toBe(13);
    expect(titles("Liverpool FC")).toMatchObject({ "efl-cup": 10, "uefa-cup": 3 });
    expect(titles("FC Bayern München")["bundesliga"]).toBe(34);
    expect(titles("Olympique de Marseille")["coupe-de-france"]).toBe(10);
    expect(titles("Real Madrid CF")["club-world-cup"]).toBe(5);
    expect(titles("FC Barcelona")["cup-winners-cup"]).toBe(4);
    expect(titles("Sevilla FC")["uefa-cup"]).toBe(7);
    expect(clubExtraHonours("Como 1907")).toEqual([]);
  });
});
