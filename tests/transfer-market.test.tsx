import React from "react";
import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { SyncDatabase } from "../lib/sync-database";
import { normalizePlayerProfile, normalizePlayerSearch, parseMoney } from "../providers/highlightly/normalization";
import type { PlayerProfileApi } from "../providers/highlightly/provider";
import { ProviderError } from "../providers/errors";
import { pickPlayer, profileDailyBudget, syncPlayerProfiles } from "../services/player-profiles";
import { buildBoard, moneyVi, pressStatus, readPlayerSummaries, readRecordedTransfers, sameClub, type PlayerSummary } from "../services/transfer-hub";
import { TransferBoard, parseBoardFilter } from "../components/transfers/market";
import { TransferDossier } from "../components/transfers/dossier";
import type { FeedCardView, FeedGroupView } from "../types/feed-card";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn() }) }));
const now = new Date("2026-10-21T03:00:00Z");

const profileBody = () => [{
  id: 3055773, name: "V. Gyökeres", fullName: "Viktor Einar Gyökeres",
  profile: { club: { current: "Arsenal FC", joinedAt: "26/07/2025", contractExpiry: "30/06/2030" }, birthDate: "04/06/1998", position: { main: "Centre-Forward" } },
  rumours: { current: [{ club: "Atlético de Madrid", rumourDate: "09/07/2026", transferProbability: "N/A" }] },
  transfers: [
    { to: "Arsenal", fee: "€69.87M", from: "Sporting", type: "transfer", season: "25/26", marketValue: "€75.00M", transferDate: "Jul 26, 2025" },
    { to: "Brighton", fee: null, from: "Coventry", type: "end of loan", season: "20/21", marketValue: "€1.00M", transferDate: "May 31, 2021" },
    { to: "Coventry", fee: null, from: "Brighton", type: "loan", season: "20/21", marketValue: "€1.00M", transferDate: "Jan 15, 2021" },
  ],
  marketValue: [{ club: "Arsenal FC", value: 65000000, currency: "€", recordedDate: "03/06/2026" }, { club: "Arsenal FC", value: 70000000, currency: "€", recordedDate: "09/12/2025" }],
  injuries: [{ reason: "Muscle injury", season: "2026", toDate: "28.11.2025", fromDate: "02.11.2025", missedGames: 6 }],
}];

describe("Highlightly player profiles", () => {
  it("reads money, dates, the latest market value and recorded transfers newest first", () => {
    expect(parseMoney("€69.87M")).toEqual({ amount: 69870000, currency: "EUR" }); expect(parseMoney("€800.00K")).toEqual({ amount: 800000, currency: "EUR" });
    expect(parseMoney("free transfer")).toBeNull(); expect(parseMoney(null)).toBeNull();
    const profile = normalizePlayerProfile(profileBody())!;
    expect(profile).toMatchObject({ externalId: "3055773", club: "Arsenal FC", joinedAt: "2025-07-26", contractExpiry: "2030-06-30", birthDate: "1998-06-04", marketValue: { amount: 65000000, currency: "EUR", at: "2026-06-03" } });
    expect(profile.transfers.map((item) => [item.date, item.type, item.fee])).toEqual([["2025-07-26", "transfer", 69870000], ["2021-05-31", "end of loan", null], ["2021-01-15", "loan", null]]);
    expect(profile.rumours).toEqual([{ club: "Atlético de Madrid", date: "2026-07-09" }]); expect(profile.injuries[0]).toMatchObject({ from: "2025-11-02", to: "2025-11-28", missedGames: 6 });
    expect(normalizePlayerProfile([])).toBeNull();
    expect(normalizePlayerSearch({ data: [{ id: 1, name: "A. B", fullName: "Alpha Beta" }] })).toEqual([{ id: "1", name: "A. B", fullName: "Alpha Beta" }]);
  });
  it("picks the one search hit with the player's name, preferring the same first name among namesakes", () => {
    const hits = [{ id: "1", name: "Jordon Hall", fullName: "Jordon Lewis Hall" }, { id: "2", name: "L. Hall", fullName: "Lewis Kieran Hall" }, { id: "3", name: "Harry Lewis", fullName: "Harry Lewis" }];
    expect(pickPlayer(hits, "Lewis Hall")?.id).toBe("2"); expect(pickPlayer(hits, "Nobody Here")).toBeNull();
    expect(pickPlayer([{ id: "9", name: "David Raya", fullName: "David Raya Martin" }], "David Raya")?.id).toBe("9");
    expect(pickPlayer([{ id: "1", name: "Ana Silva", fullName: "Ana Silva" }, { id: "2", name: "Ana Silva", fullName: "Ana Silva" }], "Ana Silva")).toBeNull();
  });
});

describe("transfer board rules", () => {
  const card = (title: string, overrides: Partial<FeedCardView> = {}): FeedCardView => ({
    slug: `bao-${title}`, articleId: randomUUID(), title, description: null, publisher: "Bongda.com.vn", publisherSlug: "bongda", attribution: "Bongda", url: null, publishedAt: "2026-10-21T01:00:00Z", label: "MEDIA", certainty: "REPORTED",
    storyType: "TRANSFER", transferStage: null, originHint: null, officialWording: false, image: null, entities: [], leagueSlugs: [], match: null, ...overrides,
  });
  const group = (lead: FeedCardView): FeedGroupView => ({ key: lead.title, lead, others: [], latestAt: lead.publishedAt });
  const summary = (overrides: Partial<PlayerSummary> = {}): PlayerSummary => ({ playerId: "p1", name: "Viktor Gyökeres", position: "Offence", nationality: "Sweden", photoUrl: null, birthDate: null, club: { name: "Arsenal FC", crestUrl: null, clubId: "c1" },
    marketValue: 65000000, marketValueCurrency: "EUR", marketValueAt: "2026-06-03", providerClub: "Arsenal FC", joinedAt: null, contractExpiry: null, transfers: [], rumours: [], injuries: [], fetchedAt: "2026-10-21T00:00:00Z", ...overrides });
  it("formats money in Vietnamese and never calls a press story confirmed", () => {
    expect(moneyVi(69870000, "EUR")).toBe("€69,87 triệu"); expect(moneyVi(800000, "GBP")).toBe("£800 nghìn"); expect(moneyVi(0, "EUR")).toBeNull(); expect(moneyVi(null, null)).toBeNull();
    expect(pressStatus(card("a", { transferStage: "NEGOTIATION" }))).toEqual({ status: "talks", label: "Đang đàm phán" });
    expect(pressStatus(card("b", { transferStage: "RUMOR" })).status).toBe("rumor"); expect(pressStatus(card("c", { certainty: "UNCONFIRMED" })).label).toBe("Chưa xác nhận");
    expect(sameClub("Arsenal FC", "Arsenal")).toBe(true); expect(sameClub("Arsenal FC", "Chelsea FC")).toBe(false); expect(sameClub(null, "Arsenal")).toBe(false);
  });
  it("builds one row per player from stories, with the current club and a labelled market value, plus recorded transfers with their fee", () => {
    const story = group(card("Everton hỏi mua Gyökeres", { transferStage: "NEGOTIATION", entities: [{ id: "p1", kind: "player", name: "Viktor Gyökeres", initials: "VG" }, { id: "c1", kind: "club", name: "Arsenal FC", initials: "A" }, { kind: "club", name: "Everton FC", initials: "E" }] }));
    const players = new Map([["p1", summary()], ["p2", summary({ playerId: "p2", name: "Nico Williams", marketValue: null })]]);
    const rows = buildBoard({ groups: [story, group(card("Tin 2", { entities: [{ id: "p1", kind: "player", name: "Viktor Gyökeres", initials: "VG" }] }))], players,
      recorded: [{ playerId: "p2", transfer: { from: "Athletic", to: "Barcelona", type: "transfer", season: "26/27", date: "2026-09-01", feeText: "€62.00M", fee: 62000000, currency: "EUR" } }, { playerId: "p2", transfer: { from: "A", to: "B", type: "loan", season: null, date: "2026-08-01", feeText: null, fee: null, currency: null } }] });
    const press = rows.find((row) => row.key === "press-p1")!;
    expect(rows.filter((row) => row.playerId === "p1")).toHaveLength(1); expect(press).toMatchObject({ status: "talks", from: { name: "Arsenal FC" }, to: { name: "Everton FC" }, fee: { text: "€65 triệu", kind: "market" } });
    expect(press.stories).toHaveLength(2);
    const recorded = rows.filter((row) => row.status === "recorded");
    expect(recorded[0]).toMatchObject({ name: "Nico Williams", fee: { text: "€62 triệu", kind: "recorded" }, statusLabel: "Đã ghi nhận" }); expect(recorded[1]).toMatchObject({ statusLabel: "Cho mượn", fee: { text: "Cho mượn" } });
    expect(rows.map((row) => row.date)).toEqual([...rows.map((row) => row.date)].sort().reverse());
  });
  it("renders the board with filters as links, honest fee labels and no confirmed press status", () => {
    const rows = buildBoard({ groups: [group(card("Tin A", { entities: [{ id: "p1", kind: "player", name: "Viktor Gyökeres", initials: "VG" }] }))], players: new Map([["p1", summary({ marketValue: null })]]), recorded: [{ playerId: "p1", transfer: { from: "Sporting", to: "Arsenal", type: "transfer", season: "25/26", date: "2026-08-01", feeText: "€69.87M", fee: 69870000, currency: "EUR" } }] });
    const $ = load(renderToStaticMarkup(<TransferBoard rows={rows} filter="tat-ca" show={8} now={now} />));
    expect($(".transfer-filter-list a").map((_, node) => `${$(node).text()}|${$(node).attr("href")}`).get()).toEqual(["Tất cả2|/transfers", "Đã ghi nhận1|/transfers?tt=da-ghi-nhan", "Đang đàm phán0|/transfers?tt=dam-phan", "Tin đồn1|/transfers?tt=tin-don"]);
    expect($(".transfer-entry-main").first().attr("href")).toBe("/transfers/player-p1");
    expect($(".transfer-fee").map((_, node) => $(node).text()).get()).toEqual(["Chưa rõChưa có số liệu", "€69,87 triệuTheo hồ sơ chuyển nhượng"]);
    expect($(".transfer-status").map((_, node) => $(node).text()).get()).toEqual(["Đang đưa tin", "Đã ghi nhận"]); expect($.html()).not.toContain("Đã xác nhận");
    const filtered = load(renderToStaticMarkup(<TransferBoard rows={rows} filter="tin-don" show={8} now={now} />));
    expect(filtered(".transfer-entry")).toHaveLength(1);
    expect(load(renderToStaticMarkup(<TransferBoard rows={[]} filter="tat-ca" show={8} now={now} />))(".dp-empty").text()).toContain("Chưa có diễn biến phù hợp");
    expect(parseBoardFilter(undefined)).toBe("tat-ca"); expect(parseBoardFilter("tin-don")).toBe("tin-don"); expect(parseBoardFilter("x")).toBeNull(); expect(parseBoardFilter(["a"])).toBeNull();
  });
  it("renders a dossier from the profile and stories, leaving out missing facts", () => {
    const data = { player: summary({ transfers: normalizePlayerProfile(profileBody())!.transfers, contractExpiry: "2030-06-30", rumours: [{ club: "Atlético", date: "2026-07-09" }] }), clubCrests: {},
      stories: { kind: "ready" as const, data: { groups: [group(card("Everton hỏi mua", { transferStage: "NEGOTIATION", url: "https://bongda.example/x", entities: [{ kind: "club", name: "Everton FC", initials: "E" }] }))], nextOffset: null } } };
    const $ = load(renderToStaticMarkup(<TransferDossier data={data} now={now} />));
    const facts: Record<string, string> = {}; $(".dp-facts > div").each((_, node) => { facts[$(node).find("dt").text()] = $(node).find("dd").text(); });
    expect(facts["Hợp đồng đến"]).toBe("30/06/2030"); expect(facts["Chuyển nhượng gần nhất"]).toContain("Sporting → Arsenal"); expect(facts["Chuyển nhượng gần nhất"]).toContain("€69,87 triệu"); expect(facts).not.toHaveProperty("Gia nhập CLB hiện tại");
    expect($(".transfer-status").text()).toContain("Đang đàm phán · theo báo chí"); expect($(".dossier-club").last().text()).toContain("Everton FC");
    expect($(".dp-note").text()).toContain("Atlético"); expect($(".dp-timeline")).toHaveLength(3);
    const empty = load(renderToStaticMarkup(<TransferDossier data={{ player: summary({ transfers: [], fetchedAt: null, marketValue: null }), clubCrests: {}, stories: { kind: "ready", data: { groups: [], nextOffset: null } } }} now={now} />));
    expect(empty(".dp-facts")).toHaveLength(0); expect(empty.text()).toContain("không điền phí hay hợp đồng khi chưa có số liệu"); expect(empty(".transfer-status")).toHaveLength(0);
  });
});

describe("profile sync (SQL)", () => {
  let db: PGlite; let database: SyncDatabase;
  const ids = { source: randomUUID(), a1: randomUUID(), a2: randomUUID(), p1: randomUUID(), p2: randomUUID(), p3: randomUUID(), club: randomUUID() };
  beforeAll(async () => {
    db = new PGlite();
    for (const entry of readdirSync("prisma/migrations", { withFileTypes: true }).filter((entry) => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) await db.exec(readFileSync(`prisma/migrations/${entry.name}/migration.sql`, "utf8"));
    database = { query: async <T,>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows, transaction: (work) => db.transaction((tx) => work({ query: async <T,>(sql: string, params: unknown[] = []) => (await tx.query<T>(sql, params)).rows })) };
  }, 60000);
  beforeEach(async () => {
    await db.exec('TRUNCATE "PlayerProfile","ProviderQuota","ArticleEntity","FeedCard","Article","NewsSource","PlayerClub","Player","Club" CASCADE');
    await database.query(`INSERT INTO "NewsSource" (id,name,domain,type,"accessPolicy","updatedAt") VALUES ($1::uuid,'Fixture','fixture.example.test','PUBLICATION','test',now())`, [ids.source]);
    await database.query(`INSERT INTO "Club" (id,slug,name,"updatedAt") VALUES ($1::uuid,'club-x','Arsenal FC',now())`, [ids.club]);
    for (const [id, name, birth] of [[ids.p1, "Viktor Gyökeres", "1998-06-04"], [ids.p2, "Unknown Person", null], [ids.p3, "Not Mentioned", null]]) {
      await database.query(`INSERT INTO "Player" (id,slug,name,"birthDate","updatedAt") VALUES ($1::uuid,$2,$3,$4::date,now())`, [id, `player-${id}`, name, birth]);
      await database.query(`INSERT INTO "PlayerClub" (id,"playerId","clubId","startsAt","sourceUrl","updatedAt") VALUES ($1::uuid,$2::uuid,$3::uuid,'2026-08-01','https://example.test',now())`, [randomUUID(), id, ids.club]);
    }
    for (const [article, story, player, published] of [[ids.a1, "TRANSFER", ids.p1, "2026-10-20T10:00:00Z"], [ids.a2, "TRANSFER", ids.p2, "2026-10-19T10:00:00Z"]]) {
      await database.query(`INSERT INTO "Article" (id,slug,"sourceId","sourceUrl","canonicalUrl","titleOriginal",language,"publishedAt","updatedAt") VALUES ($1::uuid,$1::text,$2::uuid,$3,$3,'Tin','vi',$4::timestamptz,now())`, [article, ids.source, `https://fixture.example.test/${article}`, published]);
      await database.query(`INSERT INTO "FeedCard" ("articleId",status,"storyType",label,certainty,"updatedAt") VALUES ($1::uuid,'PUBLISHED',$2,'MEDIA','REPORTED',now())`, [article, story]);
      await database.query(`INSERT INTO "ArticleEntity" (id,"articleId","playerId","updatedAt") VALUES ($1::uuid,$2::uuid,$3::uuid,now())`, [randomUUID(), article, player]);
    }
  });
  afterAll(async () => { await db.close(); });
  const api = (overrides: Partial<PlayerProfileApi> = {}): PlayerProfileApi => ({
    searchPlayers: vi.fn(async (name: string) => name.startsWith("Viktor") ? [{ id: "3055773", name: "V. Gyökeres", fullName: "Viktor Einar Gyökeres" }] : []),
    playerProfile: vi.fn(async () => normalizePlayerProfile(profileBody())), ...overrides,
  });

  it("reads profiles of players in recent transfer stories only, storing them and counting misses", async () => {
    const fake = api(); const result = await syncPlayerProfiles(database, fake, now);
    expect(result).toMatchObject({ examined: 2, stored: 1, unmatched: 1, stopped: "DONE", requests: 3 });
    expect(fake.searchPlayers).toHaveBeenCalledWith("Viktor Gyökeres"); expect(fake.searchPlayers).not.toHaveBeenCalledWith("Not Mentioned");
    const [row] = await database.query<{ club: string; marketValue: string; transfers: unknown[] }>(`SELECT club,"marketValue"::text AS "marketValue",transfers FROM "PlayerProfile" WHERE "playerId"=$1::uuid AND "fetchedAt" IS NOT NULL`, [ids.p1]);
    expect(row).toMatchObject({ club: "Arsenal FC", marketValue: "65000000.00" }); expect(row.transfers).toHaveLength(3);
    const [miss] = await database.query<{ attempts: number; lastError: string }>(`SELECT attempts,"lastError" FROM "PlayerProfile" WHERE "playerId"=$1::uuid`, [ids.p2]);
    expect(miss).toEqual({ attempts: 1, lastError: "NO_MATCH" });
    // Fresh profiles and recent misses are left alone; a later pass makes no request.
    const again = api(); expect(await syncPlayerProfiles(database, again, now)).toMatchObject({ examined: 0, requests: 0 }); expect(again.searchPlayers).not.toHaveBeenCalled();
  });
  it("rejects a namesake (different birth date) and survives one unreadable profile", async () => {
    const wrong = api({ playerProfile: vi.fn(async () => ({ ...normalizePlayerProfile(profileBody())!, birthDate: "1990-01-01" })) });
    expect(await syncPlayerProfiles(database, wrong, now)).toMatchObject({ stored: 0, unmatched: 2 });
    const [row] = await database.query<{ lastError: string; club: string | null }>(`SELECT "lastError",club FROM "PlayerProfile" WHERE "playerId"=$1::uuid`, [ids.p1]); expect(row).toEqual({ lastError: "NO_MATCH", club: null });
    await database.query('UPDATE "PlayerProfile" SET "lastAttemptAt"=NULL, attempts=0');
    const broken = api({ playerProfile: vi.fn(async () => { throw new ProviderError("UNSUPPORTED"); }) });
    expect(await syncPlayerProfiles(database, broken, now)).toMatchObject({ stored: 0, stopped: "DONE" });
  });
  it("stops for the day at its own allowance and when the provider rate-limits", async () => {
    await database.query(`INSERT INTO "ProviderQuota" (provider,day,used,"updatedAt") VALUES ('HIGHLIGHTLY_PROFILES',$1::date,$2,now())`, [now.toISOString().slice(0, 10), profileDailyBudget]);
    const none = api(); expect(await syncPlayerProfiles(database, none, now)).toMatchObject({ stopped: "QUOTA", requests: 0 }); expect(none.searchPlayers).not.toHaveBeenCalled();
    await database.query('DELETE FROM "ProviderQuota"');
    const limited = api({ searchPlayers: vi.fn(async () => { throw new ProviderError("RATE_LIMITED"); }) });
    expect(await syncPlayerProfiles(database, limited, now)).toMatchObject({ stopped: "QUOTA" });
  });
  it("reads summaries and recent recorded transfers for the board", async () => {
    await syncPlayerProfiles(database, api(), now);
    const summaries = await readPlayerSummaries(database, [ids.p1, ids.p3]);
    expect(summaries.get(ids.p1)).toMatchObject({ name: "Viktor Gyökeres", club: { name: "Arsenal FC" }, marketValue: 65000000, contractExpiry: "2030-06-30" }); expect(summaries.get(ids.p3)).toMatchObject({ marketValue: null, transfers: [] });
    const recorded = await readRecordedTransfers(database, new Date("2026-10-21T03:00:00Z"), 120);
    expect(recorded).toHaveLength(0); // the newest recorded transfer is from 2025
    const wide = await readRecordedTransfers(database, new Date("2026-10-21T03:00:00Z"), 600);
    expect(wide.map((item) => item.transfer.to)).toEqual(["Arsenal"]); // older loans and "end of loan" rows are not recent moves
  });
});
