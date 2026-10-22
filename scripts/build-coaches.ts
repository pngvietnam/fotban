import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createDatabaseClient } from "../lib/database-client";
import { parseCoachList, type CoachRecord } from "../lib/coach-list";

/**
 * Builds data/club-coaches.json: the head coaches of every club the site has a page for, from several sources, best first:
 *   1. the club's Wikipedia "List of ... managers" page (tenure and full record: matches, wins, draws, losses, goals);
 *   2. a managers table in the club's own Wikipedia article (tenure, sometimes the record);
 *   3. Wikidata's head-coach statements (name and tenure);
 * and the current coach from football-data.org, which also fixes a list that is out of date.
 * A club keeps the entry it already has when that came from source 1; set REFRESH=1 to rebuild everything.
 * Run by hand when a coach changes: npm.cmd run coaches:build
 */
const userAgent = "FotbanCoaches/1.0 (Vietnamese football site; data from Wikipedia, Wikidata and football-data.org)";
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
/** Settled by hand: the DB club name -> the Wikipedia list page, where the usual names do not find it. */
const PAGES: Record<string, string> = {};
type Source = { label: string; url: string };
type Entry = { source: string; sources: Source[]; coaches: CoachRecord[] };
const FILE = "data/club-coaches.json";
const LIST_LABEL = "Wikipedia (danh sách HLV)";

/** Fetch with a pause between tries: Wikipedia answers 429 when asked too fast, and the connection drops now and then. */
async function get(url: string, headers: Record<string, string> = {}) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": userAgent, ...headers } });
      if (response.status !== 429) return response;
      await sleep(Number(response.headers.get("retry-after")) * 1000 || 5000 * (attempt + 1));
    } catch (error) { lastError = error; await sleep(3000 * (attempt + 1)); }
  }
  throw lastError instanceof Error ? lastError : new Error("still failing");
}
const wikiUrl = (title: string) => `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;

/** The club's Wikipedia title and Wikidata id: the summary endpoint follows redirects ("Manchester City FC" -> "Manchester City F.C."). */
async function identify(clubName: string) {
  for (const guess of [clubName, clubName.replace(/\s+(FC|CF|AFC)$/i, "")]) {
    const response = await get(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(guess.replace(/ /g, "_"))}?redirect=true`); await sleep(700);
    if (!response.ok) continue;
    const body = await response.json() as { title?: string; type?: string; wikibase_item?: string };
    if (body.title && body.type !== "disambiguation") return { title: body.title, qid: body.wikibase_item ?? null };
  }
  return null;
}
async function page(title: string) {
  const response = await get(`https://en.wikipedia.org/api/rest_v1/page/html/${encodeURIComponent(title.replace(/ /g, "_"))}`); await sleep(700);
  return response.ok ? await response.text() : null;
}
/** Source 1: the "List of <club> managers" page, trying the usual names. */
async function listPage(clubName: string, club: string | null) {
  const titles = PAGES[clubName] ? [PAGES[clubName]] : club ? ["managers", "head coaches", "coaches"].map((word) => `List of ${club} ${word}`) : [];
  for (const title of titles) { const html = await page(title); if (html) { const coaches = parseCoachList(html); if (coaches.length >= 3) return { title, coaches }; } }
  return null;
}
/** Source 3: Wikidata's head-coach (P286) statements with a start date. */
async function wikidataCoaches(qid: string): Promise<CoachRecord[]> {
  const query = `SELECT ?coachLabel ?start ?end ?natLabel WHERE { wd:${qid} p:P286 ?s. ?s ps:P286 ?coach. OPTIONAL { ?s pq:P580 ?start } OPTIONAL { ?s pq:P582 ?end } OPTIONAL { ?coach wdt:P27 ?nat } SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } }`;
  const response = await get(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`, { Accept: "application/sparql-results+json" }); await sleep(1500);
  if (!response.ok) return [];
  const body = await response.json() as { results: { bindings: Record<string, { value: string }>[] } };
  const seen = new Set<string>(); const coaches: CoachRecord[] = [];
  for (const row of body.results.bindings) {
    const name = row.coachLabel?.value; const from = row.start?.value.slice(0, 10);
    if (!name || !from || /^Q\d+$/.test(name) || seen.has(`${name}${from}`)) continue;
    seen.add(`${name}${from}`);
    coaches.push({ name, nationality: row.natLabel?.value ?? null, from, to: row.end?.value.slice(0, 10) ?? null, played: null, won: null, drawn: null, lost: null, goalsFor: null, goalsAgainst: null, honours: null });
  }
  return coaches;
}
/** The current coach according to football-data.org (needs the club's id there and the API key; one request per 7 seconds). */
let lastFootballData = 0;
async function footballDataCoach(teamId: string | null): Promise<CoachRecord | null> {
  const key = process.env.FOOTBALL_DATA_API_KEY;
  if (!teamId || !key) return null;
  const wait = lastFootballData + 7000 - Date.now(); if (wait > 0) await sleep(wait);
  lastFootballData = Date.now();
  const response = await get(`https://api.football-data.org/v4/teams/${teamId}`, { "X-Auth-Token": key, Accept: "application/json" });
  if (!response.ok) return null;
  const body = await response.json() as { coach?: { name?: string; nationality?: string; contract?: { start?: string } } };
  const coach = body.coach; const start = coach?.contract?.start;
  if (!coach?.name) return null;
  // The contract start is often missing: the coach is then current with no known start.
  return { name: coach.name, nationality: coach.nationality ?? null, from: start ? start.slice(0, 10) : null, to: null, played: null, won: null, drawn: null, lost: null, goalsFor: null, goalsAgainst: null, honours: null };
}
const fold = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z ]+/g, " ").replace(/\s+/g, " ").trim();
/** The same person under a shorter or longer name ("Luís García" / "Luis García Plaza"): every word of the shorter name is in the longer. */
const sameCoach = (a: string, b: string) => { const x = fold(a).split(" "); const y = fold(b).split(" "); const [short, long] = x.length <= y.length ? [x, y] : [y, x]; return short.every((word) => long.includes(word)); };
/** Puts the current coach at the head of a list that does not have him (or has him as already gone). */
function withCurrent(coaches: CoachRecord[], current: CoachRecord | null): CoachRecord[] {
  if (!current) return coaches;
  const newest = coaches[0];
  if (newest && sameCoach(newest.name, current.name)) return coaches.map((coach, index) => index === 0 && coach.to !== null && coach.to >= (current.from ?? "") ? { ...coach, to: null } : coach);
  if (newest && current.from && newest.from && newest.from > current.from) return coaches;
  // The list stops years ago: it is not this club's history, so only the current coach is kept.
  if (newest && newest.to !== null && Number(newest.to.slice(0, 4)) < 2015) return [current];
  // The list is out of date: the coach football-data.org names takes over; the previous one ended by today at the latest.
  const today = new Date().toISOString().slice(0, 10);
  return [current, ...coaches.map((coach, index) => index === 0 && coach.to === null ? { ...coach, to: current.from ?? today } : coach)];
}
const sortNewest = (coaches: CoachRecord[]) => [...coaches].sort((a, b) => (b.from ?? "9999").localeCompare(a.from ?? "9999"));
/** Only the newest coach can still be in charge: an earlier one with no end ended when the next began. */
const closeGaps = (coaches: CoachRecord[]) => coaches.map((coach, index) => index > 0 && coach.to === null ? { ...coach, to: coaches[index - 1].from } : coach);
/** A list whose newest coach left years ago and who has no current coach is a partial table, not the coach history. */
const plausible = (coaches: CoachRecord[]) => coaches.length > 0 && (coaches[0].to === null || Number(coaches[0].to.slice(0, 4)) >= 2015);

async function main() {
  const db = createDatabaseClient(process.env.DATABASE_URL!);
  const clubs = await db.$queryRawUnsafe<{ name: string; teamId: string | null }[]>(`SELECT c.name,max(e."externalId") AS "teamId" FROM "ClubSeason" cs JOIN "Club" c ON c.id=cs."clubId" JOIN "League" l ON l.id=cs."leagueId"
    LEFT JOIN "ExternalIdentity" e ON e."clubId"=c.id AND e.provider='FOOTBALL_DATA' AND e."entityType"='CLUB' WHERE l.slug IN ('premier-league','la-liga','ligue-1','champions-league') GROUP BY c.name ORDER BY 1`);
  await db.$disconnect();
  const previous: { clubs: Record<string, Entry> } = existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : { clubs: {} };
  const result: Record<string, Entry> = {}; const missing: string[] = [];
  for (const { name, teamId } of clubs) {
    try {
      const kept = previous.clubs[name];
      // Entries read from a list page or Wikidata are reused; the ones read from a club article are parsed again (the parser keeps improving).
      const hasFullList = Boolean(kept?.sources?.some((item) => item.label === LIST_LABEL || item.label === "Wikidata"));
      let coaches: CoachRecord[] = []; const sources: Source[] = [];
      if (hasFullList && !process.env.REFRESH) { coaches = kept.coaches; sources.push(...kept.sources.filter((item) => item.label !== "football-data.org")); }
      else {
        const identity = await identify(name);
        const list = identity ? await listPage(name, identity.title) : null;
        if (list) { coaches = sortNewest(list.coaches); sources.push({ label: LIST_LABEL, url: wikiUrl(list.title) }); }
        if (identity && !plausible(coaches)) {
          coaches = []; sources.length = 0;
          const html = await page(identity.title);
          const table = html ? sortNewest(parseCoachList(html, { requireRecord: false })) : [];
          if (table.length >= 5 && plausible(table)) { coaches = table; sources.push({ label: "Wikipedia (bài về CLB)", url: wikiUrl(identity.title) }); }
        }
        if (identity?.qid && !plausible(coaches)) {
          coaches = []; sources.length = 0;
          const data = sortNewest(await wikidataCoaches(identity.qid));
          if (data.length >= 2 && plausible(data)) { coaches = data; sources.push({ label: "Wikidata", url: `https://www.wikidata.org/wiki/${identity.qid}` }); }
        }
      }
      const current = await footballDataCoach(teamId);
      if (current) { coaches = withCurrent(sortNewest(coaches), current); sources.push({ label: "football-data.org", url: "https://www.football-data.org/" }); }
      if (!coaches.length) { missing.push(`${name} (no source had a coach list)`); continue; }
      const sorted = closeGaps(sortNewest(coaches));
      result[name] = { source: sources[0]?.url ?? "https://www.football-data.org/", sources, coaches: sorted };
      console.log(`${name}: ${sorted.length} coaches (${sources.map((item) => item.label).join(" + ")}), newest ${sorted[0].name} ${sorted[0].from}${sorted[0].to ? ` - ${sorted[0].to}` : ""}`);
    } catch (error) { missing.push(`${name} (${error instanceof Error ? error.message : "error"})`); }
  }
  console.log(`\nNo coach data for ${missing.length} clubs:\n${missing.join("\n")}`);
  writeFileSync(FILE, `${JSON.stringify({ generatedAt: new Date().toISOString(), clubs: result }, null, 1)}\n`);
  console.log(`Wrote ${FILE} (${Object.keys(result).length} clubs)`);
}
main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
