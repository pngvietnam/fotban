import { describe, expect, it } from "vitest";
import { clubCalendar } from "../lib/club-calendar";
import { clubHref, parseClubQuery } from "../lib/club-presentation";
import { sameClub } from "../lib/league-memories";
import { clubHonours } from "../services/club-honours";
import type { FixtureRow } from "../types/league-hub";

const fixture = (overrides: Partial<FixtureRow> = {}): FixtureRow => ({
  slug: "match-1", kickoffAt: "2026-10-24T11:30:00.000Z", status: "SCHEDULED", round: null,
  home: { name: "Aston Villa FC", tla: "AVL", crestUrl: null }, away: { name: "Manchester City FC", tla: "MCI", crestUrl: null },
  homeScore: null, awayScore: null, competition: { name: "Premier League", slug: "premier-league" }, ...overrides,
});

describe("club page query and links", () => {
  it("accepts a competition filter and the new tabs, and rejects anything else", () => {
    expect(parseClubQuery({ tab: "lich-su" })).toEqual({ tab: "lich-su", offset: 0 });
    expect(parseClubQuery({ giai: "champions-league" })).toEqual({ tab: "tong-quan", offset: 0, giai: "champions-league" });
    for (const bad of [{ giai: "A B" }, { giai: ["a"] }, { giai: "x".repeat(41) }, { tab: "thong-ke" }]) expect(parseClubQuery(bad)).toBeNull();
    expect(clubHref("club-a", { giai: "la-liga" })).toBe("/club/club-a?giai=la-liga");
    expect(clubHref("club-a", { tab: "bang-xep-hang" })).toBe("/club/club-a?tab=bang-xep-hang");
  });
});

describe("club calendar file", () => {
  it("writes one UTC event per scheduled match and skips finished, postponed and cancelled ones", () => {
    const text = clubCalendar("Manchester City FC", [fixture(), fixture({ slug: "match-2", status: "POSTPONED" }), fixture({ slug: "match-3", status: "FINISHED", homeScore: 1, awayScore: 0 })], "https://fotban.example", new Date("2026-10-22T00:00:00Z"));
    expect(text.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true); expect(text.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(text.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    expect(text).toContain("DTSTART:20261024T113000Z"); expect(text).toContain("DTEND:20261024T133000Z");
    expect(text).toContain("SUMMARY:Aston Villa FC – Manchester City FC"); expect(text).toContain("DESCRIPTION:Premier League");
    expect(text).toContain("URL:https://fotban.example/match/match-1");
  });
  it("escapes text and folds long lines at 75 octets", () => {
    const text = clubCalendar("A, B; C", [fixture({ home: { name: "Team, One; \\ Long ".repeat(8), tla: null, crestUrl: null } })], "https://fotban.example");
    expect(text).toContain("X-WR-CALNAME:A\\, B\\; C");
    for (const line of text.split("\r\n")) expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
  });
});

describe("club names against honours lists", () => {
  it("matches spelling variants but not a name that merely sits inside another", () => {
    expect(sameClub("Manchester City FC", "Manchester City")).toBe(true);
    expect(sameClub("FC Bayern München", "Bayern Munich")).toBe(true);
    expect(sameClub("FC Internazionale Milano", "Inter Milan")).toBe(true);
    expect(sameClub("Lille OSC", "Lille")).toBe(true);
    expect(sameClub("Club Atlético de Madrid", "Atlético Madrid")).toBe(true);
    expect(sameClub("AC Milan", "Inter Milan")).toBe(false);
    expect(sameClub("Real Madrid CF", "Atlético Madrid")).toBe(false);
    expect(sameClub("Manchester City FC", "Manchester United")).toBe(false);
  });
  it("counts titles per competition from the stored honours", () => {
    const city = clubHonours("Manchester City FC");
    expect(city.find((item) => item.slug === "premier-league")).toMatchObject({ titles: 10, runnerUps: 7, lastTitle: expect.any(String) });
    expect(city.find((item) => item.slug === "champions-league")).toMatchObject({ titles: 1 });
    expect(clubHonours("Real Madrid CF").find((item) => item.slug === "champions-league")?.titles).toBe(15);
    expect(clubHonours("Como 1907")).toEqual([]);
  });
});
