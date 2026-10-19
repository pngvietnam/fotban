import { describe, expect, it, vi } from "vitest";
import { parseReusableLicense } from "../lib/news-licenses";
import { normalizeWikinewsPage, verifyWikinewsPolicy, wikinewsPublicationDate } from "../providers/wikimedia/normalization";
import { WikinewsNewsProvider } from "../providers/wikimedia/provider";
import { validateWikimediaUserAgent } from "../providers/wikimedia/http";
import { wikinewsFixtureSource, wikinewsPageFixture, wikinewsPolicyFixture, wikinewsHtmlFixture, wikinewsQueryFixture, wikinewsParseFixture, newsNow } from "./fixtures/wikinews";

const agent = "FixtureFootballBrief/0.1 (contact: developer@example.test)";
const response = (data: unknown) => new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } });
const policyResponse = () => response({ parse: { pageid: 200, revid: 900002, text: wikinewsPolicyFixture } });
const rights = { text: "Creative Commons Attribution 4.0", url: "https://creativecommons.org/licenses/by/4.0/" };
describe("Wikinews reusable-content adapter", () => {
  it("parses only recognized matching reusable license names and canonical URLs", () => {
    expect(parseReusableLicense(rights.text, rights.url)).toEqual({ name: "CC BY 4.0", url: rights.url, commercialReuseAllowed: true });
    expect(parseReusableLicense("CC BY 4.0", "http://creativecommons.org/licenses/by/4.0").url).toBe(rights.url);
  });
  it.each([[undefined, undefined], ["", rights.url]])("rejects missing license metadata", (name, url) => { expect(() => parseReusableLicense(name, url)).toThrow("missing"); });
  it.each([["CC BY-NC 4.0", "https://creativecommons.org/licenses/by-nc/4.0/"], ["CC BY 4.0 NC", rights.url], ["CC BY 4.0", "https://evil.test/licenses/by/4.0/"], ["All rights reserved", rights.url], ["CC BY 4.0", `${rights.url}?override=private`]])("rejects unsupported or mismatched license %s", (name, url) => { expect(() => parseReusableLicense(name, url)).toThrow(); });
  it("verifies machine-returned rights and the known dated policy, failing closed on policy drift", () => {
    expect(verifyWikinewsPolicy(wikinewsPolicyFixture, rights).name).toBe("CC BY 4.0");
    expect(() => verifyWikinewsPolicy(wikinewsPolicyFixture.replace("after December 16, 2024", "after December 16, 2030"), rights)).toThrow();
    expect(() => verifyWikinewsPolicy(wikinewsPolicyFixture, { text: "CC BY-NC 4.0", url: "https://creativecommons.org/licenses/by-nc/4.0/" })).toThrow();
  });
  it("preserves attribution, stable revision/policy evidence and publication-day precision", () => {
    const article = normalizeWikinewsPage(wikinewsPageFixture(), wikinewsHtmlFixture, wikinewsFixtureSource(), "https://en.wikinews.org/w/index.php?oldid=900002", newsNow);
    expect(article.publishedAt?.toISOString()).toBe("2026-10-15T00:00:00.000Z"); expect(article.publishedAtPrecision).toBe("DAY");
    expect(article.license).toMatchObject({ name: "CC BY 4.0", url: rights.url, commercialReuseAllowed: true, revisionUrl: "https://en.wikinews.org/w/index.php?oldid=880001", evidenceUrl: "https://en.wikinews.org/w/index.php?oldid=900002" });
    expect(article.license?.attribution).toContain("Wikinews"); expect(article.license?.attribution).toContain("Contributors/history"); expect(article.license?.attribution).toContain("shortened");
    expect(article.excerptOriginal).toContain("synthetic fixture club"); expect(JSON.stringify(article)).not.toContain("COPYRIGHTED_THIRD_PARTY"); expect(JSON.stringify(article)).not.toContain("THIRD_PARTY_CAPTION"); expect(JSON.stringify(article)).not.toContain("private.example.test");
  });
  it("omits entire quoted leads instead of extracting misleading fragments or later context", () => {
    const html = '<div class="mw-parser-output"><p>The synthetic report includes <q>copyrighted speech from another publisher which is not independently licensed for reuse</q> in this paragraph.</p><p>This later contextual paragraph must not be repurposed as a replacement standalone lead for the article.</p></div>';
    expect(normalizeWikinewsPage(wikinewsPageFixture(), html, wikinewsFixtureSource(), "https://en.wikinews.org/wiki/Wikinews:Copyright", newsNow).excerptOriginal).toBeNull();
  });
  it("rejects explicit reuse exceptions, disputed/unpublished pages and pre-transition articles", () => {
    expect(() => normalizeWikinewsPage(wikinewsPageFixture(), "<p>All rights reserved</p>", wikinewsFixtureSource(), rights.url, newsNow)).toThrow();
    const page = wikinewsPageFixture(); page.categories = [{ title: "Category:January 1, 2024" }, { title: "Category:Published" }];
    expect(() => normalizeWikinewsPage(page, wikinewsHtmlFixture, wikinewsFixtureSource(), rights.url, newsNow)).toThrow();
    expect(() => wikinewsPublicationDate([{ title: "Category:February 30, 2026" }])).toThrow();
    expect(() => normalizeWikinewsPage({ ...wikinewsPageFixture(), categories: [{ title: "Category:October 15, 2026" }] }, wikinewsHtmlFixture, wikinewsFixtureSource(), rights.url, newsNow)).toThrow();
  });
  it("uses public API requests with identifying headers, maxlag and a bounded source-scoped query", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(response(wikinewsQueryFixture())).mockResolvedValueOnce(policyResponse()).mockResolvedValueOnce(response(wikinewsParseFixture()));
    const page = await new WikinewsNewsProvider(wikinewsFixtureSource(), agent, { fetch: fetcher, sleep: async () => {} }, () => newsNow).fetchLatestArticles({ limit: 2 });
    expect(page.articles).toHaveLength(1); expect(fetcher).toHaveBeenCalledTimes(3);
    for (const [url, options] of fetcher.mock.calls) { expect(new URL(String(url)).origin).toBe("https://en.wikinews.org"); expect(new URL(String(url)).searchParams.get("maxlag")).toBe("5"); expect(options?.headers).toMatchObject({ "User-Agent": agent }); expect(options?.redirect).toBe("manual"); }
    expect(new URL(String(fetcher.mock.calls[0][0])).searchParams.get("gsrsearch")).toContain("Premier League");
  });
  it("requires a contact-bearing User-Agent before making any API request", async () => {
    expect(() => validateWikimediaUserAgent("node")).toThrow();
    const fetcher = vi.fn(); await expect(new WikinewsNewsProvider(wikinewsFixtureSource(), undefined, { fetch: fetcher, sleep: async () => {} }).fetchLatestArticles({ limit: 1 })).rejects.toMatchObject({ code: "USER_AGENT_REQUIRED" }); expect(fetcher).not.toHaveBeenCalled();
  });
  it("rejects malformed JSON/query/parse responses and missing API license data", async () => {
    for (const data of [{ query: {} }, { ...wikinewsQueryFixture(), query: { ...wikinewsQueryFixture().query, rightsinfo: { text: "", url: "" } } }]) {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(response(data)).mockResolvedValueOnce(policyResponse());
      await expect(new WikinewsNewsProvider(wikinewsFixtureSource(), agent, { fetch: fetcher, sleep: async () => {} }).fetchLatestArticles({ limit: 1 })).rejects.toBeInstanceOf(Error);
    }
    const malformed = vi.fn<typeof fetch>().mockResolvedValue(new Response("{bad", { headers: { "Content-Type": "application/json" } }));
    await expect(new WikinewsNewsProvider(wikinewsFixtureSource(), agent, { fetch: malformed, sleep: async () => {} }).fetchLatestArticles({ limit: 1 })).rejects.toMatchObject({ code: "MALFORMED" });
  });
  it.each([429, 503, 200])("honors quota/Retry-After/maxlag without immediate retries (HTTP %d)", async (status) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(status === 200 ? JSON.stringify({ error: { code: "maxlag" } }) : "", { status, headers: { "Content-Type": "application/json", "Retry-After": "600" } }));
    await expect(new WikinewsNewsProvider(wikinewsFixtureSource(), agent, { fetch: fetcher, sleep: async () => {} }).fetchLatestArticles({ limit: 1 })).rejects.toMatchObject({ code: "RATE_LIMITED", retryAfterMs: 600000 }); expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
