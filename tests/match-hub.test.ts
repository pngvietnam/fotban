import { describe, expect, it } from "vitest";
import { matchTabHref, parseMatchTab } from "../lib/match-tabs";

describe("match tabs", () => {
  it("defaults to Dữ kiện and rejects unknown tabs", () => {
    expect(parseMatchTab(undefined)).toBe("du-kien");
    expect(parseMatchTab("doi-dau")).toBe("doi-dau");
    expect(parseMatchTab("khac")).toBeNull();
    expect(parseMatchTab(["bxh"])).toBeNull();
  });
  it("links keep the slug and omit the default tab", () => {
    expect(matchTabHref("match-1", "du-kien")).toBe("/match/match-1");
    expect(matchTabHref("match-1", "bxh")).toBe("/match/match-1?tab=bxh");
  });
});
