import { writeFileSync } from "node:fs";
import { load, type CheerioAPI } from "cheerio";
import type { Element } from "domhandler";

/**
 * Builds data/league-honours.json: champions and runners-up of each competition, read from the Wikipedia list
 * pages and checked against Wikidata's season winners (and football-data.org for the seasons it serves).
 * Seasons where the sources disagree are printed and left out until a person settles them in OVERRIDES.
 * Run by hand when a season ends: npm.cmd run honours:build
 */
type TopScorer = { name: string; club: string | null; goals: number };
type Honour = { season: string; champion: string; runnerUp: string | null; score?: string | null; points?: number | null; runnerUpPoints?: number | null; played?: number | null; topScorers?: TopScorer[] };
const userAgent = "FotbanHonours/1.0 (Vietnamese football site; data checked against Wikidata)";
const pages = {
  "premier-league": { title: "List_of_English_football_champions", from: 1888 },
  "la-liga": { title: "List_of_Spanish_football_champions", from: 1929 },
  "ligue-1": { title: "List_of_French_football_champions", from: 1932 },
  "champions-league": { title: "List_of_European_Cup_and_UEFA_Champions_League_finals", from: 1955 },
} as const;
type Slug = keyof typeof pages;
const wikidataLeague: Record<Slug, string> = { "premier-league": "Q9448", "la-liga": "Q324867", "ligue-1": "Q13394", "champions-league": "Q18756" };
/** One club under its older name: counted with the club that carries its record (checked against the club's own title count). */
const SAME_CLUB: Record<string, string> = { "Madrid FC": "Real Madrid", "Atlético Aviación": "Atlético Madrid", "The Wednesday": "Sheffield Wednesday" };
const canonical = (name: string | null) => (name && SAME_CLUB[name]) || name;

/** What a reader needs to know to read the counts: stripped titles, suspended seasons, older club names, how far back each list goes. */
const NOTES: Record<string, { season: string; text: string }[]> = {
  "ligue-1": [
    {
      "season": "1992–93",
      "text": "Marseille bị tước danh hiệu vì vụ dàn xếp tỉ số, nên mùa này không có nhà vô địch."
    },
    {
      "season": "1939–45",
      "text": "Giải tạm dừng vì Thế chiến II."
    },
    {
      "season": "1932–45",
      "text": "Olympique Lillois (vô địch 1932–33) là tiền thân của Lille."
    }
  ],
  "premier-league": [
    {
      "season": "1915–19, 1939–46",
      "text": "Giải tạm dừng vì hai cuộc thế chiến."
    },
    {
      "season": "1888–1992",
      "text": "Tính toàn bộ giải hạng nhất nước Anh (Football League First Division) trước khi có Premier League."
    }
  ],
  "la-liga": [
    {
      "season": "1936–39",
      "text": "Giải tạm dừng vì Nội chiến Tây Ban Nha."
    },
    {
      "season": "1929–41",
      "text": "Madrid FC là tên cũ của Real Madrid, Atlético Aviación là tên cũ của Atlético Madrid; số danh hiệu đã gộp."
    }
  ],
  "champions-league": [
    {
      "season": "1955–92",
      "text": "Tính cả Cúp C1 châu Âu trước khi đổi tên thành Champions League."
    }
  ]
};

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
  return text && !/^(—|–|-|n\/a|not (held|awarded|played)|abandoned|cancelled|none|league suspended|football league|spanish civil war|world war)/i.test(text) ? text : null;
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
  const response = await wikipedia(title);
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

/** Seasons from this one on get the points table and top scorers from their own Wikipedia page (3 points a win everywhere). */
const detailFrom = 1995;
/** Page titles to try, in order (the century turn and the French league's old name change them). */
const long = (label: string) => `${label.slice(0, 5)}${Number(label.slice(0, 2)) === 19 && label.slice(5) === "00" ? "2000" : label.slice(5)}`;
const seasonPage: Record<Slug, (label: string) => string[]> = {
  "premier-league": (label) => [`${label}_Premier_League`], "la-liga": (label) => [`${label}_La_Liga`, `${long(label)}_La_Liga`], "ligue-1": (label) => [`${label}_Ligue_1`, `${label}_French_Division_1`], "champions-league": (label) => [`${label}_UEFA_Champions_League`],
};
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
/** Wikipedia asks for slow, identified readers: one request at a time, and a wait when it says 429. */
async function wikipedia(title: string) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const response = await fetch(`https://en.wikipedia.org/api/rest_v1/page/html/${title}`, { headers: { "User-Agent": userAgent } });
    if (response.status !== 429) return response;
    await sleep(Number(response.headers.get("retry-after")) * 1000 || 5000 * (attempt + 1));
  }
  throw new Error(`${title}: still rate limited`);
}
const figure = (text: string) => { const m = /-?\d+/.exec(clean(text).replace(/[−–]/g, "-")); return m ? Number(m[0]) : null; };

/** Points and games of the first two places, and the joint top scorers, from one season's page. */
async function readSeason(slug: Slug, label: string): Promise<Partial<Honour> | null> {
  let html: string | null = null;
  for (const title of seasonPage[slug](label)) { const response = await wikipedia(encodeURIComponent(title)); if (response.ok) { html = await response.text(); break; } await sleep(300); }
  if (!html) return null;
  const $ = load(html);
  const detail: Partial<Honour> = {};
  if (slug !== "champions-league") {
    $("table.wikitable").each((_, table) => {
      if (detail.points != null) return;
      const cells = grid($, table as Element);
      const head = (cells[0] ?? []).map((cell) => clean($(cell).text()).toLowerCase());
      const pts = head.findIndex((text) => /^pts/.test(text)); const pld = head.findIndex((text) => /^pld/.test(text));
      if (pts < 0 || pld < 0 || !head.some((text) => /^team/.test(text))) return;
      const first = cells[1]; const second = cells[2];
      if (!first || !second || figure($(first[0]).text()) !== 1 || figure($(second[0]).text()) !== 2) return;
      detail.points = figure($(first[pts]).text()); detail.runnerUpPoints = figure($(second[pts]).text()); detail.played = figure($(first[pld]).text());
    });
  }
  // The first table after a "Top (goal)scorers" heading: joint leaders only.
  const heading = $("h2,h3,h4").filter((_, node) => /^top (goal)?scorers?$/i.test(clean($(node).text()))).first();
  if (heading.length) {
    const inSection = heading.closest("section").find("table.wikitable").first();
    const table = inSection.length ? inSection : heading.parent().nextAll().find("table.wikitable").first();
    if (table.length) {
      const cells = grid($, table.get(0) as Element);
      const head = (cells[0] ?? []).map((cell) => clean($(cell).text()).toLowerCase());
      const player = head.findIndex((text) => /^player/.test(text)); const clubAt = head.findIndex((text) => /^(club|team)/.test(text)); const goals = head.findIndex((text) => /^goals/.test(text));
      if (player >= 0 && goals >= 0) {
        const rows = cells.slice(1).filter((row) => row[goals] && figure($(row[goals]).text()) !== null);
        const top = rows.length ? figure($(rows[0][goals]).text()) : null;
        detail.topScorers = rows.filter((row) => figure($(row[goals]).text()) === top).slice(0, 4).map((row) => ({ name: clean($(row[player]).text()), club: clubAt >= 0 ? club($, row[clubAt])?.replace(/(?<=\D)\d+$/, "") ?? null : null, goals: top! }));
      }
    }
  }
  return detail;
}

async function main() {
  const result: Record<string, Honour[]> = {}; const disputed: string[] = [];
  for (const slug of Object.keys(pages) as Slug[]) {
    const [rows, winners] = await Promise.all([readPage(slug), wikidataWinners(slug)]);
    result[slug] = rows.flatMap((row) => {
      const override = OVERRIDES[`${slug} ${row.season}`];
      const merged = { ...row, ...override };
      const named = winners.get(row.season);
      if (!override && named && ![...named].some((name) => sameClub(name, row.champion))) { disputed.push(`${slug} ${row.season}: Wikipedia ${row.champion} / Wikidata ${[...named].join(", ")}`); return []; }
      return [{ ...merged, champion: canonical(merged.champion)!, runnerUp: canonical(merged.runnerUp) }];
    });
    for (const item of result[slug]) {
      if (Number(item.season.slice(0, 4)) < detailFrom) continue;
      const detail = await readSeason(slug, item.season); await sleep(700);
      if (!detail) { console.log(`  no season page: ${slug} ${item.season}`); continue; }
      Object.assign(item, detail);
    }
    console.log(`${slug}: ${result[slug].length} seasons (${rows.length} read, ${winners.size} checked against Wikidata)`);
  }
  if (disputed.length) console.log(`Left out, sources disagree (settle in OVERRIDES):\n  ${disputed.join("\n  ")}`);
  writeFileSync("data/league-honours.json", `${JSON.stringify({ generatedAt: new Date().toISOString(), notes: NOTES, sources: Object.fromEntries(Object.entries(pages).map(([slug, page]) => [slug, `https://en.wikipedia.org/wiki/${page.title}`])), honours: result }, null, 1)}\n`);
}
void main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : "Honours build failed."); process.exitCode = 1; });
