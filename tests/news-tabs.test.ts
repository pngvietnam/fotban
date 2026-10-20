import { describe, expect, it } from "vitest";
import { kindOfStoryType, newsViewHref, parseNewsView } from "../lib/news-tabs";

describe("news tabs and filters", () => {
  it("reads the three tabs, the kind and league filters and the page offset", () => {
    expect(parseNewsView({})).toEqual({ tab: "danh-cho-ban", kind: "tat-ca", league: "all", offset: 0 });
    expect(parseNewsView({ tab: "soi-noi", loai: "phan-tich", league: "la-liga", bao: "24" })).toEqual({ tab: "soi-noi", kind: "phan-tich", league: "la-liga", offset: 24 });
    for (const params of [{ tab: "khac" }, { tab: ["moi-nhat"] }, { loai: "vui" }, { league: "serie-a" }, { bao: "-1" }]) expect(parseNewsView(params)).toBeNull();
  });
  it("keeps older tab links working as filters", () => {
    expect(parseNewsView({ tab: "chuyen-nhuong" })).toMatchObject({ tab: "moi-nhat", kind: "chuyen-nhuong" });
    expect(parseNewsView({ tab: "giai-dau", league: "champions-league" })).toMatchObject({ tab: "danh-cho-ban", league: "champions-league" });
  });
  it("builds canonical links that leave out defaults and restart paging when a filter changes", () => {
    const view = { tab: "moi-nhat", kind: "tat-ca", league: "all", offset: 48 } as const;
    expect(newsViewHref(view)).toBe("/news?tab=moi-nhat");
    expect(newsViewHref(view, { kind: "chuyen-nhuong", league: "la-liga" })).toBe("/news?tab=moi-nhat&loai=chuyen-nhuong&league=la-liga");
    expect(newsViewHref(view, { offset: 72 })).toBe("/news?tab=moi-nhat&bao=72");
    expect(newsViewHref({ ...view, tab: "danh-cho-ban" }, { offset: 0 })).toBe("/news");
    expect(kindOfStoryType("CONTRACT")?.label).toBe("Chuyển nhượng"); expect(kindOfStoryType("OTHER")).toBeNull();
  });
});
