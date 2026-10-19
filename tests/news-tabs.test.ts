import { describe, expect, it } from "vitest";
import { newsTabHref, parseNewsTab } from "../lib/news-tabs";

describe("news tabs", () => {
  it("defaults to the personal tab and rejects unknown tabs", () => {
    expect(parseNewsTab(undefined)).toBe("danh-cho-ban");
    expect(parseNewsTab("moi-nhat")).toBe("moi-nhat");
    expect(parseNewsTab("khac")).toBeNull();
    expect(parseNewsTab(["moi-nhat"])).toBeNull();
  });
  it("builds links that keep the tab, the league (leagues tab only) and the page", () => {
    expect(newsTabHref("danh-cho-ban")).toBe("/news");
    expect(newsTabHref("chuyen-nhuong", { offset: 24 })).toBe("/news?tab=chuyen-nhuong&bao=24");
    expect(newsTabHref("giai-dau", { league: "la-liga" })).toBe("/news?tab=giai-dau&league=la-liga");
    expect(newsTabHref("moi-nhat", { league: "la-liga" })).toBe("/news?tab=moi-nhat");
  });
});
