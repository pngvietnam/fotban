import { describe, expect, it } from "vitest";
import { defaultMatchWindow, matchReadSchema } from "../services/match-queries";

describe("database match-read filters", () => {
  it("defines bounded date windows using UTC, independently of presentation timezone", () => {
    expect(defaultMatchWindow(new Date("2026-10-16T00:30:00Z"))).toEqual({ from: "2026-10-09", to: "2026-10-30" });
  });
  it("rejects unbounded scans, invalid dates, negative pages and invalid slugs", () => {
    for (const query of [
      { from: "2026-01-01", to: "2026-12-31" },
      { from: "2026-10-20", to: "2026-10-01" },
      { from: "2026-02-30", to: "2026-03-01" },
      { from: "2026-10-01", to: "2026-10-20", page: -1 },
      { from: "2026-10-01", to: "2026-10-20", league: "bad input" },
    ]) expect(matchReadSchema.safeParse(query).success).toBe(false);
  });
});
