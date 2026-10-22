import { writeFileSync } from "node:fs";
import { createDatabaseClient } from "../lib/database-client";
import { parseCoachList } from "../lib/coach-list";

/**
 * Builds data/club-coaches.json: every head coach of each club the site has a page for, with tenure and record
 * (matches, wins, draws, losses, goals), read from the club's Wikipedia "List of ... managers" page.
 * Only a table that has From, To and win/draw/loss columns is accepted; a club without one gets no entry and its page
 * simply has no coach section. Run by hand when a coach changes: npm.cmd run coaches:build
 */
const userAgent = "FotbanCoaches/1.0 (Vietnamese football site; data from Wikipedia)";
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
/** Settled by hand: the DB club name -> the Wikipedia page, where the search cannot find it. */
const PAGES: Record<string, string> = {};
const fold = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\b(fc|cf|afc|sc|ac|club|de|the|f c|c f)\b/g, " ").replace(/\s+/g, " ").trim();

async function wikipedia(url: string) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const response = await fetch(url, { headers: { "User-Agent": userAgent } });
    if (response.status !== 429) return response;
    await sleep(Number(response.headers.get("retry-after")) * 1000 || 5000 * (attempt + 1));
  }
  throw new Error("still rate limited");
}
/** The "List of <club> managers" page: the search hit whose title names the club (every word of its folded name). */
async function findPage(clubName: string) {
  if (PAGES[clubName]) return PAGES[clubName];
  const words = fold(clubName).split(" ").filter(Boolean);
  const response = await wikipedia(`https://en.wikipedia.org/w/api.php?action=query&list=search&srlimit=8&format=json&srsearch=${encodeURIComponent(`List of ${clubName.replace(/\b(FC|CF|AFC)\b/g, "").trim()} managers head coaches`)}`);
  const body = await response.json() as { query?: { search?: { title: string }[] } };
  const hits = (body.query?.search ?? []).map((item) => item.title).filter((title) => /^List of .*\b(managers|head coaches|coaches|trainers)\b/i.test(title));
  return hits.find((title) => { const folded = fold(title); return words.every((word) => folded.includes(word)); }) ?? null;
}

async function main() {
  const db = createDatabaseClient(process.env.DATABASE_URL!);
  const clubs = (await db.$queryRawUnsafe<{ name: string }[]>(`SELECT DISTINCT c.name FROM "ClubSeason" cs JOIN "Club" c ON c.id=cs."clubId" JOIN "League" l ON l.id=cs."leagueId" WHERE l.slug IN ('premier-league','la-liga','ligue-1','champions-league') ORDER BY 1`)).map((row) => row.name);
  await db.$disconnect();
  const result: Record<string, { source: string; coaches: ReturnType<typeof parseCoachList> }> = {};
  const missing: string[] = [];
  for (const name of clubs) {
    try {
      const title = await findPage(name); await sleep(900);
      if (!title) { missing.push(`${name} (no page)`); continue; }
      const response = await wikipedia(`https://en.wikipedia.org/api/rest_v1/page/html/${encodeURIComponent(title.replace(/ /g, "_"))}`); await sleep(900);
      if (!response.ok) { missing.push(`${name} (${title}: ${response.status})`); continue; }
      const coaches = parseCoachList(await response.text());
      if (coaches.length < 3) { missing.push(`${name} (${title}: no usable table)`); continue; }
      coaches.sort((a, b) => (b.from ?? "").localeCompare(a.from ?? ""));
      result[name] = { source: `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`, coaches };
      console.log(`${name}: ${title} -> ${coaches.length} coaches, newest ${coaches[0].name} (${coaches[0].from})`);
    } catch (error) { missing.push(`${name} (${error instanceof Error ? error.message : "error"})`); }
  }
  console.log(`\nNo coach list for ${missing.length} clubs:\n${missing.join("\n")}`);
  writeFileSync("data/club-coaches.json", `${JSON.stringify({ generatedAt: new Date().toISOString(), clubs: result }, null, 1)}\n`);
  console.log(`Wrote data/club-coaches.json (${Object.keys(result).length} clubs)`);
}
main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
