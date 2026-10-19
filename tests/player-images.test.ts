import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SyncDatabase } from "../lib/sync-database";
import { creditLine, isFreeLicense, safePhotoUrl } from "../lib/player-photo";
import { lookupPlayerPhoto, plainCredit, syncPlayerImages, WikiError, type WikiApi } from "../services/player-images";

type Person = { id: string; name: string; born: string; footballer?: boolean; human?: boolean; image?: string; license?: string; author?: string; nonFree?: boolean; thumb?: string };
const entity = (person: Person) => ({ id: person.id, claims: {
  P31: [{ mainsnak: { datavalue: { value: { id: person.human === false ? "Q43229" : "Q5" } } } }],
  P106: [{ mainsnak: { datavalue: { value: { id: person.footballer === false ? "Q82955" : "Q937857" } } } }],
  P569: [{ mainsnak: { datavalue: { value: { time: `+${person.born}T00:00:00Z` } } } }],
  ...(person.image ? { P18: [{ rank: "normal", mainsnak: { datavalue: { value: person.image } } }] } : {}) } });
/** Fake Wikimedia: search by name, entities by id, Commons file info by file title. */
const fakeApi = (people: Person[], calls: string[] = []): WikiApi => async (site, params) => {
  calls.push(`${site}:${params.action}`);
  if (params.action === "wbsearchentities") return { search: people.filter((person) => person.name.normalize("NFD").replace(/\p{M}+/gu, "") === params.search.normalize("NFD").replace(/\p{M}+/gu, "") || person.name === params.search).map((person) => ({ id: person.id })) };
  if (params.action === "wbgetentities") return { entities: Object.fromEntries(params.ids.split("|").map((id) => [id, entity(people.find((person) => person.id === id)!)])) };
  const person = people.find((item) => `File:${item.image}` === params.titles);
  if (!person) return { query: { pages: [{ missing: true }] } };
  return { query: { pages: [{ imageinfo: [{ thumburl: person.thumb ?? `https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/${person.image}/320px-${person.image}`, extmetadata: { LicenseShortName: { value: person.license ?? "CC BY-SA 4.0" }, Artist: { value: person.author ?? "<a href=\"//x\">Jane &amp; Co</a>" }, NonFree: { value: person.nonFree ? "true" : "" } } }] }] } };
};
const nothing = async () => {};

describe("licence and URL guards", () => {
  it("accepts only free licences", () => {
    for (const name of ["CC0", "CC BY 2.0", "CC BY-SA 4.0", "CC BY-SA 3.0 de", "Public domain", "CC BY 4.0"]) expect(isFreeLicense(name)).toBe(true);
    for (const name of ["CC BY-NC 4.0", "CC BY-ND 2.0", "CC BY-NC-SA 3.0", "Fair use", "All rights reserved", "", null]) expect(isFreeLicense(name)).toBe(false);
  });
  it("accepts only Wikimedia commons thumbnails over https", () => {
    expect(safePhotoUrl("https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/X.jpg/320px-X.jpg")).toContain("upload.wikimedia.org");
    expect(safePhotoUrl("https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/X.jpg/320px-X.jpg")).toContain("thumb.wikimedia.org");
    for (const bad of [null, "", "http://upload.wikimedia.org/wikipedia/commons/a.jpg", "https://evil.example/wikipedia/commons/a.jpg", "https://upload.wikimedia.org.evil.example/wikipedia/commons/a.jpg", "https://upload.wikimedia.org/other/a.jpg", "https://u:p@upload.wikimedia.org/wikipedia/commons/a.jpg"]) expect(safePhotoUrl(bad)).toBeNull();
  });
  it("cleans markup out of credits", () => {
    expect(plainCredit("<a href=\"//x\">Jane &amp; Co</a>\n  <span>2020</span>")).toBe("Jane & Co 2020"); expect(plainCredit(undefined)).toBe("");
    expect(creditLine({ author: "Jane", licenseName: "CC BY 4.0" })).toBe("Jane · Wikimedia Commons · CC BY 4.0");
  });
});

describe("photo lookup", () => {
  const striker: Person = { id: "Q1", name: "Erling Haaland", born: "2000-07-21", image: "Haaland.jpg" };
  it("finds the photo of the same footballer with credit and licence", async () => {
    const result = await lookupPlayerPhoto(fakeApi([striker]), { name: "Erling Haaland", birthDate: "2000-07-21" }, nothing);
    expect(result).toMatchObject({ status: "FOUND", wikidataId: "Q1", author: "Jane & Co", licenseName: "CC BY-SA 4.0", descriptionUrl: "https://commons.wikimedia.org/wiki/File:Haaland.jpg" });
  });
  it("matches an accented name through the unaccented search", async () => {
    const result = await lookupPlayerPhoto(fakeApi([{ ...striker, name: "Kylian Mbappé", image: "M.jpg" }]), { name: "Kylian Mbappé", birthDate: "2000-07-21" }, nothing);
    expect(result.status).toBe("FOUND");
  });
  it("never attaches a namesake: wrong birth date, not a footballer, not human or two matches", async () => {
    const lookup = (people: Person[]) => lookupPlayerPhoto(fakeApi(people), { name: "Erling Haaland", birthDate: "2000-07-21" }, nothing);
    expect(await lookup([{ ...striker, born: "1973-03-21" }])).toMatchObject({ status: "NOT_FOUND", reason: "NO_MATCH" });
    expect(await lookup([{ ...striker, footballer: false }])).toMatchObject({ reason: "NO_MATCH" });
    expect(await lookup([{ ...striker, human: false }])).toMatchObject({ reason: "NO_MATCH" });
    expect(await lookup([striker, { ...striker, id: "Q2", image: "Other.jpg" }])).toMatchObject({ reason: "AMBIGUOUS" });
    expect(await lookupPlayerPhoto(fakeApi([striker]), { name: "Erling Haaland", birthDate: null }, nothing)).toMatchObject({ reason: "NO_BIRTH_DATE" });
  });
  it("refuses non-free licences, missing authors, non-Wikimedia thumbnails and missing images", async () => {
    const lookup = (extra: Partial<Person>) => lookupPlayerPhoto(fakeApi([{ ...striker, ...extra }]), { name: "Erling Haaland", birthDate: "2000-07-21" }, nothing);
    expect(await lookup({ license: "CC BY-NC 4.0" })).toMatchObject({ reason: "LICENSE" }); expect(await lookup({ nonFree: true })).toMatchObject({ reason: "LICENSE" });
    expect(await lookup({ author: "  " })).toMatchObject({ reason: "NO_AUTHOR" }); expect(await lookup({ thumb: "https://evil.example/wikipedia/commons/a.jpg" })).toMatchObject({ reason: "NO_THUMBNAIL" });
    expect(await lookup({ image: undefined })).toMatchObject({ reason: "NO_IMAGE" });
  });
});

describe("resumable batch (SQL)", () => {
  let db: PGlite; let database: SyncDatabase;
  const players = [0, 1, 2].map((n) => ({ id: randomUUID(), name: ["Alpha One", "Beta Two", "Gamma Three"][n], born: `200${n}-01-0${n + 1}` }));
  const club = randomUUID();
  const world: Person[] = players.map((player, index) => ({ id: `Q${index + 10}`, name: player.name, born: player.born, image: `P${index}.jpg` }));
  beforeAll(async () => {
    db = new PGlite();
    for (const entry of readdirSync("prisma/migrations", { withFileTypes: true }).filter((entry) => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) await db.exec(readFileSync(`prisma/migrations/${entry.name}/migration.sql`, "utf8"));
    database = {
      query: async <T>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows,
      transaction: (work) => db.transaction((tx) => work({ query: async <T>(sql: string, params: unknown[] = []) => (await tx.query<T>(sql, params)).rows })),
    };
  }, 60000);
  beforeEach(async () => {
    await db.exec('TRUNCATE "PlayerImage","PlayerClub","Player","Club" CASCADE');
    await database.query('INSERT INTO "Club" (id,slug,name,"updatedAt") VALUES ($1::uuid,\'club-x\',\'X FC\',now())', [club]);
    for (const player of players) {
      await database.query('INSERT INTO "Player" (id,slug,name,"birthDate","updatedAt") VALUES ($1::uuid,$2,$3,$4::date,now())', [player.id, `player-${player.id}`, player.name, player.born]);
      await database.query('INSERT INTO "PlayerClub" (id,"playerId","clubId","startsAt","sourceUrl","updatedAt") VALUES ($1::uuid,$2::uuid,$3::uuid,\'2026-08-01\',\'https://example.test\',now())', [randomUUID(), player.id, club]);
    }
  });
  afterAll(async () => { await db.close(); });

  it("stores found photos with credit, then only processes what is still missing", async () => {
    expect(await syncPlayerImages(database, { api: fakeApi(world), limit: 2, timeBudgetMs: 60000, sleep: nothing })).toMatchObject({ examined: 2, found: 2, stopped: "DONE" });
    const calls: string[] = [];
    expect(await syncPlayerImages(database, { api: fakeApi(world, calls), limit: 10, timeBudgetMs: 60000, sleep: nothing })).toMatchObject({ examined: 1, found: 1 });
    expect(calls.filter((call) => call === "wikidata:wbsearchentities").length).toBeGreaterThan(0);
    const rows = await database.query<{ status: string; author: string; licenseName: string }>('SELECT status,author,"licenseName" FROM "PlayerImage"');
    expect(rows).toHaveLength(3); expect(rows.every((row) => row.status === "FOUND" && row.author === "Jane & Co")).toBe(true);
    expect(await syncPlayerImages(database, { api: fakeApi(world), limit: 10, timeBudgetMs: 60000, sleep: nothing })).toMatchObject({ examined: 0, stopped: "DONE" });
  });
  it("records not-found results and retries them only after 30 days", async () => {
    await syncPlayerImages(database, { api: fakeApi([]), limit: 10, timeBudgetMs: 60000, sleep: nothing });
    expect(await database.query('SELECT 1 FROM "PlayerImage" WHERE status=\'NOT_FOUND\'')).toHaveLength(3);
    expect((await syncPlayerImages(database, { api: fakeApi(world), limit: 10, timeBudgetMs: 60000, sleep: nothing })).examined).toBe(0);
    await database.query('UPDATE "PlayerImage" SET "checkedAt"=now()-interval \'31 days\'');
    expect(await syncPlayerImages(database, { api: fakeApi(world), limit: 10, timeBudgetMs: 60000, sleep: nothing })).toMatchObject({ examined: 3, found: 3 });
  });
  it("stops at a Wikimedia error without recording that player, and at the time budget", async () => {
    let seen = 0;
    const flaky: WikiApi = async (site, params) => { if (params.action === "wbsearchentities" && ++seen === 2) throw new WikiError("RATE_LIMITED"); return fakeApi(world)(site, params); };
    expect(await syncPlayerImages(database, { api: flaky, limit: 10, timeBudgetMs: 60000, sleep: nothing })).toMatchObject({ examined: 1, stopped: "RATE_LIMITED" });
    expect(await database.query('SELECT 1 FROM "PlayerImage"')).toHaveLength(1);
    let clock = 0;
    expect(await syncPlayerImages(database, { api: fakeApi(world), limit: 10, timeBudgetMs: 1000, sleep: nothing, now: () => (clock += 600) })).toMatchObject({ stopped: "BUDGET" });
  });
  it("makes the database refuse a photo without credit or with a non-free licence", async () => {
    const insert = (author: string | null, license: string) => database.query('INSERT INTO "PlayerImage" ("playerId",status,"wikidataId","fileName","thumbUrl","descriptionUrl",author,"licenseName","checkedAt","updatedAt") VALUES ($1::uuid,\'FOUND\',\'Q1\',\'a.jpg\',\'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a.jpg\',\'https://commons.wikimedia.org/wiki/File:a.jpg\',$2,$3,now(),now())', [players[0].id, author, license]);
    await expect(insert(null, "CC BY 4.0")).rejects.toThrow(); await expect(insert("Jane", "CC BY-NC 4.0")).rejects.toThrow();
    await insert("Jane", "CC BY 4.0");
  });
});
