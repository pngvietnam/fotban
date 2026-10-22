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
    expect(coaches.map((coach) => coach.name)).toEqual(["Enzo Maresca", "Pep Guardiola", "Frederick Hopkinson"]);
    expect(coaches[1]).toMatchObject({ nationality: "Spain", from: "2016-07-01", to: "2026-05-24", played: 593, won: 416, drawn: 87, lost: 90, goalsFor: 1423, goalsAgainst: 522, honours: "6 Premier League titles" });
    expect(coaches[2]).toMatchObject({ from: "1880", to: "1882", played: null, honours: null });
    expect(coaches[0]).toMatchObject({ to: null, played: 12 });
  });
  it("reads a two-row header where Record spans the match columns", () => {
    const twoRows = `<table class="wikitable"><tr><th>Manager</th><th>Nat.</th><th>From</th><th>To</th><th colspan="4">Record</th><th colspan="2">Honours</th><th>Ref.</th></tr>
<tr><th>Pld</th><th>W</th><th>D</th><th>L</th><th>L1</th><th>Total</th></tr>
<tr><td><a>Tom Watson</a></td><td>ENG</td><td>17 August 1896</td><td>6 May 1915</td><td>742</td><td>329</td><td>141</td><td>272</td><td>2</td><td>3</td><td>[47]</td></tr></table>`;
    expect(parseCoachList(twoRows)).toEqual([expect.objectContaining({ name: "Tom Watson", nationality: "ENG", from: "1896-08-17", to: "1915-05-06", played: 742, won: 329, drawn: 141, lost: 272 })]);
  });
  it("reads a years column, drops birth years from names, and ends a coach when the next one starts", () => {
    const table = `<table class="wikitable"><tr><th>Name</th><th>Years</th></tr>
<tr><td>Ignacio Eizaguirre(1920–)</td><td>1964–65</td></tr><tr><td>Otto Bumbel</td><td>1963</td></tr><tr><td>Nico Kovac</td><td>2023–</td></tr><tr><td>Sven Nielsen</td><td>1960–1962</td></tr><tr><td>X</td><td>1955–56</td></tr></table>`;
    const coaches = parseCoachList(table, { requireRecord: false });
    expect(coaches.map((coach) => [coach.name, coach.from, coach.to])).toEqual([["Nico Kovac", "2023", null], ["Ignacio Eizaguirre", "1964", "1965"], ["Otto Bumbel", "1963", "1963"], ["Sven Nielsen", "1960", "1962"], ["X", "1955", "1956"]]);
  });
  it("treats an empty Until cell as still in charge", () => {
    const table = `<table class="wikitable"><tr><th>No.</th><th>Nationality</th><th>Head coach</th><th>From</th><th>Until</th></tr><tr><td>1</td><td></td><td>A</td><td>July 1935</td><td>Aug 1935</td></tr><tr><td>2</td><td></td><td>B</td><td>2 February 2025</td><td></td></tr></table>`;
    expect(parseCoachList(table, { requireRecord: false }).map((coach) => [coach.name, coach.to])).toEqual([["B", null], ["A", "1935-08"]]);
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
