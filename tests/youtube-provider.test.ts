import { describe, expect, it, vi } from "vitest";
import { YouTubeVideoProvider } from "../providers/youtube/provider";
import { videoMatch, videoSource } from "./fixtures/videos";

const raw = () => ({ id: "fixture0001", snippet: { title: "Arsenal Chelsea highlights", channelId: videoSource().channelId, channelTitle: "Fixture", publishedAt: "2026-10-16T21:00:00Z", description: "Synthetic", liveBroadcastContent: "none" }, contentDetails: { duration: "PT10M5S" }, status: { privacyStatus: "public", uploadStatus: "processed", embeddable: false } });
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
describe("YouTube adapter", () => {
  it("missing key is graceful and makes no request", async () => {
    const fetcher = vi.fn(); const provider = new YouTubeVideoProvider(undefined, { fetch: fetcher });
    expect(provider.configured).toBe(false); await expect(provider.resolveChannel("@approved")).rejects.toMatchObject({ code: "NOT_CONFIGURED" }); expect(fetcher).not.toHaveBeenCalled();
  });
  it("resolves exact approved handle and validates stable channel ID", async () => {
    const fetcher = vi.fn().mockImplementation(async () => response({ items: [{ id: videoSource().channelId, snippet: { customUrl: "@approved" } }] }));
    const provider = new YouTubeVideoProvider("secret-test-key", { fetch: fetcher });
    expect((await provider.resolveChannel("@approved"))?.channelId).toBe(videoSource().channelId);
    const [url, options] = fetcher.mock.calls[0]; expect(String(url)).not.toContain("secret-test-key"); expect(options.headers["X-Goog-Api-Key"]).toBe("secret-test-key");
    expect(await provider.resolveChannel("@different")).toBeNull();
  });
  it("normalizes video duration, missing items and unknown geo honestly", async () => {
    const provider = new YouTubeVideoProvider("test", { fetch: async () => response({ items: [raw()] }) });
    const result = await provider.getVideos(["fixture0001", "fixture0002"]);
    expect(result.videos[0]).toMatchObject({ durationSeconds: 605, vietnamAvailability: "UNKNOWN", embedAllowed: false, availability: "AVAILABLE" }); expect(result.missingIds).toEqual(["fixture0002"]);
  });
  it("maps private, live, and Vietnam restrictions", async () => {
    const value = raw(); value.status.privacyStatus = "private";
    const provider = new YouTubeVideoProvider("test", { fetch: async () => response({ items: [{ ...value, contentDetails: { regionRestriction: { allowed: ["US"] } } }] }) });
    expect((await provider.getVideos(["fixture0001"])).videos[0]).toMatchObject({ availability: "PRIVATE", vietnamAvailability: "UNAVAILABLE" });
  });
  it("quota and authorization fail without retrying or exposing raw messages", async () => {
    for (const [reason, code] of [["quotaExceeded", "QUOTA"], ["forbidden", "UNAUTHORIZED"]]) {
      const fetcher = vi.fn().mockResolvedValue(response({ error: { errors: [{ reason }], message: "secret-test-key" } }, 403));
      await expect(new YouTubeVideoProvider("secret-test-key", { fetch: fetcher }).searchMatchHighlights(videoMatch, videoSource())).rejects.toMatchObject({ code, message: code }); expect(fetcher).toHaveBeenCalledTimes(1);
    }
  });
  it("rejects invalid JSON, malformed DTOs and injected unrequested IDs", async () => {
    for (const body of ["bad", { items: [{}] }, { items: [{ ...raw(), id: "fixture9999" }] }]) {
      await expect(new YouTubeVideoProvider("test", { fetch: async () => typeof body === "string" ? new Response(body) : response(body) }).getVideos(["fixture0001"])).rejects.toMatchObject({ code: "MALFORMED" });
    }
  });
  it("bounds retries for network failures and timeouts, with no search retries", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("private raw error"));
    await expect(new YouTubeVideoProvider("test", { fetch: fetcher, sleep: async () => {} }).getVideos(["fixture0001"])).rejects.toMatchObject({ code: "NETWORK" }); expect(fetcher).toHaveBeenCalledTimes(2);
    const timeout: typeof fetch = async (_url, options) => new Promise((_resolve, reject) => options?.signal?.addEventListener("abort", () => reject(new Error("aborted"))));
    await expect(new YouTubeVideoProvider("test", { fetch: timeout, timeoutMs: 2, sleep: async () => {} }).getVideos(["fixture0001"])).rejects.toMatchObject({ code: "TIMEOUT" });
  });
  it("searches only the approved channel with bounded time and result limits", async () => {
    const fetcher = vi.fn().mockResolvedValue(response({ items: [{ id: { videoId: "fixture0001" } }] }));
    expect(await new YouTubeVideoProvider("test", { fetch: fetcher }).searchMatchHighlights(videoMatch, videoSource())).toEqual(["fixture0001"]);
    const url = new URL(fetcher.mock.calls[0][0]); expect(url.searchParams.get("channelId")).toBe(videoSource().channelId); expect(url.searchParams.get("maxResults")).toBe("5"); expect(url.searchParams.get("regionCode")).toBe("VN");
  });
});
