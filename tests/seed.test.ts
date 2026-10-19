import { describe, expect, it } from "vitest";
import { assertDevelopmentSeed } from "../prisma/seed-data";

describe("development seed isolation", () => {
  const local = "postgresql://localhost:5432/football_morning";
  it("requires explicit opt-in", () => {
    expect(() => assertDevelopmentSeed({ databaseUrl: local })).toThrow();
    expect(() => assertDevelopmentSeed({ databaseUrl: local, allow: "true" })).not.toThrow();
  });
  it("rejects production, remote, and unrelated databases", () => {
    expect(() => assertDevelopmentSeed({ databaseUrl: local, allow: "true", nodeEnv: "production" })).toThrow();
    for (const databaseUrl of ["postgresql://example.com/football_morning", "postgresql://localhost/production", "https://localhost/football_morning"]) {
      expect(() => assertDevelopmentSeed({ databaseUrl, allow: "true" })).toThrow();
    }
  });
});
