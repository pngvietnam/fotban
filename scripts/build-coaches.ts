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

async function wikipedia(url: string) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const response = await fetch(url, { headers: { "User-Agent": userAgent } });
    if (response.status !== 429) return response;
    await sleep(Number(response.headers.get("retry-after")) * 1000 || 5000 * (attempt + 1));
  }
  throw new Error("still rate limited");
}
/** The club's Wikipedia title: the summary endpoint follows redirects ("Manchester City FC" -> "Manchester City F.C."). */
async function canonicalTitle(clubName: string) {
  for (const guess of [clubName, clubName.replace(/s+(FC|CF|AFC)$/i, "")]) {
    const response = await wikipedia(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(guess.replace(/ /g, "_"))}?redirect=true`); await sleep(700);
    if (!response.ok) continue;
    const body = await response.json() as { title?: string; type?: string };
    if (body.title && body.type !== "disambiguation") return body.title;
  }
  return null;
}
/** The "List of <club> managers" page and its HTML: tries the usual names for it, stopping at the first that exists. */
async function findList(clubName: string): Promise<{ title: string; html: string } | null> {
  const club = PAGES[clubName] ? null : await canonicalTitle(clubName);
  const titles = PAGES[clubName] ? [PAGES[clubName]] : club ? ["managers", "head coaches", "coaches"].map((word) => `List of ${club} ${word}`) : [];
  for (const title of titles) {
    const response = await wikipedia(`https://en.wikipedia.org/api/rest_v1/page/html/${encodeURIComponent(title.replace(/ /g, "_"))}`); await sleep(700);
    if (response.ok) return { title, html: await response.text() };
  }
  return null;
}

async function main() {
  const db = createDatabaseClient(process.env.DATABASE_URL!);
  const clubs = (await db.$queryRawUnsafe<{ name: string }[]>(`SELECT DISTINCT c.name FROM "ClubSeason" cs JOIN "Club" c ON c.id=cs."clubId" JOIN "League" l ON l.id=cs."leagueId" WHERE l.slug IN ('premier-league','la-liga','ligue-1','champions-league') ORDER BY 1`)).map((row) => row.name);
  await db.$disconnect();
  const result: Record<string, { source: string; coaches: ReturnType<typeof parseCoachList> }> = {};
  const missing: string[] = [];
  for (const name of clubs) {
    try {
      const found = await findList(name);
      if (!found) { missing.push(`${name} (no page)`); continue; }
      const title = found.title;
      const coaches = parseCoachList(found.html);
      if (coaches.length < 3) { missing.push(`${name} (${title}: no usable table)`); continue; }
      coaches.sort((a, b) => (b.from ?? "").localeCompare(a.from ?? ""));
      // A table whose newest coach left years ago and has no current coach is a partial one (a record table, a list of captains…), not the coach history.
      const newest = coaches[0]; if (newest.to !== null && Number(newest.to.slice(0, 4)) < 2015) { missing.push(`${name} (${title}: newest coach left ${newest.to}, table looks partial)`); continue; }
      result[name] = { source: `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`, coaches };
      console.log(`${name}: ${title} -> ${coaches.length} coaches, newest ${coaches[0].name} (${coaches[0].from})`);
    } catch (error) { missing.push(`${name} (${error instanceof Error ? error.message : "error"})`); }
  }
  console.log(`\nNo coach list for ${missing.length} clubs:\n${missing.join("\n")}`);
  writeFileSync("data/club-coaches.json", `${JSON.stringify({ generatedAt: new Date().toISOString(), clubs: result }, null, 1)}\n`);
  console.log(`Wrote data/club-coaches.json (${Object.keys(result).length} clubs)`);
}
main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
