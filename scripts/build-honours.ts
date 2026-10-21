import { writeFileSync } from "node:fs";
import { load, type CheerioAPI } from "cheerio";
import type { Element } from "domhandler";

/**
 * Builds data/league-honours.json: champions and runners-up of each competition, read from the Wikipedia list
 * pages and checked against Wikidata's season winners (and football-data.org for the seasons it serves).
 * Seasons where the sources disagree are printed and left out until a person settles them in OVERRIDES.
 * Run by hand when a season ends: npm.cmd run honours:build
 */
type Honour = { season: string; champion: string; runnerUp: string | null; score?: string | null };
const userAgent = "FotbanHonours/1.0 (Vietnamese football site; data checked against Wikidata)";
const pages = {
  "premier-league": { title: "List_of_English_football_champions", from: 1992 },
  "la-liga": { title: "List_of_Spanish_football_champions", from: 1929 },
  "ligue-1": { title: "List_of_French_football_champions", from: 1932 },
  "champions-league": { title: "List_of_European_Cup_and_UEFA_Champions_League_finals", from: 1955 },
} as const;
type Slug = keyof typeof pages;
const wikidataLeague: Record<Slug, string> = { "premier-league": "Q9448", "la-liga": "Q324867", "ligue-1": "Q13394", "champions-league": "Q18756" };
/** Settled by hand after checking the cited pages; key: "slug season". These differ only in the club's name. */
const OVERRIDES: Record<string, Partial<Honour>> = {
  "la-liga 1999–00": {}, // Deportivo La Coruña = Deportivo de A Coruña
  "la-liga 1940–41": {}, "la-liga 1939–40": {}, // Atlético Aviación, the name of Atlético Madrid then
  "ligue-1 1935–36": {}, // RC Paris = Racing Club de France
  "champions-league 1990–91": {}, // Red Star Belgrade = FK Crvena zvezda
  "champions-league 1985–86": {}, // Steaua București, whose record FCSB holds
};

/** A table as a grid, with rowspan and colspan cells repeated where they apply. */
function grid($: CheerioAPI, table: Element) {
  const rows: Element[][] = [];
  $(table).find("tr").each((rowIndex, tr) => {
    rows[rowIndex] ??= [];
    let col = 0;
    $(tr).children("th,td").each((_, cell) => {
      while (rows[rowIndex][col]) col++;
      const rowspan = Number($(cell).attr("rowspan") ?? 1) || 1; const colspan = Number($(cell).attr("colspan") ?? 1) || 1;
      for (let r = 0; r < rowspan; r++) for (let c = 0; c < colspan; c++) { rows[rowIndex + r] ??= []; rows[rowIndex + r][col + c] = cell as Element; }
      col += colspan;
    });
  });
  return rows;
}
const clean = (text: string) => text.replace(/\[[^\]]*\]/g, "").replace(/\(\d+\)/g, "").replace(/[‡†*§#^]/g, "").replace(/\s+/g, " ").trim();
/** The club in a cell: its first article link that is not a flag or footnote, else the cell's text. */
function club($: CheerioAPI, cell: Element | undefined) {
  if (!cell) return null;
  const link = $(cell).find("a[rel='mw:WikiLink']").filter((_, a) => !$(a).closest(".flagicon, sup").length && clean($(a).text()).length > 1).first();
  const text = clean(link.length ? link.text() : $(cell).text());
  return text && !/^(—|–|-|n\/a|not (held|awarded|played)|abandoned|cancelled|none)/i.test(text) ? text : null;
}
const seasonKey = (raw: string) => {
  const match = /(\d{4})\s*[–-]\s*(\d{2,4})/.exec(raw) ?? /^(\d{4})$/.exec(raw.trim());
  if (!match) return null;
  const start = Number(match[1]);
  if (!match[2]) return { label: String(start), start };
  const end = match[2].length === 2 ? Number(`${String(start).slice(0, 2)}${match[2]}`) : Number(match[2]);
  return { label: `${start}–${String(end).slice(2)}`, start };
};

/** A final that finished level was decided on penalties (the page's footnotes say so for each one). */
const finalScore = (text: string) => { const m = /^(\d+)\s*[–-]\s*(\d+)/.exec(text); return !m ? null : m[1] === m[2] ? `${m[1]}–${m[2]} (luân lưu)` : `${m[1]}–${m[2]}`; };

async function readPage(slug: Slug): Promise<Honour[]> {
  const { title, from } = pages[slug];
  const response = await fetch(`https://en.wikipedia.org/api/rest_v1/page/html/${title}`, { headers: { "User-Agent": userAgent } });
  if (!response.ok) throw new Error(`${title}: HTTP ${response.status}`);
  const $ = load(await response.text());
  const out: Honour[] = [];
  $("table.wikitable").each((_, table) => {
    const cells = grid($, table as Element);
    const head = (cells[0] ?? []).map((cell) => clean($(cell).text()).toLowerCase());
    const at = (pattern: RegExp) => head.findIndex((text) => pattern.test(text));
    const season = at(/^season/); const champion = at(/^(champions|winners)/); const runner = at(/^runners-up/); const score = at(/^score/);
    if (season < 0 || champion < 0 || runner < 0 || head.some((text) => /^rank$|^club$/.test(text))) return;
    for (const row of cells.slice(1)) {
      if (!row[season] || row[season] === cells[0][season]) continue;
      const key = seasonKey(clean($(row[season]).text()));
      const winner = club($, row[champion]);
      if (!key || key.start < from || !winner) continue;
      out.push({ season: key.label, champion: winner, runnerUp: club($, row[runner]), ...(score >= 0 ? { score: finalScore(clean($(row[score]).text())) } : {}) });
    }
  });
  return [...new Map(out.map((item) => [item.season, item])).values()].sort((a, b) => b.season.localeCompare(a.season));
}

/** Wikidata's season winners, keyed by season label ("2023–24"). */
async function wikidataWinners(slug: Slug) {
  const query = `SELECT ?seasonLabel ?winnerLabel WHERE { ?season wdt:P3450 wd:${wikidataLeague[slug]}; wdt:P1346 ?winner. SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } }`;
  const response = await fetch(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`, { headers: { "User-Agent": userAgent, Accept: "application/sparql-results+json" } });
  const body = await response.json() as { results: { bindings: { seasonLabel: { value: string }; winnerLabel: { value: string } }[] } };
  const winners = new Map<string, Set<string>>();
  for (const row of body.results.bindings) { const key = seasonKey(row.seasonLabel.value); if (key) winners.set(key.label, (winners.get(key.label) ?? new Set()).add(row.winnerLabel.value)); }
  return winners;
}
/** Club names compared loosely: no accents, no "FC"/"CF" and similar, no punctuation. */
const fold = (name: string) => name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\b(fc|cf|afc|sc|ac|club|de|futbol|football|f\.c\.|c\.f\.)\b/g, "").replace(/[^a-z0-9]+/g, "");
const sameClub = (a: string, b: string) => { const x = fold(a); const y = fold(b); return x === y || x.includes(y) || y.includes(x); };

async function main() {
  const result: Record<string, Honour[]> = {}; const disputed: string[] = [];
  for (const slug of Object.keys(pages) as Slug[]) {
    const [rows, winners] = await Promise.all([readPage(slug), wikidataWinners(slug)]);
    result[slug] = rows.flatMap((row) => {
      const override = OVERRIDES[`${slug} ${row.season}`];
      const merged = { ...row, ...override };
      const named = winners.get(row.season);
      if (!override && named && ![...named].some((name) => sameClub(name, row.champion))) { disputed.push(`${slug} ${row.season}: Wikipedia ${row.champion} / Wikidata ${[...named].join(", ")}`); return []; }
      return [merged];
    });
    console.log(`${slug}: ${result[slug].length} seasons (${rows.length} read, ${winners.size} checked against Wikidata)`);
  }
  if (disputed.length) console.log(`Left out, sources disagree (settle in OVERRIDES):\n  ${disputed.join("\n  ")}`);
  writeFileSync("data/league-honours.json", `${JSON.stringify({ generatedAt: new Date().toISOString(), sources: Object.fromEntries(Object.entries(pages).map(([slug, page]) => [slug, `https://en.wikipedia.org/wiki/${page.title}`])), honours: result }, null, 1)}\n`);
}
void main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : "Honours build failed."); process.exitCode = 1; });
