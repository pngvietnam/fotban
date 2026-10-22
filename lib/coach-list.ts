import { load } from "cheerio";

export type CoachRecord = { name: string; nationality: string | null; from: string | null; to: string | null; played: number | null; won: number | null; drawn: number | null; lost: number | null; goalsFor: number | null; goalsAgainst: number | null; honours: string | null };
const strip = (text: string) => text.replace(/\[[^\]]*\]/g, "").replace(/[‡†*§#^]/g, "").replace(/\s+/g, " ").trim();

/** Reads the head-coach table of a Wikipedia "List of ... managers" page: the table with From, To and win/draw/loss columns that has the most rows. */
const headerKey = (text: string) => {
  const value = strip(text.replace(/\.mw-parser-output[^}]*\}/g, "")).toLowerCase();
  if (/^(manager|name|head coach|coach|trainer|managers?)$/.test(value)) return "name";
  if (/^(nationality|nat\.?|country)$/.test(value)) return "nationality";
  if (/^(years?|period|tenure|dates?|seasons?)$/.test(value)) return "years";
  if (value === "from") return "from"; if (value === "to" || value === "until") return "to";
  if (/^(m|p|pld|pl|games|matches|played|g)$/.test(value)) return "played";
  if (/^(w|won|wins)$/.test(value)) return "won"; if (/^(d|drawn|draws)$/.test(value)) return "drawn"; if (/^(l|lost|losses)$/.test(value)) return "lost";
  if (value === "gf") return "goalsFor"; if (value === "ga") return "goalsAgainst";
  if (/honou?rs|trophies/.test(value)) return "honours";
  return null;
};
const months = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
/** "1 July 2016" -> "2016-07-01"; "1880" -> "1880"; "present" -> null. */
function date(text: string): string | null {
  const value = strip(text).toLowerCase();
  const monthOf = (word: string) => { const index = word.length >= 3 ? months.findIndex((month) => month.startsWith(word.slice(0, 3))) : -1; return index >= 0 ? String(index + 1).padStart(2, "0") : null; };
  const full = /^(\d{1,2}) ([a-z]+)\.? (\d{4})/.exec(value);
  if (full && monthOf(full[2])) return `${full[3]}-${monthOf(full[2])}-${full[1].padStart(2, "0")}`;
  const monthYear = /^([a-z]+)\.? (\d{4})/.exec(value);
  if (monthYear && monthOf(monthYear[1])) return `${monthYear[2]}-${monthOf(monthYear[1])}`;
  return /^\d{4}$/.test(value.slice(0, 4)) ? value.slice(0, 4) : null;
}
/** "Vincent Kompany(1986–)" -> "Vincent Kompany": birth years the article prints in the cell are not part of the name. */
const cleanName = (text: string) => strip(text).replace(/\s*\((?:b\.?\s*)?\d{4}\s*[–—-]?\s*\d{0,4}\)/gi, "").trim();
/** "1964–65" -> 1964 to 1965; "1996" -> 1996 to 1996; "2023–" or "2023–present" -> 2023, still in charge. */
function yearSpan(text: string): { from: string | null; to: string | null } {
  const value = strip(text);
  const match = /^(\d{4})\s*(?:[–—-]\s*(\d{4}|\d{2}|[A-Za-z]+)?)?$/.exec(value);
  if (!match) { const from = date(value); return { from, to: from }; }
  const from = match[1];
  if (!/[–—-]/.test(value)) return { from, to: from };
  const end = match[2];
  if (!end || /^(present|current|now)$/i.test(end)) return { from, to: null };
  if (/^\d{2}$/.test(end)) return { from, to: `${from.slice(0, 2)}${end}` };
  return { from, to: /^\d{4}$/.test(end) ? end : null };
}
const count = (text: string) => { const value = strip(text).replace(/,/g, ""); return /^\d+$/.test(value) ? Number(value) : null; };

export function parseCoachList(html: string, options: { requireRecord?: boolean } = {}): CoachRecord[] {
  const requireRecord = options.requireRecord ?? true;
  const $ = load(html);
  let best: CoachRecord[] = [];
  $("table.wikitable").each((_, table) => {
    const rows = $(table).find("tr").toArray();
    const headerRow = rows.find((row) => $(row).find("th").length >= 4 && $(row).find("th").map((__, cell) => headerKey($(cell).text()) ?? "").get().includes("from") || $(row).find("th").map((__, cell) => headerKey($(cell).text()) ?? "").get().includes("years"));
    if (!headerRow) return;
    // A two-row header ("Record" spanning P W D L ..., "Honours" spanning the trophies): the spanning cells are filled from the second row.
    const first = $(headerRow).find("th").toArray();
    const next = rows[rows.indexOf(headerRow) + 1];
    const second = next && $(next).children("td").length === 0 && first.some((cell) => Number($(cell).attr("colspan") ?? 1) > 1) ? $(next).children("th").toArray() : [];
    const sub = second.map((cell) => headerKey($(cell).text()) ?? "");
    const keys: string[] = [];
    for (const cell of first) {
      const span = Number($(cell).attr("colspan") ?? 1);
      if (span > 1 && sub.length) { for (let index = 0; index < span; index++) keys.push(sub.shift() ?? ""); } else keys.push(headerKey($(cell).text()) ?? "");
    }
    if (!keys.includes("name") || (requireRecord && (!keys.includes("won") || !keys.includes("lost")))) return;
    const coaches: CoachRecord[] = [];
    for (const row of rows.slice(rows.indexOf(headerRow) + 1 + (second.length ? 1 : 0))) {
      const cells = $(row).children("td,th").toArray();
      if (cells.length !== keys.length) continue;
      const read: Record<string, string> = {};
      cells.forEach((cell, index) => { const key = keys[index]; if (key) read[key] = key === "name" ? ($(cell).find("a").first().text() || $(cell).text()) : $(cell).text(); });
      const name = cleanName(read.name ?? "");
      const years = read.years !== undefined ? yearSpan(read.years) : null;
      const from = years ? years.from : date(read.from ?? "");
      if (!name || !from) continue;
      // "Until" empty or "present": still in charge. A single year ("1996") is a one-year spell. No end column at all: settled below.
      const to = years ? years.to : keys.includes("to") ? (/present|current|now/i.test(read.to ?? "") ? null : date(read.to ?? "")) : null;
      coaches.push({ name, nationality: strip(read.nationality ?? "") || null, from, to, played: count(read.played ?? ""), won: count(read.won ?? ""), drawn: count(read.drawn ?? ""), lost: count(read.lost ?? ""), goalsFor: count(read.goalsFor ?? ""), goalsAgainst: count(read.goalsAgainst ?? ""), honours: (() => { const text = strip(read.honours ?? ""); return text && text !== "–" && text !== "-" ? text.slice(0, 240) : null; })() });
    }
    // Only the newest coach can still be in charge: anyone earlier whose end is unknown ended when the next one began.
    coaches.sort((a, b) => (b.from ?? "").localeCompare(a.from ?? ""));
    coaches.forEach((coach, index) => { if (index > 0 && coach.to === null) coach.to = coaches[index - 1].from; });
    if (coaches.length > best.length) best = coaches;
  });
  return best;
}

