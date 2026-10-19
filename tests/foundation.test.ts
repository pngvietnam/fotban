import { describe, expect, it } from "vitest";
import { parseEnvironment } from "../lib/config";
import { checkHealth } from "../lib/health";
import { createLogger } from "../lib/logging";

describe("environment", () => {
  it("allows unconfigured optional providers and database", () => {
    expect(parseEnvironment({ SPORTS_API_KEY: "", DATABASE_URL: "" }).SPORTS_API_KEY).toBeUndefined();
  });
  it("rejects invalid database and public URLs without exposing credentials", () => {
    expect(() => parseEnvironment({ DATABASE_URL: "https://secret@example.com" })).toThrow("Invalid environment fields: DATABASE_URL");
    for (const url of ["ftp://example.com", "https://user:secret@example.com", "https://example.com?token=secret"]) {
      expect(() => parseEnvironment({ NEXT_PUBLIC_APP_URL: url })).toThrow("Invalid environment fields: NEXT_PUBLIC_APP_URL");
    }
  });
});

describe("health", () => {
  it("distinguishes missing database, successful connection and outage", async () => {
    expect(await checkHealth(null, "test-id")).toEqual({ body: { app: "up", database: "not_configured", requestId: "test-id" }, status: 503 });
    expect((await checkHealth(async () => 1, "test-id")).status).toBe(200);
    const failed = await checkHealth(async () => { throw new Error("credential must stay private"); }, "test-id");
    expect(failed.body.database).toBe("unavailable");
    expect(failed.status).toBe(503);
    expect(JSON.stringify(failed)).not.toContain("credential");
  });
});

describe("logging", () => {
  it("redacts credential fields while retaining correlation IDs", () => {
    const output: string[] = [];
    const log = createLogger("info", { write: (line) => { output.push(line); } });
    log.info({ requestId: "test-id", DATABASE_URL: "private-db", OPENAI_API_KEY: "private-api", FOOTBALL_DATA_API_KEY: "private-football", YOUTUBE_API_KEY: "private-youtube", headers: { "X-Auth-Token": "private-header", "X-Goog-Api-Key": "private-google-header" }, req: { headers: { authorization: "private-auth", cookie: "private-cookie" } }, user: { password: "private-password" } }, "test.event");
    expect(output.join("")).not.toContain("private-");
    expect(output.join("")).toContain("test-id");
    expect(output.join("")).toContain("[REDACTED]");
  });
});
