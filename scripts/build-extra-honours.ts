import { writeFileSync } from "node:fs";

/**
 * Builds data/club-honours-extra.json: the winners of the other competitions a club page shows (other national leagues,
 * domestic cups, the UEFA Cup / Europa League, the Cup Winners' Cup and the Club World Cup), read from Wikidata's season items.
 * Only competitions whose totals were checked against the official records are listed; Wikidata is incomplete for the
 * Super Cups, the Community Shield, the Coppa Italia, the Copa del Rey (six editions missing) and some national leagues, so those are left out rather than shown short.
 * A season with two winners is a data error in Wikidata: it is printed and settled in OVERRIDES.
 * Run by hand when a season ends: npm.cmd run honours:extra
 */
const userAgent = "FotbanHonours/1.0 (Vietnamese football site; data from Wikidata)";
type Competition = { key: string; label: string; ids: string[]; country: string | null };
const competitions: Competition[] = [
  { key: "bundesliga", label: "Bundesliga", ids: ["Q82595"], country: "Đức" },
  { key: "eredivisie", label: "Eredivisie", ids: ["Q167541"], country: "Hà Lan" },
  { key: "fa-cup", label: "FA Cup", ids: ["Q11151"], country: "Anh" },
  { key: "efl-cup", label: "EFL Cup", ids: ["Q11152"], country: "Anh" },
  { key: "coupe-de-france", label: "Coupe de France", ids: ["Q212412"], country: "Pháp" },
  { key: "dfb-pokal", label: "DFB-Pokal", ids: ["Q150880"], country: "Đức" },
  { key: "uefa-cup", label: "Cúp UEFA / Europa League", ids: ["Q715496", "Q18760"], country: "Châu Âu" },
  { key: "cup-winners-cup", label: "Cúp C2 (Cup Winners' Cup)", ids: ["Q40241"], country: "Châu Âu" },
  { key: "club-world-cup", label: "FIFA Club World Cup", ids: ["Q223366"], country: "Thế giới" },
];
/** Seasons where Wikidata names two winners (one is the beaten finalist), settled after checking the competition's own page. Key: "key season". */
const OVERRIDES: Record<string, string[]> = {
  "uefa-cup 2009–10": ["Atlético Madrid"],
  "club-world-cup 2008": ["Manchester United F.C."],
};
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function sparql(query: string) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const response = await fetch(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`, { headers: { "User-Agent": userAgent, Accept: "application/sparql-results+json" } });
    if (response.status === 429) { await sleep(5000 * (attempt + 1)); continue; }
    if (!response.ok) throw new Error(`Wikidata ${response.status}`);
    const body = await response.json() as { results: { bindings: Record<string, { value: string }>[] } };
    return body.results.bindings.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value.value])));
  }
  throw new Error("Wikidata: still rate limited");
}
/** "2022–23 FA Cup" -> "2022–23"; "1871 FA Cup" -> "1871". */
const seasonOf = (label: string) => /^(\d{4}(?:[–-]\d{2,4})?)/.exec(label)?.[1].replace("-", "–") ?? null;
const startYear = (season: string) => Number(season.slice(0, 4));

async function main() {
  const output: { key: string; label: string; country: string | null; source: string; seasons: { season: string; winner: string }[] }[] = [];
  for (const competition of competitions) {
    const bySeason = new Map<string, Set<string>>();
    for (const id of competition.ids) {
      const rows = await sparql(`SELECT ?seasonLabel ?winnerLabel WHERE { ?season wdt:P3450 wd:${id}; wdt:P1346 ?winner. SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } }`);
      for (const row of rows) { const season = seasonOf(row.seasonLabel); if (!season || /^Q\d+$/.test(row.winnerLabel)) continue; bySeason.set(season, (bySeason.get(season) ?? new Set()).add(row.winnerLabel)); }
      await sleep(1500);
    }
    const seasons: { season: string; winner: string }[] = [];
    for (const [season, winners] of bySeason) {
      const override = OVERRIDES[`${competition.key} ${season}`];
      if (override) { for (const winner of override) seasons.push({ season, winner }); continue; }
      if (winners.size > 1) { console.warn(`${competition.label} ${season}: ${[...winners].join(" / ")} (settle in OVERRIDES)`); continue; }
      seasons.push({ season, winner: [...winners][0] });
    }
    seasons.sort((a, b) => startYear(b.season) - startYear(a.season));
    const counts = new Map<string, number>(); for (const item of seasons) counts.set(item.winner, (counts.get(item.winner) ?? 0) + 1);
    console.log(`${competition.label}: ${seasons.length} seasons; ${[...counts].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, count]) => `${name} ${count}`).join(", ")}`);
    output.push({ key: competition.key, label: competition.label, country: competition.country, source: `https://www.wikidata.org/wiki/${competition.ids[0]}`, seasons });
  }
  writeFileSync("data/club-honours-extra.json", `${JSON.stringify({ generatedAt: new Date().toISOString(), competitions: output }, null, 1)}\n`);
  console.log("Wrote data/club-honours-extra.json");
}
main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
